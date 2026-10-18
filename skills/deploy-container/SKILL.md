---
name: deploy-container
description: "The ONLY official way to deploy, update, or redeploy containers on UNRAID. Reads the manifest from atelier-butler/infra as the single source of truth and applies container, DNS, proxy, monitoring, and secrets."
---

# Deploy Container

**MANDATORY for all container operations on UNRAID.** No exceptions.

## Rules

1. **No manifest, no deploy.** Create one in `atelier-butler/infra/manifests/` first.
2. **No raw `docker run` or `docker create`.** Use XML templates — raw containers are unmanaged in UNRAID UI.
3. **No firewall changes** without explicit user approval.
4. **No secrets** in git, logs, or chat. Fetch from Vaultwarden at deploy time.
5. **Present the plan** before executing.
6. **Never recreate a container from Unraid's UI** — not Update, Force update, or Edit → Apply. They rebuild it from the boot-config XML, where every vault-backed secret is the literal `__VAULTWARDEN__`; only `deploy-container.sh` fills the real values in. The container then usually keeps running on the placeholder and nothing notices (2026-10-11: four found, one of them Vaultwarden's own admin token). Updates and recreates go through Butler — Console → **Containers** (Update / Recreate, with approval) or `unraid.update_container` / `unraid.redeploy_container`. Start, Stop and Restart in Unraid are fine: they reuse the existing container.
7. **Every `__VAULTWARDEN__` in the template must be declared** under `secrets:` in the manifest. Since 2026-10-11 `deploy-container.sh` refuses to deploy with any left over and names it; before that, an undeclared one (mariadb `MYSQL_PASSWORD`) was deployed as the literal placeholder without a word. `ContainerOnPlaceholderSecret` alerts on any running container that has one.

## Container standards (enforced — 2026-10-11)

Every container must meet all eight. They are checked in **three places**, with the same rules, so a new service cannot skip one:

| Standard | What the manifest / box must have |
|---|---|
| **manifest** | A manifest whose `name:` equals its file name, with `layer`, `container.image`, `container.template` |
| **deployed** | Created by `deploy-container.sh` (carries the `casalima.manifest` label) — never Unraid's UI (rule 6) |
| **secrets** | Every `__VAULTWARDEN__` in the template declared under `secrets:` (`env:` + `vault_item:`/`value:`, or `env_prefix:` + `vault_prefix:`). An entry without `env:` is **silently skipped** by the deploy |
| **storage** | No read-write bind through `/mnt/user/appdata` or `/mnt/user/system` — use `/mnt/cache/...` (Incident B) |
| **monitored** | `observability.uptime_kuma.monitor_id: <n>` naming a monitor that exists — or `exempt_reason:` saying why not |
| **updates** | `lifecycle.version_pinned: false` (Diun tracks it) or `true` with a comment saying why it is pinned |
| **backup** | `backup.duplicacy: true` or `false` — an explicit decision (`false` + comment for stateless services) |
| **git** | The sanitized template exported to `infra/templates/` (step 7 below) |

| Where | What happens |
|---|---|
| **PR** — `Container standards` GitHub check | `infra/scripts/lint-manifests.sh` on the manifests the PR changes. Fails the PR |
| **Deploy** — `deploy-container.sh` step 0 | Same lint before anything is pulled or recreated. **Refuses to deploy** and names each problem. `--allow-nonstandard` exists for emergencies and logs that it was used. After a deploy it prints the container's live scorecard ("standards still owed: monitored git") |
| **Live** — `container-inventory.sh --prom`, every 15 min | `casa_container_standard{name,check}`; **`ContainerStandardViolation`** fires after 6 h. The Console **Containers** page shows a "Normas" column and filter |

Run the lint yourself before opening a PR: `bash infra/scripts/lint-manifests.sh infra/manifests/<layer>/<name>.yml` (needs `yq` v4 — on UNRAID it is installed).

