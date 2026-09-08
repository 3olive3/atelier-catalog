---
name: decommission
description: "Removing something from Casa Lima infrastructure without leaving orphans behind — the dependency sweep for a container, DNS name, VIP, credential or monitor, and how to find what earlier removals left rotting."
---

# Decommission

**Removing a thing is never one action.** Every object in this estate is
referenced by three to six others, and nothing warns you when a reference is
left dangling. The reference simply rots — silently, sometimes for months —
until it surfaces as a false alert, a broken console, or a service that was
never actually reachable.

This skill is the counterpart to `deploy-container`. That one creates the
references; this one removes them.

## The rule

> **Nothing is decommissioned until every object that referenced it is also
> gone or repointed — verified by lookup, not by memory.**

An object that "should" have been cleaned up is not cleaned up. The estate's
dominant failure mode is silent success: the removal reports fine, the orphan
survives.

## Reference maps

Work the whole column. Do not stop at the first two.

### Removing a container

| Also remove / check | Where |
|---|---|
| Manifest | `atelier-butler/infra/manifests/<layer>/<name>.yml` → move to `legacy/`, or set `lifecycle.status: sunset` |
| UNRAID XML template | `/boot/config/plugins/dockerMan/templates-user/my-<name>.xml` — **and any duplicate** (see below) |
| Git template mirror | `atelier-butler/infra/templates/my-<name>.xml` |
| `stack.yml` entry | `atelier-butler/infra/stack.yml` |
| Vaultwarden items | every `secrets[].vault_item` in the manifest |
| Uptime Kuma monitor | including a secondary/TCP monitor — manifests carry `secondary_id` |
| NGINX proxy host | `list_proxy_hosts`, match by domain |
| DNS | FortiGate DNS Database **and** Cloudflare |
| FortiGate | VIP, policy references, address object, service object |
| Prometheus | scrape job, alert rules naming the job |
| Duplicacy | `backup.appdata` path |
| home-docs | page + `mkdocs.yml` nav entry |
| Dependents | `grep -rl '<name>' infra/manifests/` — another manifest may list it under `dependencies:` |

### Removing a DNS name

The case that bit us. Search **all** of these before deleting:

```bash
# Uptime Kuma monitors pointing at it
docker exec UptimeKuma sqlite3 /app/data/kuma.db \
  "SELECT id,name,url FROM monitor WHERE url LIKE '%<name>%' OR hostname LIKE '%<name>%';"
```
- NGINX proxy host with that domain (`list_proxy_hosts`)
- Cloudflare record *and* FortiGate DNS Database entry — they are independent
- A manifest's `dns:` and `proxy.domain:` fields
- home-docs pages quoting the URL

### Removing a FortiGate object

- **VIP** — `delete_vip` refuses while a policy references it and names those
  policies. That refusal is the useful output; do not work around it.
- **Address / service object** — check `list_policies` and group membership
  first; FortiOS errors are bare numbers.
- **Policy** — confirm nothing else was relying on it. Two policies named
  `(REVIEW)` have been "about to be cleaned up" for a long time; a policy
  nobody understands is not a policy to delete casually.

### Rotating or removing a credential

- Every manifest declaring that `vault_item`
- Consumers of the *same* secret under a different env name
  (`RCON_PASSWORD` vs `RWA_RCON_PASSWORD`)
- Redeploy every consumer, then verify the value actually landed —
  **check length, never print the secret**:
  ```bash
  docker inspect <c> --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep '^<ENV>=' | awk -F= '{print length($2) " chars"}'
  ```

### Removing an MCP server

The case that proves this section had to exist. Pi-hole's MCP was archived
2026-08-13 and deleted from the repo 2026-08-14 — every source file gone, no
`.mcp.json` anywhere defining it. It still appeared in `/mcp` on 2026-08-29,
because the **name was left on an allow-list**. Deleting the code is the part
everyone remembers; the tooling references are the part that rots quietly.

