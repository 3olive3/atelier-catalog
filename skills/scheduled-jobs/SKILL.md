---
name: scheduled-jobs
description: "Writing a new cron job, collector or maintenance script for Casa Lima — where credentials come from, why it must be bash, how to emit metrics, where to document it, and the proof it has to pass before it counts as done."
---

# Scheduled Jobs

**A scheduled job that cannot run looks exactly like one with nothing to do.**
Everything here exists because that sentence has been true six separate times in
this estate. Read
<https://docs.3olive3.com/incidents/2026-09-inert-protections/> if you want the
evidence; otherwise just follow the checklist.

Use this when adding or changing anything under
`atelier-butler/infra/scripts/` that runs on a schedule. **Not** for deploying a
container (`deploy-container`), authoring alert rules alone (`observability`),
or removing a job (`decommission`).

---

## The five constraints that trip everyone

| Constraint | Consequence |
|---|---|
| **UNRAID has no `python3`.** At all | Cron jobs are **bash**. `curl`, `jq`, `awk`, `sed` are available. A Python cron line reads as working and can never execute |
| **`.env` files are not on the box** | `mcp/*/.env` is gitignored, so `repo-sync` cannot carry credentials over |
| **Cron lives in tmpfs** | Jobs are reinstalled at every array start by `boot-setup.sh` from `infra/configs/cron/casa-lima`. Editing the crontab directly survives nothing |
| **`configs:` is not applied by a normal deploy** | Prometheus rules and other config need `deploy-container.sh <name> --apply-configs`. `--configs-only` audits without bouncing anything |
| **The repo is not what deploys** | `deploy-container.sh` reads the live boot-config XML, not `infra/templates/` |

---

## Credentials

**Read them from the running Butler container, never from a file.**

```bash
CREDS=$(docker exec atelier-butler printenv FORTIGATE_API_TOKEN NETBOX_URL NETBOX_TOKEN)
```

`deploy-container.sh` injects those from Vaultwarden, so the container is
downstream of the vault and stays correct. See `vault-access`.

!!! danger "Do not read /mnt/user/appdata/butler/config/.env"
    It is hand-maintained and drifts. On 2026-09-08 it held a NetBox **v1**
    token that the server had been rejecting with `403` since the v2 migration,
    while the container had the right one the whole time. Nothing was
    misconfigured — there were two copies of one credential and the hand-kept
    one rotted, silently, for months.

    **No fallback to it either.** A fallback to a known-stale source is how the
    problem survives.

Secrets never go in the script, in git, in logs or in a comment. If a job needs
a new credential, it goes in Vaultwarden and is declared in the consuming
manifest's `secrets:` block.

---

## Anatomy of a job

```bash
#!/bin/bash
set -euo pipefail

# 1. Define OUTPUT and TMP FIRST, before anything can fail.
OUTPUT="/mnt/user/appdata/node-exporter/textfile/<name>.prom"
TMP="${OUTPUT}.tmp"
BUTLER_CONTAINER="${BUTLER_CONTAINER:-atelier-butler}"

# 2. Errors go through one helper that always writes a metric.
die() { echo "# ERROR: $*" > "$TMP"; mv "$TMP" "$OUTPUT"; exit 1; }

# 3. Credentials from the container, no fallback.
docker inspect -f '{{.State.Running}}' "$BUTLER_CONTAINER" 2>/dev/null | grep -q true \
  || die "$BUTLER_CONTAINER is not running"

# 4. Write to TMP, then mv. Never write OUTPUT in place — a half-written
#    textfile is a parse error for node-exporter.
```

!!! bug "The error branch that could never run"
    `collect-fortiswitch-metrics.sh` wrote its "credentials missing" error to
    `$TMP` and `$OUTPUT` on lines **above** where either was defined. Under
    `set -u` it died with *unbound variable* instead of emitting the error it
    existed to emit. **The one branch written to make a failure visible was
    itself broken**, for as long as the script existed.

    Define your outputs first. Then force the error and watch.

---

## Metrics

Wrap every job so it reports on itself:

```
30 5 * * * root /bin/bash /mnt/user/repos/atelier-butler/infra/scripts/cron-wrapper.sh <job-name> /bin/bash /mnt/user/repos/atelier-butler/infra/scripts/<script>.sh > /dev/null 2>&1
```

`cron-wrapper.sh` emits `casa_cron_last_run_timestamp`,
`casa_cron_last_success_timestamp`, `casa_cron_last_exit_code`,
`casa_cron_last_duration_seconds` and `casa_cron_runs_total` into
`cron.prom`. Alerts in `cron.yml` watch staleness and failure — add your job to
the right interval group, or nothing watches it.

**A failed check must not look like a clean result.** Emit a sentinel:

```
casa_<thing>_check_ok 0        # the check could not run
casa_<thing>_drift  -1         # therefore this number means nothing
```

`-1`, not `0`. This distinction is what surfaced the dead NetBox credential.

---

## Read-only by default

A scheduled job **reports**; a human **applies**. Especially for network gear,
firewall objects and anything destructive.

`check-network-drift.sh` is the reference: it detects both NetBox drift and
standby-switch drift and writes nothing. The corrections live in separate
scripts run by hand. Automatic correction is acceptable only where the target is
a **generated copy** — NetBox mirroring the FortiGate qualifies; the FortiGate
itself never does.

---

## Where to document it

| What | Where |
|---|---|
| The cron line | `atelier-butler/infra/configs/cron/casa-lima` — **the source of truth**, not the live crontab |
| The script | `atelier-butler/infra/scripts/` |
| The schedule table | home-docs `server/unraid.md` → *Casa Lima Scheduled Jobs* |
| What its metrics mean | same page, beside the table |
| Alert rules | `infra/configs/prometheus/rules/` — then `--apply-configs` |
| Anything it discovered | the relevant roadmap in home-docs, per theme |

Do not hand-maintain a job count anywhere. That table has said 8 while there
were 15, and 15 while there were 16.

---

## Proof of function — before you call it done

Per the written standard in home-docs `incidents/rca-process.md`. Configuration
that reads correctly is **not** evidence.

- [ ] **Run it by hand** on UNRAID and confirm the textfile appears
- [ ] **Force the error** — point it at a container that does not exist, break
      the input — and confirm the error metric is written
- [ ] **Run it twice.** If it reconciles anything, the second run must report
      **zero changes**. Convergence is the proof
- [ ] **Confirm the metric is scraped**, not merely written:
      `curl -s localhost:9090/api/v1/query?query=<metric>`
- [ ] **Confirm the alert is loaded and evaluating** —
      `state: inactive, health: ok` from `/api/v1/rules`. `promtool check rules`
      validates a *file*, and will happily approve the container's old one
- [ ] **Install it for real** — add to `infra/configs/cron/casa-lima`; it takes
      effect at the next array start, so also install it into the live crontab
      if you want it running today

!!! tip "The cheapest of these is forcing the error"
    Two of the six inert mechanisms found on 2026-09-08 were caught by
    deliberately breaking the input. Neither would have been caught by reading
    the code again.

---

## Never delete a broken protection instead of fixing it

`CronJobStaleMonthly` was found incapable of firing and was **removed**. The
monthly restore test it watched has still never produced a metric, and now
nothing watches it at all. Removing the alarm does not remove the risk; it
removes the ability to see it. Fix it, or record the decision to accept the risk
explicitly.