**Order for a new service**, so nothing is ever owed: create the Uptime Kuma monitor **first** (a Docker Container monitor can exist before the container — it shows down for a minute), put its number in `monitor_id` → write the manifest and template → `lint-manifests.sh` → PR → deploy → export the template to git. The deploy's scorecard tells you if anything is still owed. `exempt_reason:` is for services that genuinely have nothing to monitor, not for "later".

## Source of Truth

```
~/Developer/atelier-platform/atelier-butler/infra/
├── manifests/<layer>/<container>.yml   # Container desired state
├── stack.yml                           # Master inventory
├── templates/my-*.xml                  # UNRAID XML templates (sanitized)
└── configs/                            # Service configs
```

## Bind Path Conventions (MANDATORY)

Pick the host-path prefix that matches the share's `useCache` policy. **Wrong prefix triggers the shfs FUSE POSIX-lock bug** (RCA: Incident B 2026-05-26) which can cascade into a system-wide deadlock.

| Share `useCache` | Examples | Required host prefix | Why |
|---|---|---|---|
| `only` | `appdata`, `system` | **`/mnt/cache/<share>/`** | Data is guaranteed on cache; using `/mnt/user/...` routes `flock()` through shfs FUSE which has an orphan-lock bug. Going direct to btrfs bypasses it. |
| `no` | `Media`, `Downloads`, `registry`, `Backups` | **`/mnt/user/<share>/`** | Data lives on the array; `/mnt/cache/<share>` would miss everything. |
| `prefer` / `yes` | `repos`, `domains` | `/mnt/user/<share>/` (default) | Could spill to array. Only migrate to `/mnt/cache/` if you also change share policy to `useCache=only` AND verify nothing is on `/mnt/disk*/<share>/`. |

**Check a share's policy:** `cat /boot/config/shares/<name>.cfg | grep shareUseCache`

**Common mistake (do NOT do this):**
```yaml
container:
  volumes:
    - host: /mnt/cache/appdata/my-service   # ❌ WRONG — uses shfs FUSE for flock
      container: /config
```

**Correct:**
```yaml
container:
  volumes:
    - host: /mnt/cache/appdata/my-service  # ✓ direct btrfs, no FUSE
      container: /config
```

The same rule applies to `backup.appdata` and to the `Default=` / value attributes in the XML template's `<Config Type="Path">` entries.

**Validation:** `deploy-container.sh` lints the manifest before deploy and aborts with a clear error if it finds a bind to `/mnt/user/<cache-only-share>/`. Run `infra/scripts/audit-bind-paths.sh` periodically to detect drift across all templates + running containers.

## Primary Deploy Method: `deploy-container.sh`

The script is at `infra/scripts/deploy-container.sh` and lives in the repo at:
```
/mnt/user/repos/atelier-butler/infra/scripts/deploy-container.sh
```

```bash
# Deploy (or redeploy) any container:
bash /mnt/user/repos/atelier-butler/infra/scripts/deploy-container.sh <container-name>

# Skip image pull (useful when image didn't change):
bash .../deploy-container.sh <container-name> --skip-pull

# Only re-run the manifest's post-update check (after a manual fix):
bash /mnt/user/repos/atelier-butler/infra/scripts/deploy-container.sh <name> --post-update-only

# Skip post-deploy prune:
bash .../deploy-container.sh <container-name> --skip-prune
```