| Also remove / check | Where |
|---|---|
| Server definition | **every** `.mcp.json` — repos duplicate server lists, so check all of them, not just the one you are standing in |
| Allow/deny lists | `.claude/settings.local.json` → `enabledMcpjsonServers` **and** `disabledMcpjsonServers`, in every repo, plus `~/.claude.json` |
| Per-tool permission grants | same file, `permissions.allow` — entries read `mcp__<name>__<tool>` |
| Source | `atelier-butler/mcp/<name>/` |
| Catalog + tool counts | **regenerate, never hand-edit**: `python3 atelier-mcps/scripts/sync-catalog.py --write` |
| Distribution | `atelier-mcps/mcps/<name>/`, `atelier-mcps/releases/<name>-*.tar.gz`, `atelier-catalog/mcps/<name>.json` |
| Gateway policy | `atelier-butler/profiles/casa-lima/` — token scopes in `tokens.json`, and `guardian-rules.json` rules naming those tools |
| home-docs | MCP tables, tool counts, per-server pages |

```bash
# the sweep that would have caught the Pi-hole ghost
for f in */.mcp.json .mcp.json; do
  [ -f "$f" ] && jq -r '.mcpServers | keys[]' "$f"
done | sort -u > /tmp/defined
jq -r '(.enabledMcpjsonServers // [])[], (.disabledMcpjsonServers // [])[]' \
  .claude/settings.local.json | sort -u > /tmp/named
comm -13 /tmp/defined /tmp/named    # named but not defined = ghosts
```

**Reconnect before believing anything.** A running MCP process serves the code
it loaded at spawn time, so a server you just deleted — or just fixed — keeps
answering from memory until `/mcp` reconnects it.

### Removing a skill

| Also remove / check | Where |
|---|---|
| Skill directory | `atelier-catalog/skills/<name>/` |
| Catalog entry | `atelier-catalog/skills/<name>.json` |
| Symlinks | `.claude/skills/<name>` in **every** repo — these are symlinks into the catalog, and a dangling one stays invisible until the skill tool fails on it |
| `CLAUDE.md` | the "Skills installed" list in each repo that had it |
| home-docs | skills pages, and any runbook that says "use the `<name>` skill" |

```bash
# dangling skill symlinks across every repo
find ~/Developer/atelier-platform/*/.claude/skills -maxdepth 1 -type l \
  ! -exec test -e {} \; -print
```

### Moving or renaming a repository or directory

A move decommissions the **old path**, and every reference to it is now an
orphan. The trap is specific and it caught this estate three times over:

!!! danger "Repairing your working copy is not repairing the repo"
    When a path changes, people fix the file in front of them so their machine
    keeps working. The **committed** version stays wrong, nobody notices because
    their own clone is fine, and anyone cloning fresh gets a broken config.

    The Atelier repos moved under `atelier-platform/` in **August 2026**. On
    **2026-09-08**, a month later:

    - Three repos had `.claude/skills` symlinks that resolved locally while
      their committed paths did not
    - Three repos had `.mcp.json` files in the same state
    - `torneva` was never corrected even locally — its `vaultwarden` MCP had
      simply been unavailable since the move
    - `homebridge-pando-hood` pointed at `mcp/homekit/`, which had *also* been
      renamed to `mcp/homebridge/`. The earlier fix corrected the prefix and
      not the name, so that MCP was dead for a month

| Also check | Where |
|---|---|
| MCP server paths | `.mcp.json` in **every** repo — `args`, and any `env` carrying a path |
| Skill symlinks | `.claude/skills/*` — relative depth changes with the move, so a mechanical prefix swap is not enough |
| Scripts sourcing files by absolute path | `infra/scripts/` — `populate-netbox-interfaces.py` loaded its `.env` from the pre-move path and would have silently failed |
| Docs and CLAUDE.md | every `~/Developer/<old>` reference |
| Cron entries | `infra/configs/cron/casa-lima` |
| A rename *inside* the move | the thing may have been renamed too. Fixing the prefix and keeping the old name leaves it just as broken |

Prove it by resolving, not by reading the diff:

