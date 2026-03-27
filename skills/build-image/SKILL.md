---
name: build-image
description: "Build Docker images on UNRAID — BuildKit, multi-core parallelism, local registry push/pull, tagging conventions, cache optimization, and long-build patterns. Chains with deploy-container."
---

# Build Image

**Standard for building Docker images on UNRAID.** Covers local builds, the GitHub runner, and the local registry.

## Rules

1. **BuildKit ON** — always `DOCKER_BUILDKIT=1`. The old "BuildKit crashes on UNRAID" issue is resolved.
2. **Manifest is source of truth** — every locally-built image has a `build:` section in its manifest at `atelier-butler/infra/manifests/<layer>/<container>.yml`. Read it first.
3. **Tag must match manifest** — `container.image` in the manifest = the tag you build. XML `<Repository>` must match exactly.
4. **Push local images to registry** — any image built on UNRAID (not from Docker Hub/GHCR) must be pushed to `registry.3olive3.com` so it survives weekly cleanup.
5. **No secrets in build args** — use multi-stage builds or runtime env vars instead.
6. **Present the plan** before executing.

## Manifest `build:` Schema

```yaml
# In atelier-butler/infra/manifests/<layer>/<container>.yml
container:
  image: atelier-butler:latest         # Tag to build — must match exactly
build:
  context: /mnt/user/repos/<repo>      # Build context on UNRAID
  dockerfile: <path>/Dockerfile        # Relative to context
  base_images:                         # Base images used in FROM
    - node:22-bookworm-slim
```

`build: null` = pulled image (Docker Hub/GHCR), no build needed.

### Locally-Built Containers (5 total)

| Container | Image | Context | Base |
|-----------|-------|---------|------|
| atelier-butler | `atelier-butler:latest` | `/mnt/user/repos/atelier-butler` | `node:22-bookworm-slim` |
| atelier-butler-console | `atelier-butler-console:latest` | `/mnt/user/repos/atelier-butler` | `node:22-bookworm-slim` |
| atelier-backend | `ghcr.io/3olive3/atelier-backend:latest` | `/mnt/user/repos/atelier` | `swift:6.0-jammy` |
| atelier-sentinel | `atelier-sentinel:latest` | `/mnt/user/repos/atelier` | `swift:6.0-jammy` |
| netbox-dhcp-sync | `netbox-dhcp-sync:latest` | `.../infra/services/netbox-dhcp-sync` | `python:3-alpine` |

All other 57 containers use `build: null` — pulled from Docker Hub or GHCR.

## Build Environments

### Direct SSH Build (via `unraid_run_command`)

For ad-hoc or agent-triggered builds. Subject to MCP SSH 30s timeout — use the setsid pattern for anything over ~20s.

### GitHub Actions Runner (`github-runner`)

Self-hosted runner on UNRAID (`myoung34/github-runner:latest`), bridge network, Docker socket mounted. Builds triggered by GitHub Actions workflows. Has read-only access to `/mnt/user/repos`.

Manifest: `infra/manifests/containers/github-runner.yml`. Runner shares the host Docker daemon via socket — registry mirror config in `/boot/config/docker.cfg` applies automatically.

## Build Command

```bash
# Read build: section from manifest first, then:
DOCKER_BUILDKIT=1 docker build \
  --cpu-period=100000 --cpu-quota=2000000 \
  -f <dockerfile> \
  -t <container.image> \
  -t registry.3olive3.com/<image>:latest \
  <context>
```

**CPU quota:** `--cpu-quota=2000000` / `--cpu-period=100000` = 20 cores. UNRAID has 40 threads — 20 leaves headroom for running services.

## Tagging Conventions

| Scenario | Tag | Example |
|----------|-----|---------|
| Latest build | `latest` | `registry.3olive3.com/atelier-butler:latest` |
| Git SHA | short SHA | `registry.3olive3.com/atelier-butler:ac41ef1` |
| Semver release | `vX.Y.Z` | `registry.3olive3.com/atelier-butler:v1.2.0` |

**Always double-tag:** the manifest's `container.image` (for local `xmlToCommand`) + `registry.3olive3.com/<image>:latest` (for registry persistence).

## Local Registry

| Field | Value |
|-------|-------|
| Internal | `registry.3olive3.com` (Pihole CNAME → NGINX → port 5000) |
| Direct | `10.1.3.100:5000` |
| Storage | `/mnt/user/registry/` (array disk, not cache SSD) |
| Mode | Pull-through cache (Docker Hub) + hosted (local images) |
| Manifest | `infra/manifests/containers/registry.yml` |

### Push / Pull

```bash
# Push after build:
docker push registry.3olive3.com/<image>:<tag>

# Pull (Docker Hub mirrors are automatic via daemon config):
docker pull registry.3olive3.com/<image>:<tag>
```

## Long Build Pattern (SSH Timeout)

MCP SSH commands timeout at 30s. For builds exceeding this:

```bash
# 1. Write build script to /tmp
cat > /tmp/build-<image>.sh << 'BUILDEOF'
#!/bin/bash
set -euo pipefail
LOG="/tmp/build-<image>.log"
echo "Build started: $(date)" > "$LOG"
DOCKER_BUILDKIT=1 docker build \
  --cpu-period=100000 --cpu-quota=2000000 \
  -f <dockerfile> \
  -t <container.image> \
  -t registry.3olive3.com/<image>:latest \
  <context> >> "$LOG" 2>&1
docker push registry.3olive3.com/<image>:latest >> "$LOG" 2>&1
echo "Build finished: $(date)" >> "$LOG"
BUILDEOF
chmod +x /tmp/build-<image>.sh

# 2. Launch detached (survives SSH disconnect)
setsid /tmp/build-<image>.sh &>/dev/null < /dev/null &

# 3. Monitor progress (poll every 30s)
tail -20 /tmp/build-<image>.log
```

## BuildKit Cache Optimization

```dockerfile
# Cache mounts for package managers
RUN --mount=type=cache,target=/root/.npm npm ci --production
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# Multi-stage — keep final image small
FROM node:22-bookworm-slim AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

## Image Lifecycle

| Event | What happens |
|-------|-------------|
| Build completes | Push to `registry.3olive3.com` + tag locally for `xmlToCommand` |
| Weekly cleanup (Sun 2AM) | `docker image prune -a --filter until=168h` — removes unused >7d |
| Registry GC (weekly) | Garbage collection reclaims blob storage |
| Diun watch (6h) | Detects upstream updates for pulled images |
| Post-build | `docker image prune -f` (dangling only, NOT `-a`) |

## Chaining with deploy-container

This skill produces images. The `deploy-container` skill deploys them:

1. **Read manifest** — check if `build:` is not null
2. **build-image**: `docker build` → `docker push` to registry
3. **deploy-container**: XML template → `xmlToCommand` → running container

## Gotchas

- **Tag mismatch** — `container.image` in manifest must match what you build AND the XML `<Repository>`. Mismatches = container won't start.
- **No python3 on UNRAID** — build scripts must use bash/jq/sed.
- **Socket mount** — GitHub runner uses `/var/run/docker.sock`. Builds share the host daemon. No Docker-in-Docker.
- **Cache invalidation** — `COPY . .` busts all subsequent layers. Copy dependency files first.
- **Multi-platform** — UNRAID is x86_64 only. No `--platform` needed.
- **Disk space** — monitor `/mnt/user/registry/` growth. Registry GC needs a cron job.