!!! danger "The container is recreated from the BOOT XML — what is synced for you and what is not"
    `deploy-container.sh` recreates the container from `/boot/config/plugins/dockerMan/templates-user/my-<name>.xml`, **every field of it**. It never reads the git copy `infra/templates/*.xml` (a one-way export mirror, boot → git, via `export-templates.sh` + `sanitize-templates.sh`).

    **The image is synced automatically (since 2026-10-18).** The manifest's `container.image` is the source of truth. Before the recreate, if the boot XML's `<Repository>` differs from it (`x` and `x:latest` count as the same), the script backs the boot XML up (`my-<name>.xml.bak-<timestamp>-image-sync`, root-only on `/boot`), rewrites `<Repository>`, reads it back, and logs one line: `boot XML image synced: <old> → <new> (manifest is the source; backup …)`. Why: on 2026-10-18 an atelier-bridge PR bumped the image in the manifest and the git XML; the deploy pulled 2.1.302, logged "Image: …2.1.302", passed its health check — and recreated the container on **2.1.292**, because the boot XML still said so. Only `docker inspect` showed it.

    **Mounts, env, ports, network and every other field are NOT synced.** They carry `__VAULTWARDEN__` placeholders and live values git never sees, so the script only **reports** drift: a `WARNING` listing each difference between the git template and the boot XML (`Config Path:/x: in git, missing on the box`, `Network: git=… boot=…`; masked and `__VAULTWARDEN__` values are ignored, Variable values are named but never printed). Nothing is applied. 2026-08-14: PR #185 added a `tokens.json` mount to the git template; the deploy silently omitted it because the boot XML was never updated. To apply such a change, edit the boot XML by hand after backing it up:
    ```bash
    X=/boot/config/plugins/dockerMan/templates-user/my-<name>.xml
    cp -p "$X" "$X.bak-$(date +%Y%m%d-%H%M%S)"
    # add/change the Config entries in $X — never paste real secret values; keep __VAULTWARDEN__
    ```
    Then deploy, and check that the drift WARNING is gone.

    **A deploy is verified by `docker inspect`, not by the log.** After the recreate the script checks the new container: its ID changed, it started after the deploy began, `.Config.Image` is the manifest image, and its image ID is the one that tag points to locally. If any of these fails, it prints `=== DEPLOYMENT FAILED ===` and, as the last line, `Image check failed: <reason>`, then exits **3**. The old image is not pruned. The batch updater, the Console/MCP jobs and `ci-deploy.sh` all treat that as a failure. `ci-deploy.sh` excuses other non-zero exits when the ID changed, but never exit 3. The final summary's `Image:` line is what `docker inspect` reports, not the manifest value. For mounts and env, which nothing checks automatically, verify them yourself with `docker inspect <name>` (never paste its output anywhere: it holds the secrets).

**What the script does:**
1. Resolves image, manifest and template. **The manifest's `container.image` wins**: the hard-coded table (atelier-*, github-runner-*) only supplies the template, manifest and health URL names
2. Checks the container standards (`lint-manifests.sh`), then pulls the image (skip with `--skip-pull`; `localhost:5000/…` is never pulled)
3. **Syncs the boot XML's `<Repository>` to the manifest image** (backup first), and **reports** any other drift between the git template and the boot XML (never applied)
4. Reads the `secrets:` block and resolves all `vault_item:` secrets in **one batch call** (one login, one sync)
5. Creates a temp XML with secrets injected in place of `__VAULTWARDEN__` placeholders (refuses if any is left)
6. Recreates the container via UNRAID's `xmlToCommand` PHP pipeline, with the `casalima.layer`, `casalima.manifest` and `casalima.deployed_at` labels
7. **Verifies the running image with `docker inspect`**: new ID, fresh start, manifest image reference and image ID. Otherwise DEPLOYMENT FAILED, exit 3
8. Health-checks the container (HTTP, TCP or running state), then runs `lifecycle.post_update` if the manifest declares one
9. Prunes unused images, and prints the summary with the **actual running image**

**Supported containers:** Any container that has a manifest file under `infra/manifests/<layer>/`. The script derives image, template name, and health URL by parsing the manifest YAML. Hard-coded entries (atelier-*, github-runner-*) take precedence for the template name and health URL, never for the image.

## Creating a New Container — Full Workflow

### 1. Create the manifest

Create `atelier-butler/infra/manifests/<layer>/<container-name>.yml`:

