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

## Pre-requisite: Image Build

If the manifest's `build:` field is not null, the image must be built before deploying. Load the **`build-image`** skill first — it covers BuildKit, multi-core parallelism, registry push, tagging, and cache optimization.

## 10-Step Pipeline

| Step | Action | Tools |
|------|--------|-------|
| 1 | **Read manifest** — `atelier-butler/infra/manifests/<layer>/<container>.yml`. Missing = STOP. | Read |
| 2 | **Drift check** — compare manifest vs running state. Present diff. | `unraid_inspect_container`, `pihole_list_cnames`, `nginx_list_proxy_hosts`, `uptime-kuma_list_monitors` |
| 3 | **Fetch secrets** — for each `manifest.secrets[]`, get from Vaultwarden. For `shared:` refs, resolve via `stack.yml` `shared_secrets` → vault item + field. Memory only. | `vaultwarden_vault_get_password` |
| 4 | **Apply container** — write XML template to UNRAID, create container via `xmlToCommand` (see "Creating Managed Containers" below). | `unraid_run_command` |
| 5 | **Apply DNS + IPAM** — CNAME `service.3olive3.com → nginx.3olive3.com` in Pihole. Macvlan containers: A record instead + register IP in NetBox. | `pihole_add_cname`, `ipam_*` |
| 6 | **Apply proxy** — create/update NGINX proxy host. SSL forced, block exploits, WebSocket if needed. | `nginx_*` |
| 7 | **Validate firewall** — READ-ONLY check. Never create/modify — warn user instead. | `fortigate_get_policy` |
| 8 | **Apply monitoring** — Uptime Kuma monitor (MANDATORY, every container). Prometheus scrape job if `/metrics` exposed. | `uptime-kuma_create_monitor` |
| 9 | **Health check** — HTTP `curl -sf`, TCP `nc -z`, or skip for headless. | `unraid_run_command` |
| 10 | **Commit** — export XML, sanitize secrets (`Mask="true"` → `__VAULTWARDEN__`), commit to `atelier-butler` (infra/). | git |

## XML Template

Write to `/boot/config/plugins/dockerMan/templates-user/my-<Name>.xml`:

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>ServiceName</Name>
  <Repository>image:tag</Repository>
  <Network>atelier-network</Network>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Overview>Brief description.</Overview>
  <WebUI>http://[IP]:[PORT:8080]</WebUI>
  <Icon>https://raw.githubusercontent.com/.../icon.png</Icon>
  <ExtraParams>--restart unless-stopped</ExtraParams>
  <PostArgs/><CPUset/><DateInstalled/>

  <!-- Port: Type="Port" -->
  <Config Name="Web UI Port" Target="8080" Default="8080"
    Mode="tcp" Description="Web interface port"
    Type="Port" Display="always" Required="true" Mask="false">8080</Config>

  <!-- Volume: Type="Path" -->
  <Config Name="Config" Target="/config" Default="/mnt/user/appdata/servicename"
    Mode="rw" Description="Config directory"
    Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/servicename</Config>

  <!-- Secret: Type="Variable", Mask="true" -->
  <Config Name="API Key" Target="API_KEY" Default=""
    Mode="" Description="API key"
    Type="Variable" Display="always" Required="false" Mask="true"></Config>
</Container>
```

UNRAID auto-injects labels (`net.unraid.docker.managed=dockerman`, icon, webui) and env vars (`TZ`, `HOST_OS`, `HOST_HOSTNAME`, `HOST_CONTAINERNAME`) — but **only** when the container is created through its Docker Manager (see below).

## Creating Managed Containers

**CRITICAL:** Writing an XML template to disk is NOT enough. A raw `docker run` or `docker create` produces an **unmanaged** container — visible in `docker ps` but invisible/uneditable in the UNRAID web UI. The container MUST be created through UNRAID's Docker Manager so it injects the `net.unraid.docker.managed=dockerman` label and registers the container.

### Method: `xmlToCommand` via PHP script

UNRAID's Docker Manager uses `xmlToCommand()` (in `/usr/local/emhttp/plugins/dynamix.docker.manager/include/Helpers.php`) to convert an XML template into a proper `docker create` command with all required labels and env vars.

Use this helper script via `unraid_run_command`:

```bash
# 1. Write the XML template to UNRAID first:
#    /boot/config/plugins/dockerMan/templates-user/my-<Name>.xml

