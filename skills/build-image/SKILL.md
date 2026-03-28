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
4. **Push local images to registry** — any image built on UNRAID (not from Docker Hub/GHCR) must be pushed to `localhost:5000` so it survives daily cleanup.
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
| atelier-butler | `localhost:5000/atelier-butler:latest` | `/mnt/user/repos/atelier-butler` | `node:22-bookworm-slim` |
| atelier-butler-console | `localhost:5000/atelier-butler-console:latest` | `/mnt/user/repos/atelier-butler` | `node:22-bookworm-slim` |
| atelier-backend | `localhost:5000/atelier-backend:latest` | `/mnt/user/repos/atelier` | `swift:6.0-jammy` |
| atelier-sentinel | `localhost:5000/atelier-sentinel:latest` | `/mnt/user/repos/atelier` | `swift:6.0-jammy` |
| netbox-dhcp-sync | `localhost:5000/netbox-dhcp-sync:dev` | `.../infra/services/netbox-dhcp-sync` | `python:3-alpine` |

All other containers use `build: null` — pulled from Docker Hub or GHCR.

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
  -t localhost:5000/<image>:latest \
  <context>
```

**CPU quota:** `--cpu-quota=2000000` / `--cpu-period=100000` = 20 cores. UNRAID has 40 threads — 20 leaves headroom for running services.

## Tagging Conventions

| Scenario | Tag | Example |
|----------|-----|---------|
| Latest build | `latest` | `localhost:5000/atelier-butler:latest` |
| Git SHA | short SHA | `localhost:5000/atelier-butler:ac41ef1` |
| Semver release | `vX.Y.Z` | `localhost:5000/atelier-butler:v1.2.0` |

**Always double-tag:** the manifest's `container.image` (for local `xmlToCommand`) + `localhost:5000/<image>:latest` (for registry persistence).

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
docker push localhost:5000/<image>:<tag>

# Pull (Docker Hub mirrors are automatic via daemon config):
docker pull localhost:5000/<image>:<tag>
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
  -t localhost:5000/<image>:latest \
  <context> >> "$LOG" 2>&1
docker push localhost:5000/<image>:latest >> "$LOG" 2>&1
# Prune dangling images left by the build (old <none> layers)
docker image prune -f >> "$LOG" 2>&1
echo "Build finished: $(date)" >> "$LOG"
BUILDEOF
chmod +x /tmp/build-<image>.sh

# 2. Launch detached (survives SSH disconnect)
setsid /tmp/build-<image>.sh &>/dev/null < /dev/null &

# 3. Monitor progress (poll every 30s)
tail -20 /tmp/build-<image>.log
```

## BuildKit Cache Optimization

### Node.js

```dockerfile
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

### Python

```dockerfile
FROM python:3-alpine AS builder
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
COPY . .
```

### Swift SPM (mandatory for Swift builds)

Swift Package Manager re-downloads and recompiles all dependencies on every build unless you use BuildKit cache mounts. This turns **20-minute builds into ~1-minute incremental builds**.

**Three-step pattern:**

1. **Manifest-first copy** — copy only `Package.swift` (or the Docker-specific variant) so SPM resolution is cached until dependencies change.
2. **Stub source files** — create minimal `.swift` files per target so `swift package resolve` can build the package graph without full source.
3. **Cache mount on `.build/`** — persist the resolved dependencies and compiled modules across builds.

```dockerfile
# syntax=docker/dockerfile:1
FROM swift:6.0-jammy AS builder
WORKDIR /app

# 1) Copy ONLY the manifest — cached until Package.swift changes
COPY Package.docker.swift Package.swift

# 2) Create minimal stubs so SPM can resolve the package graph
#    (adjust paths to match your target structure)
RUN mkdir -p MyLib/Sources/MyLib MyApp/Sources/MyApp \
    && echo 'import Foundation' > MyLib/Sources/MyLib/_Stub.swift \
    && echo 'import Foundation' > MyApp/Sources/MyApp/_Stub.swift

# 3) Resolve deps with cache mount — only re-runs when Package.swift changes
RUN --mount=type=cache,target=/app/.build \
    swift package resolve

# 4) Copy full source — only this layer invalidates on code changes
COPY MyLib/ MyLib/
COPY MyApp/ MyApp/

# 5) Build with cache mount — incremental compilation reuses .build/
RUN --mount=type=cache,target=/app/.build \
    swift build -c release --product MyApp -j 20 \
    && cp .build/release/MyApp /usr/local/bin/MyApp

FROM swift:6.0-jammy-slim
COPY --from=builder /usr/local/bin/MyApp /usr/local/bin/MyApp
```

**Key details:**

- `-j 20` — use half of UNRAID's 40 cores (leaves headroom for services)
- `--mount=type=cache,target=/app/.build` — persists across builds within the BuildKit daemon
- If the project uses a Docker-specific manifest (e.g., `Package.docker.swift`), copy it as `Package.swift`
- System libraries (e.g., `CLinuxSQLite`) must be copied before the stub step
- The `cp .build/release/...` inside the cache-mounted RUN is required because cache mount contents are not available to `COPY --from=builder`

## Image Lifecycle

| Event | What happens |
|-------|-------------|
| Build completes | Push to `localhost:5000` + tag locally for `xmlToCommand` |
| Post-build | `docker image prune -f` (dangling only, NOT `-a`) — removes orphan `<none>` images |
| Daily cleanup (2AM) | `docker image prune -a --filter until=168h` — removes unused >7d |
| Registry GC (weekly Sun) | Garbage collection reclaims blob storage |
| Diun watch (6h) | Detects upstream updates for pulled images |

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