```yaml
name: my-service
stack: <stack-name>
layer: <infrastructure|applications|media|network|containers|smarthome|gaming>
ui_folder: <UNRAID UI folder name>
description: "What this does"

container:
  image: author/image:tag
  port: 8080
  network: bridge
  volumes:
    - host: /mnt/cache/appdata/my-service
      container: /config
      mode: rw
  template: templates/my-my-service.xml

configs: []

secrets:
  - env: API_KEY
    vault_item: "My Service API Key"   # Exact name of Vaultwarden item
    field: password                    # password (default) or username
  - env: ADMIN_PASSWORD
    vault_item: "My Service Admin"

observability:
  scrape: none                # or: {job: ..., metrics_path: /metrics, port: 8080}
  logs: true
  dashboard: null
  alerts: []
  uptime_kuma:
    monitor_id: null           # REQUIRED: the Uptime Kuma monitor number — create the monitor first

dns:
  internal:
    record: my-service.3olive3.com
    type: CNAME
    target: nginx.3olive3.com
  external: []

proxy:
  enabled: true
  domain: my-service.3olive3.com
  upstream: "10.1.3.100:8080"
  ssl: force
  access_list: null

network:
  vlan: MGT
  ip: null
  firewall: []

backup:
  appdata: /mnt/cache/appdata/my-service
  duplicacy: true                      # explicit decision; false + a comment for stateless services
  duplicacy: true
  critical: false

cost_center: default

owner:
  team: casa-lima
  contact: administrator@3olive3.com

lifecycle:
  status: active
  version_pinned: false
  # Optional hooks (cases in infra/scripts/update-hooks.sh, run from the repo root with CONTAINER set):
  # update_guard: "bash infra/scripts/update-hooks.sh plex-idle"        # batch: not safe now → SKIPPED
  # pre_update:   "bash infra/scripts/update-hooks.sh backup-sqlite DB"  # batch: backup fails → batch stops
  # post_update:  "bash infra/scripts/update-hooks.sh homebridge-advertising"  # every deploy, see below

tier: 3

docs:
  home_docs:
    - server/containers/my-service.md
  runbook: null

external:
  public: false
  cloudflare_tunnel: false

tags: []

health_check:
  type: http                 # http | tcp | docker | none
  endpoint: "http://localhost:8080/"   # HOST port: the check runs on UNRAID, not in the container
  # host: my-service.3olive3.com       # if the app rejects Host: localhost (Django ALLOWED_HOSTS → 400)
  # timeout: 180                       # seconds; default 30. Slow starters (DBs, Django) need more
  interval: 30s

resources:
  cpu_limit: null
  memory_limit: null

dependencies: []
startup_order: 50
```

### 2. Create Vaultwarden items for each secret

For each entry in `secrets:`, the vault item must exist **before** running the deploy script.

```
vault_item: "My Service API Key"  →  Vaultwarden login item named exactly "My Service API Key"
                                      password field = the actual API key
```

Use the `vault-access` skill or the Vaultwarden MCP to create items.

### 3. Write the XML template

Create the XML at `/boot/config/plugins/dockerMan/templates-user/my-<name>.xml` on UNRAID.

For every secret in `manifest.secrets[]`, the XML **must** have a `Config` entry with:
- `Target="<env-name>"` matching the manifest `env:` key exactly
- `Mask="true"` (hides value in UNRAID UI)
- Value set to `__VAULTWARDEN__` (the placeholder the deploy script replaces)

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>my-service</Name>
  <Repository>author/image:tag</Repository>
  <Network>bridge</Network>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Overview>What this does</Overview>
  <WebUI>http://[IP]:[PORT:8080]/</WebUI>
  <Icon>https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/service.png</Icon>
  <ExtraParams>--restart unless-stopped</ExtraParams>
  <PostArgs/><CPUset/><DateInstalled/>

  <Config Name="Web UI Port" Target="8080" Default="8080"
    Mode="tcp" Description="Web interface port"
    Type="Port" Display="always" Required="true" Mask="false">8080</Config>

  <Config Name="Config" Target="/config" Default="/mnt/cache/appdata/my-service"
    Mode="rw" Description="Config directory"
    Type="Path" Display="always" Required="true" Mask="false">/mnt/cache/appdata/my-service</Config>

  <!-- Secrets: value must be __VAULTWARDEN__ — injected at deploy time -->
  <Config Name="API Key" Target="API_KEY" Default=""
    Mode="" Description="API key (injected from Vaultwarden)"
    Type="Variable" Display="always" Required="true" Mask="true">__VAULTWARDEN__</Config>

  <Config Name="Admin Password" Target="ADMIN_PASSWORD" Default=""
    Mode="" Description="Admin password (injected from Vaultwarden)"
    Type="Variable" Display="always" Required="true" Mask="true">__VAULTWARDEN__</Config>

  <Config Name="TZ" Target="TZ" Default="Europe/Lisbon"
    Mode="" Description="Timezone"
    Type="Variable" Display="always" Required="false" Mask="false">Europe/Lisbon</Config>