```bash
# every MCP path in every repo actually exists
for d in ~/Developer/*/ ~/Developer/atelier-platform/*/; do
  [ -f "$d/.mcp.json" ] || continue
  python3 - "$d" <<'PY'
import json, os, sys
d = sys.argv[1]
c = json.load(open(os.path.join(d, ".mcp.json")))
for n, cfg in (c.get("mcpServers") or {}).items():
    t = next((a for a in (cfg.get("args") or []) if a.endswith(".js")), None)
    if t and not os.path.exists(t):
        print(f"BROKEN {os.path.basename(d.rstrip('/'))}: {n} -> {t}")
PY
done
```

**Then confirm the fix is committed, not just present.** `git status` in each
repo — a clean working tree with a wrong committed file looks identical to a
correct one until someone clones.

## Orphan sweeps

Run these periodically, not only during a removal. Each one has found real rot.

**DNS names that no longer resolve** — the cheapest and highest-yield:

```bash
# Every proxied/monitored hostname, checked against the internal resolver
while read h; do
  [ -z "$(dig +short "$h" @10.1.3.254 2>/dev/null | head -1)" ] && echo "ORPHAN: $h"
done < hostnames.txt
```

**Monitors whose target is gone** — a monitor in permanent DOWN with
`getaddrinfo ENOTFOUND` is an orphan, not an incident.

**VIPs no policy references** — `list_vips` against `list_policies`
destinations. Three such VIPs sat exposed-on-paper for over a year.

**Duplicate UNRAID templates** — two files can both declare
`<Name>same-container</Name>`. The deploy script picks by the manifest's
`template:` field, so editing the other one changes nothing, silently:

```bash
grep -l '<Name>' /boot/config/plugins/dockerMan/templates-user/*.xml \
  | xargs grep -h '<Name>' | sort | uniq -d
```

**Unrotated logs** — `find /mnt/cache/appdata -name '*.log' -size +100M`.

**Tooling references with nothing behind them** — MCP servers named on an
allow-list but defined in no `.mcp.json`, and `.claude/skills/` symlinks
pointing at deleted catalog entries. Both keep looking real right up until
something tries to use them. Sweeps for each are in the two sections above.

**Paths that no longer resolve after a move** — MCP entrypoints and skill
symlinks pointing at pre-move locations. Run the resolver above. On 2026-09-08
it found seven broken references across four repos, a month after the move that
caused them, and one of them had never worked since.

## Verification

Casa Lima rule, and it applies doubly here: **verify by effect, never by
status.** Specific traps seen in this estate:

- `delete_vip` **used to** return an error on success — its post-delete re-read
  got HTTP 404, which *is* the confirmation, and reported it as a failure.
  Fixed in fortigate MCP 2.4.0 (2026-08-29). You will still hit it on an older
  build, or on a process not reconnected since. The general trap outlives the
  fix: a tool that verifies by re-reading must treat "gone" as success.
- The `uptime-kuma` MCP's **reads** are stale. `get_monitor` and
  `list_monitors` will show a deleted monitor as still present. Confirm against
  the sqlite DB, or you will delete it twice.
- A removal that "reports success" against a cached read is indistinguishable
  from one that did nothing. Pick an independent path to check.

## Safety

Per Casa Lima rules, deletion requires **explicit user approval** plus a
**backup and rollback plan**. In practice:

- Back up the file before editing (`cp -a x x.bak-$(date +%Y%m%d-%H%M%S)`)
- Prefer `rename`/`disable`/`pause` over delete when the object is cheap to keep
  and its purpose is unclear — **but log it**, because a paused monitor nobody
  revisits is the next orphan
- Never delete something merely because it looks unused. `(REVIEW)` on a
  firewall policy means someone was unsure; inherit the caution, then actually
  resolve it
- Deleting an object that still has references is worse than leaving it. Sweep
  first, delete second

## Recording

A decommission that is not written down becomes someone's mystery. Update the
manifest, the home-docs page, and — when the removal explains a behaviour that
would otherwise look like a bug — session memory.
