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

## Source of Truth

```
~/Developer/atelier-butler/infra/
├── manifests/<layer>/<container>.yml   # Container desired state
├── stack.yml                           # Master inventory
├── templates/my-*.xml                  # UNRAID XML templates (sanitized)
└── configs/                            # Service configs
```

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

# Skip post-deploy prune:
bash .../deploy-container.sh <container-name> --skip-prune
```

**What the script does (automated 10 steps):**
1. Resolves container image, manifest, and XML template from the hard-coded table OR the manifest YAML (any container with a manifest works automatically)
2. Pulls the Docker image (skip with `--skip-pull`)
3. Reads `secrets:` block from the manifest YAML
4. Resolves all `vault_item:` secrets from Vaultwarden in **one batch call** (one login, one sync)
5. Creates a temp XML with secrets injected in place of `__VAULTWARDEN__` placeholders
6. Recreates the container via UNRAID's `xmlToCommand` PHP pipeline (managed container, UNRAID UI labels)
7. Applies `casalima.layer`, `casalima.manifest`, `casalima.deployed_at` Docker labels
8. Health-checks the container (HTTP or Docker status)
9. Prunes unused images

**Supported containers:** Any container that has a manifest file under `infra/manifests/<layer>/`. The script derives image, template name, and health URL by parsing the manifest YAML. Hard-coded entries (atelier-*, github-runner-*) take precedence.

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
    - host: /mnt/user/appdata/my-service
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
    monitor_id: null

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
  appdata: /mnt/user/appdata/my-service
  duplicacy: true
  critical: false

cost_center: default

owner:
  team: casa-lima
  contact: administrator@3olive3.com

lifecycle:
  status: active
  version_pinned: false

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
  type: http
  endpoint: "http://localhost:8080/"
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

  <Config Name="Config" Target="/config" Default="/mnt/user/appdata/my-service"
    Mode="rw" Description="Config directory"
    Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/my-service</Config>

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

### 7. Commit sanitized XML to git

```bash
# On UNRAID: export + sanitize
bash /mnt/user/repos/atelier-butler/infra/scripts/export-templates.sh
bash /mnt/user/repos/atelier-butler/infra/scripts/sanitize-templates.sh

# On dev machine: commit
cd ~/Developer/atelier-butler
git add infra/templates/my-my-service.xml infra/manifests/
git commit -m "feat(infra): add my-service container"
```

### 8. Create docs page

`home-docs/docs/server/containers/my-service.md` — update `mkdocs.yml` nav, trigger sync.

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