</Container>
```

**Critical:** XML `Target="API_KEY"` must match manifest `env: API_KEY` exactly.

### 4. Add to `stack.yml`

Add the container to `atelier-butler/infra/stack.yml` under the appropriate stack.

### 5. Deploy

```bash
bash /mnt/user/repos/atelier-butler/infra/scripts/deploy-container.sh my-service
```

The script will:
- Auto-detect the manifest from `infra/manifests/<layer>/my-service.yml`
- Resolve all secrets from Vaultwarden in one batch
- Inject secrets into a temp XML
- Recreate the container as managed (UNRAID UI visible + labeled)
- Health-check and report

### 6. Apply DNS, proxy, monitoring (manual steps)

After deploy, complete the remaining pipeline steps using MCPs:

```bash
# DNS: add CNAME in FortiGate DNS Database (zone 3olive3-com, domain 3olive3.com)
# Dedicated MCP tools are pending — use curl from UNRAID (token in vault item "Fortigate 60F", butler-api user):
curl -sk -X POST -H "Authorization: Bearer $FG_TOKEN" -H "Content-Type: application/json" \
  -d '{"hostname":"my-service","type":"CNAME","canonical-name":"nginx.3olive3.com","status":"enable"}' \
  "https://10.1.1.254/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry"

# Proxy: create NGINX proxy host
nginx_create_proxy_host(domain="my-service.3olive3.com", upstream="10.1.3.100:8080", ssl=true)

# Monitoring: create Uptime Kuma monitor
uptime_kuma_create_monitor(name="My Service (description)", url="https://my-service.3olive3.com", interval=60)
```

!!! warning "NPM cannot reach a new port until the FortiGate allows it"
    NPM sits in the DMZ (10.10.10.1) and reaches TOWER through FortiGate policy #50, which allows only the ports in the service group `3OLIVE3_NGINX_PROXY`. A new published port needs a service object (`Name_PORT`) added to that group. Until then the proxy times out, even though the container answers locally. Authentik :9000 hit this on 2026-10-11, and `check-service-wiring.sh` reports it as `dead_proxy`. This is a firewall change: present it and get explicit approval first. `update_service_group` replaces the member list, so send the existing members plus the new one, then re-list the group.

### 7. Commit sanitized XML to git

```bash
# On UNRAID: export + sanitize
bash /mnt/user/repos/atelier-butler/infra/scripts/export-templates.sh
bash /mnt/user/repos/atelier-butler/infra/scripts/sanitize-templates.sh