# 2. Create and upload the recreate script to /tmp/recreate-container.php:
cat > /tmp/recreate-container.php << 'PHPEOF'
<?PHP
$docroot = '/usr/local/emhttp';
$_SERVER['DOCUMENT_ROOT'] = $docroot;
$_SERVER['REQUEST_URI'] = '';
require_once "$docroot/webGui/include/Wrappers.php";
require_once "$docroot/plugins/dynamix.docker.manager/include/DockerClient.php";
require_once "$docroot/webGui/include/publish.php";
$var = parse_ini_file('/var/local/emhttp/var.ini');
$DockerClient = new DockerClient();
$custom = DockerUtil::custom();
$subnet = DockerUtil::network($custom);
$cpus = DockerUtil::cpus();
$containerName = $argv[1] ?? '';
$dryRun = ($argv[2] ?? '') === '--dry-run';
if (!$containerName) { echo "Usage: php recreate-container.php <name> [--dry-run]\n"; exit(1); }
$tmpl = "/boot/config/plugins/dockerMan/templates-user/my-{$containerName}.xml";
if (!file_exists($tmpl)) { echo "ERROR: Template not found: $tmpl\n"; exit(1); }
[$cmd, $Name, $Repository] = xmlToCommand($tmpl, !$dryRun);
if ($dryRun) { echo "DRY RUN: $Name\nCMD: $cmd\n"; exit(0); }
if ($DockerClient->doesContainerExist($Name)) {
  $info = $DockerClient->getContainerDetails($Name);
  if (!empty($info['State']['Running'])) { echo "Stopping $Name...\n"; $DockerClient->stopContainer($Name); }
  echo "Removing $Name...\n"; $DockerClient->removeContainer($Name);
}
$cmd = str_replace('/docker create ', '/docker run -d ', $cmd);
echo "Creating $Name...\n";
exec($cmd . ' 2>&1', $output, $retval);
echo implode("\n", $output) . "\n";
echo $retval === 0 ? "SUCCESS: $Name recreated.\n" : "ERROR: exit code $retval\n";
exit($retval);
PHPEOF

# 3. Dry-run first to verify the generated command:
php /tmp/recreate-container.php <container-name> --dry-run

# 4. Execute for real:
php /tmp/recreate-container.php <container-name>
```

### What `xmlToCommand` generates

From the XML template, it produces a `docker create` command that includes:
- `--name`, `--net`, `--pids-limit 2048`
- `-e TZ=... -e HOST_OS=Unraid -e HOST_HOSTNAME=... -e HOST_CONTAINERNAME=...`
- `-l net.unraid.docker.managed=dockerman` (UNRAID UI management label)
- `-l net.unraid.docker.webui=...` (WebUI link in UNRAID dashboard)
- `-l net.unraid.docker.icon=...` (icon in UNRAID dashboard)
- All ports (`-p`), volumes (`-v`), env vars (`-e`), and `ExtraParams`

### Renaming a container

When renaming, you MUST re-create through the Docker Manager — `docker rename` does NOT update labels:
1. Write the new XML template (with the new `<Name>`)
2. Run the recreate script for the new name (it stops+removes the old, creates the new)
3. Delete the old XML template: `rm /boot/config/plugins/dockerMan/templates-user/my-<OldName>.xml`

### Verifying management status

```bash
# Check if a container is managed by UNRAID:
docker inspect --format '{{index .Config.Labels "net.unraid.docker.managed"}}' <name>
# Should return: dockerman
```

## Monitoring Requirements

Every container gets an Uptime Kuma monitor:

| Container Type | Monitor Type | Target |
|---------------|-------------|--------|
| Web UI / API | HTTP(s) | `https://service.3olive3.com` |
| Database | TCP Port | `10.1.3.100:PORT` |
| Headless / Cron | Docker Container | container name, docker host #1 |
| Exporter | HTTP(s) | `http://10.1.3.100:PORT/metrics` |

Naming: `Service Name (Description)`. Interval: 60s HTTP/TCP, 120s Docker.

**Logs (automatic):** Promtail collects all container logs via Docker service discovery — no per-container config needed.

**Alerting:** Uptime Kuma notifications handle availability alerts (globally configured). For critical services that need custom alerts (error rate, resource exhaustion, SLO breaches), add Alertmanager rules in `atelier-butler/infra/configs/alertmanager/`.

## New Container Checklist

1. Create manifest in `atelier-butler/infra/manifests/<layer>/`
2. Add to `stack.yml`
3. Create Vaultwarden entries for secrets (or use `shared:` refs from `stack.yml` `shared_secrets`)
4. Run pipeline (steps 1-10)
5. Verify Uptime Kuma monitor exists
6. Create docs page: `home-docs/docs/server/containers/<name>.md`
7. Update `mkdocs.yml` nav
8. Trigger MkDocs sync: `unraid_run_command` → `/mnt/user/appdata/mkdocs-sync.sh`

## Removing a Container

1. Set `lifecycle.status: sunset` in manifest
2. Run pipeline — stops container, removes DNS, disables proxy, pauses monitor
3. Move manifest to `legacy/`

## Gotchas

- **`docker run` = unmanaged** — never use raw `docker run`/`docker create`. Always use `xmlToCommand` via the PHP script above. Unmanaged containers are invisible in UNRAID UI and lose edit/update/restart capability from the dashboard.
- **`docker rename` = still unmanaged** — renaming doesn't update labels. Must stop, remove, and re-create from XML.
- **No python3 on UNRAID** — use `jq`, `sed`, `awk`
- **SSH MCP 30s timeout** — long ops: `setsid /tmp/script.sh &>/dev/null < /dev/null &`
- **Icon caching** — change URL in XML to force re-download
- **Bind mount ownership** — check expected UID (e.g., `node` = 1000)
- **`docker inspect` exposes secrets** — never output to users
