---
name: build-image
description: "Build Docker images on UNRAID — BuildKit, build speed (fsync on docker.img, apt/npm/pip cache mounts, tmpfs for CI), local registry push/pull, tagging conventions, cache optimization, and long-build patterns. Chains with deploy-container."
---

# Build Image

**Standard for building Docker images on UNRAID.** Covers local builds, the GitHub runner, and the local registry.

## Rules

1. **BuildKit ON** — always `DOCKER_BUILDKIT=1`. The old "BuildKit crashes on UNRAID" issue is resolved.
2. **Manifest is source of truth** — every locally-built image has a `build:` section in its manifest at `atelier-butler/infra/manifests/<layer>/<container>.yml`. Read it first.
3. **Tag must match manifest** — `container.image` in the manifest = the tag you build. `deploy-container.sh` writes the git template over the boot XML with that image as `<Repository>` (since 2026-10-18), checks the recreated container with `docker inspect`, corrects one miss itself and fails with exit 3 only if it still does not converge.
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

### Releases: `ci-deploy.sh` (how production images are built)

A merge to `main` runs **Build & Deploy Butler Gateway** on the `[self-hosted, unraid]` runner, which SSHes to UNRAID with a forced command: `infra/scripts/ci-deploy.sh <container> <branch>`. That script fast-forwards the **local checkout** `/mnt/user/repos/atelier-butler` to `origin/<branch>`, runs `docker build` there (label `org.opencontainers.image.revision=<sha>`), pushes `:latest` and `:<short sha>`, then `deploy-container.sh` and `release-health.sh` (which watches ~10 min and rolls back on a regression).

- **A dirty local checkout fails the release before anything is built** (`Your local changes … would be overwritten by checkout`). If you edited the checkout in an emergency, run `git checkout -- <those files>` **before** merging the release PR, not after (2026-11-12: the release ran first, failed in 4 s, and had to be re-run).
- **`deploy-container.sh` alone never builds.** It recreates the container from the image the tag already names. Running it after a merge redeploys the old image, healthy and EXIT 0 (2026-11-12). The proof a release is live is the revision label: `docker inspect <c> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'` must equal the merge commit.

### Pull-request CI: the `butler-ci` runner

Since 2026-11-11 (GitHub-hosted minutes ran out) pull-request checks run on `github-runner-ci-butler` (`runs-on: [self-hosted, butler-ci]`): ephemeral, unprivileged, no Docker socket, no mounts, `--cpus=12 --cpu-shares=512`, and **all of `/tmp` a tmpfs** (8g). Never give it the socket: a pull request runs code nobody has merged. Its speed rules are in "Speed" below.

## Build Command

```bash
# Read build: section from manifest first, then:
DOCKER_BUILDKIT=1 docker build \
  --cpu-period=100000 --cpu-quota=800000 \
  -f <dockerfile> \
  -t <container.image> \
  -t localhost:5000/<image>:latest \
  <context>
```

**CPU quota:** `--cpu-quota=800000` / `--cpu-period=100000` = 8 cores, the value `ci-deploy.sh` uses (Filipe, 2026-09-27). More cores barely help: a cold build is bound by disk fsyncs and downloads, not CPU (see "Speed").

## Speed (MANDATORY for every Dockerfile built on UNRAID — 2026-11-12)

**Why builds and tests are slow here: fsync.** Docker's storage on UNRAID is `docker.img`, a loop file on btrfs. One `fsync` there takes **~46 ms**; in a tmpfs it takes 0.01 ms (measured 2026-11-12, 200 fsyncs: 9260 ms vs 2 ms). Anything that fsyncs per file crawls: dpkg (every unpacked file), SQLite (every commit), npm's cache writes. CPU is rarely the limit.

What it cost before the fixes:

| Where | Before | Cause |
|---|---|---|
| Butler image, cold cache (new `node:22-slim` upstream) | 35m52s (warm: 6–9 min) | builder apt 513 s, ffmpeg+pyatv 1520 s (dpkg fsyncs), 18 × `npm ci` in series 597 s |
| Gateway PR tests on `butler-ci` | 14–17 min (GitHub: ~4 min) | SQLite test files in `os.tmpdir()` = `/tmp` on docker.img; single tests 0.0 s → 60–137 s |

**Rules for every Dockerfile:**