# On dev machine: commit
cd ~/Developer/atelier-platform/atelier-butler
git add infra/templates/my-my-service.xml infra/manifests/
git commit -m "feat(infra): add my-service container"
```

### 8. Create docs page

`home-docs/docs/server/containers/my-service.md` — update `mkdocs.yml` nav, trigger sync.

## Post-update check (`lifecycle.post_update`, 2026-10-17)

The health check proves the container **answers**. It cannot prove it **does its
job**: Homebridge 2.4 passed it on 2026-10-11 and published nothing over mDNS for
~6 days. When the job can be checked, declare a `post_update` command:

- `deploy-container.sh` runs it on **every** deploy (single, batch, Console, MCP)
  **after the health check and before the prune**. It is retried for up to
  `POST_UPDATE_TIMEOUT` (90 s).
- Exit 0 means done. Non-zero means **DEPLOYMENT FAILED**. The command must print the reason
  as its **last line**; that is what the Console job view and the batch summary
  show.
- Nothing is rolled back automatically: the new container stays and the old
  image is kept. Deciding to go back is the human's call.
- It writes `casa_post_update_check_ok{container}`. A `0` fires
  `ContainerPostUpdateCheckFailed`, which opens a Butler incident (inbox and Telegram).
- After a manual fix: `deploy-container.sh <name> --post-update-only` re-runs
  just the check and clears the alert when it passes.

Write new checks as cases in `infra/scripts/update-hooks.sh`, read-only and
proven once against a deliberately wrong expectation.

## Config files (`configs:` block)

`deploy-container.sh` applies the manifest's `configs:` block, with two safety properties that matter:

**Substitution is declared-keys-only.** Placeholders are resolved from a `config_substitutions:` block in the manifest — never a blanket `envsubst`. These files contain Go templates (`{{ $value | printf }}`) and relabel backreferences (`$1`) that a broad substitution would corrupt. A placeholder that survives rendering aborts the write, so a literal can never reach the host.

**Applying is opt-in.** Without `--apply-configs` the script reports drift with a diff and writes nothing, because a routine deploy silently reverting a live hand-edit is worse than the drift itself.

```yaml
configs:
  - src: configs/alertmanager/alertmanager.yml
    dest: /mnt/cache/appdata/alertmanager/config/alertmanager.yml
    reload: "curl -s -X POST http://localhost:9093/-/reload"

config_substitutions:
  - key: SMTP_TO
    value: "administrator@3olive3.com"     # literal
  - key: BUTLER_INGEST_TOKEN
    vault_item: "Butler Ingest Token"      # from Vaultwarden
  - key: IPMI_USERNAME
    vault_item: "HPE Server iLO (DL380 Gen9)"
    field: username                        # default is password
```

Placeholders in the config file may be written `__VAULTWARDEN__KEY`, `${KEY}` or `$KEY`.

| Command | Effect |
|---|---|
| `deploy-container.sh <name>` | Normal deploy; reports config drift, writes nothing |
| `deploy-container.sh <name> --apply-configs` | Deploy and write configs, then run `reload:` |
| `deploy-container.sh <name> --configs-only` | Audit drift only — container untouched |
| `deploy-container.sh <name> --configs-only --apply-configs` | Write configs + reload, no container bounce |
| `deploy-container.sh <name> --skip-configs` | Ignore configs entirely |

!!! warning "A declared key is substituted everywhere, comments included"
    Writing `$BUTLER_INGEST_TOKEN` in a comment puts the real secret in that comment on the host. Name keys without the `$` in prose.

!!! tip "Audit drift routinely"
    `--configs-only` exists so drift can be checked without recreating a container. The first run of it found two live-only Prometheus settings that had never been committed — an entire alert group, and an `ipmi` module value that git would have reverted.

!!! note "Vaultwarden rate-limits repeated runs"
    Each run does a fresh vault login; several in quick succession return HTTP 429. The script fails closed (no file written) — wait a minute and retry.

## Secrets Reference

| Manifest key | Deploy behavior |
|---|---|
| `vault_item: "Name"` + `field: password` | Fetches password field from Vaultwarden item "Name" |
| `vault_item: "Name"` + `field: username` | Fetches username field from Vaultwarden item "Name" |
| `value: "literal"` | Injects literal value (non-secret, convenience only) |
| `shared: companion_jwt.secret` | ⚠️ Not yet implemented — skipped with WARN |

All `vault_item:` entries are resolved in a **single Vaultwarden session** (one login, one sync), regardless of how many secrets the manifest declares. Item names must match exactly (case-insensitive search).

The script fails if a `vault_item:` entry does not exist in Vaultwarden. Create the item first.

## Shared Secrets (`stack.yml`)

Some secrets are shared across containers (e.g., `BUTLER_JWT_SECRET`, `COMPANION_JWT_SECRET`). They are defined once in `infra/stack.yml` under `shared_secrets:`:

```yaml
shared_secrets:
  companion_jwt:
    vault_item: "Butler JWT Secret"
    field: password
