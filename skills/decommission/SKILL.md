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

## Verification

Casa Lima rule, and it applies doubly here: **verify by effect, never by
status.** Specific traps seen in this estate:

- `delete_vip` returns an **error** on success — its post-delete re-read gets
  HTTP 404, which *is* the confirmation, and it surfaces that as a failure.
  Confirm with `list_vips`.
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