1. **apt with cache mounts and `force-unsafe-io`.** The `.deb`s survive a cold cache; dpkg skips its fsyncs (a failed layer is discarded anyway). Remove the dpkg setting at the end of the runtime stage.
   ```dockerfile
   RUN --mount=type=cache,id=apt-cache-<stage>,target=/var/cache/apt,sharing=locked \
       --mount=type=cache,id=apt-lists-<stage>,target=/var/lib/apt/lists,sharing=locked \
       rm -f /etc/apt/apt.conf.d/docker-clean \
       && echo force-unsafe-io > /etc/dpkg/dpkg.cfg.d/02-unsafe-io \
       && apt-get update && apt-get install -y --no-install-recommends <pkgs> \
       && rm -f /etc/dpkg/dpkg.cfg.d/02-unsafe-io
   ```
   No `rm -rf /var/lib/apt/lists/*`: the lists are a cache mount, not in the layer. **One `id=` per stage**: with one shared locked cache the runtime stage's apt waited for the builder's, though BuildKit runs the stages in parallel.
   **No `# syntax=docker/dockerfile:1` line**: the built-in frontend already has cache mounts, and resolving that image from Docker Hub cost 45.7 s per build.
2. **npm: `--mount=type=cache,target=/root/.npm`** on every `npm ci`, with `--prefer-offline --no-audit --no-fund`.
3. **pip: `--mount=type=cache,target=/root/.cache/pip`**, and drop `--no-cache-dir` (the cache lives in the mount, not the image).
4. **Independent installs in parallel**, with a failure still fatal: `... | xargs -P 6 -I{} sh -c 'cd /app/{} && npm ci ...'` (xargs exits non-zero when any one fails).
5. **Dependency manifests before source** (`COPY package*.json` → install → `COPY src`), so a code change reuses the install layers.
6. **Expect a cold cache whenever the base tag moves upstream.** `FROM node:22-slim` is not pinned on purpose (security updates arrive without a PR); rules 1–4 are what make that cold build cheap.

**Rules for CI on the home runners:**

- **Every temp file in tmpfs.** The runner's whole `/tmp` is a tmpfs (`--tmpfs /tmp:exec,size=8g`), so `os.tmpdir()`, `mkdtemp`, SQLite test DBs and `RUNNER_WORKDIR=/tmp/runner` never touch docker.img. `exec` is required: npm runs esbuild's binary from there. The tmpfs counts against `--memory`.
- **A new runner gets the same template**, or its tests are 4–5× slower than on GitHub with no error anywhere.
- **Production first:** CI runners run with `--cpu-shares=512`, so a release build wins the CPU when both run.

**Find where the time went, before guessing:**

```bash
docker buildx history ls                      # every build with its duration
docker buildx history logs <build-id> | grep -E '^#[0-9]+ (DONE|\[)'   # per-step times
```
For tests, compare per-test `duration_ms` in a home run's log with a GitHub-hosted run of the same suite: a test that is 0.0 s there and seconds here is waiting on disk or network, not CPU. To check a filesystem from inside a container, time 200 `fsyncSync` calls with `node -e` (the UNRAID MCP blocks `dd`).

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
| Internal | `registry.3olive3.com` (FortiGate DNS CNAME → NGINX → port 5000) |
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
  --cpu-period=100000 --cpu-quota=800000 \
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

- **Tag mismatch** — `container.image` in the manifest must be the tag you build. The deploy writes the manifest image into the boot XML itself, so a build pushed under another tag either fails to start or, after one automatic retry, ends in DEPLOYMENT FAILED (exit 3). Before 2026-10-18 a stale boot XML silently redeployed the OLD image while the log named the new one.
- **No python3 on UNRAID** — build scripts must use bash/jq/sed.
- **Socket mount** — only the deploy runner (`[self-hosted, unraid]`) has `/var/run/docker.sock`; builds share the host daemon, no Docker-in-Docker. The pull-request runner (`butler-ci`) never gets it.
- **Slow build or slow tests = check fsync first** — see "Speed". A build over ~10 min or a home CI job far slower than its GitHub-hosted history is a disk problem until the step times say otherwise.
- **Cache invalidation** — `COPY . .` busts all subsequent layers. Copy dependency files first.
- **Multi-platform** — UNRAID is x86_64 only. No `--platform` needed.
- **Disk space** — monitor `/mnt/user/registry/` growth. Registry GC needs a cron job.