```

In manifests: `shared: companion_jwt.secret` (format: `<key>.<field>`). **Note:** `shared:` resolution is not yet implemented in `deploy-container.sh` — it logs a warning and skips. For now, reference vault directly with `vault_item:`.

## Monitoring Requirements

Every container gets an Uptime Kuma monitor:

| Container Type | Monitor Type | Target |
|---|---|---|
| Web UI / API | HTTP(s) | `https://service.3olive3.com` |
| Database | TCP Port | `10.1.3.100:PORT` |
| Headless / Cron | Docker Container | container name, docker host #1 |
| Exporter | HTTP(s) | `http://10.1.3.100:PORT/metrics` |

Naming: `Service Name (Description)`. Interval: 60s HTTP/TCP, 120s Docker.

## Removing a Container

1. Set `lifecycle.status: sunset` in manifest
2. Stop and remove container, remove DNS CNAME, disable proxy host, pause Uptime Kuma monitor
3. Move manifest to `legacy/` directory

## Low-Level: Manual `xmlToCommand` (fallback)

Use this only when `deploy-container.sh` is unavailable or for troubleshooting. The script calls this internally.

```bash
# The script is auto-created at /tmp/recreate-container.php by deploy-container.sh
# To invoke manually:
php /tmp/recreate-container.php <TemplateName> <ManifestName> [--dry-run] [/path/to/xml-override]

# Example dry-run to preview the docker command:
php /tmp/recreate-container.php my-service my-service --dry-run
```

## Gotchas

- **`docker run` = unmanaged** — never use raw `docker run`/`docker create`. Always use `xmlToCommand` via the deploy script. Unmanaged containers are invisible in UNRAID UI and lose edit/update/restart capability.
- **`__VAULTWARDEN__` must be in XML** — if you add a `secrets:` entry to the manifest but forget the `Target="ENV_NAME"` placeholder in the XML, the secret is resolved from Vaultwarden but silently not injected (no XML match = no replacement).
- **Vault item name must be exact** — `vault_item: "My Service"` fails if the Vaultwarden item is named `"My service"` (case-insensitive match, but substring won't work).
- **`docker rename` = still unmanaged** — renaming doesn't update labels. Must stop, remove, and re-create from XML.
- **No python3 on UNRAID** — use `jq`, `sed`, `awk`
- **SSH MCP 30s timeout** — long ops: `setsid /tmp/script.sh &>/dev/null < /dev/null &`
- **Icon caching** — change URL in XML to force re-download
- **`docker inspect` exposes secrets** — never output to users
- **Git template edits reach the deploy only for the image** — see the danger box under "Primary Deploy Method". The script syncs the boot XML's `<Repository>` to the manifest image by itself; mounts, env and other fields changed in `infra/templates/*.xml` are only **reported** as drift and must be put into the boot XML by hand (back it up first). A deploy counts as done when `docker inspect` shows the change, not when the log says SUCCESS.
- **Exit 3 = the container is not on the manifest image.** It was recreated, but `docker inspect` disagrees with the manifest (the last log line says why). Do not retry blindly; read the reason. `DEPLOY_SIMULATE_STALE_BOOT_XML=1` exists only for `infra/scripts/tests/deploy-container-image-truth.sh`.
- **Config files are NOT auto-applied** — the `configs:` block only takes effect with `--apply-configs`. This is deliberate (see "Config files" above), but it means merging a config change to git does not deploy it. Different from the XML gotcha directly above: XML needs a manual *sync*, configs need an explicit *flag*.
- **A declared substitution key is replaced everywhere in the file, comments included.** Writing `$SOME_SECRET` in a comment writes the real secret into that comment on the host. Refer to keys without the `$` in prose.
- **Bind paths matter** — `appdata`/`system` shares (cache-only) **must** use `/mnt/cache/<share>/` prefix. Using `/mnt/user/<share>/` routes through shfs FUSE which has a known POSIX-lock orphan bug that can wedge the entire system. See "Bind Path Conventions" section above.
