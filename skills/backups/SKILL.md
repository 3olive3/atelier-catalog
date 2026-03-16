---
name: backups
description: "Duplicacy backup management (Backblaze B2), Unimus network config backups, health checks, restore procedures, and backup verification."
---

# Backups

Casa Lima backup strategy covering application data (Duplicacy → Backblaze B2) and network device configurations (Unimus).

## Backup Architecture

```
UNRAID appdata ──(Duplicacy)──→ Backblaze B2 (cloud)
Network devices ──(Unimus)──→ Local config snapshots
```

| System | What | Where | Schedule |
|--------|------|-------|----------|
| Duplicacy | Docker appdata, configs | Backblaze B2 | Scheduled |
| Unimus | Network device configs | Local (UNRAID) | Scheduled + on-demand |

---

## Duplicacy

### Health Check

```
duplicacy_check_duplicacy_health → HEALTHY / DEGRADED / UNHEALTHY
```

### Operations

| Task | MCP Tool |
|------|----------|
| Current backup status | `duplicacy_get_backup_status` |
| List storage backends | `duplicacy_list_storages` |
| List backup jobs | `duplicacy_list_backups` |
| List schedules | `duplicacy_list_schedules` |
| View job logs | `duplicacy_get_job_logs` |

### Investigating Failures

1. `duplicacy_get_backup_status` — check for failed jobs
2. `duplicacy_get_job_logs` — read the most recent log
3. Common failures:
   - **Storage full** — check B2 bucket usage
   - **Network timeout** — transient; job retries on next schedule
   - **Credential expired** — update B2 application key in Duplicacy config
   - **Lock conflict** — another job running; wait for completion

---

## Unimus (Network Config Backup)

### Health Check

```
unimus_check_unimus_health → OK status
```

### Operations

| Task | MCP Tool |
|------|----------|
| List managed devices | `unimus_list_devices` |
| Get latest backup | `unimus_get_latest_backup` (includes config text) |
| Compare configs | `unimus_get_backup_diff` |
| Find recent changes | `unimus_find_devices_with_changes` |
| Trigger backup now | `unimus_trigger_backup` |
| Trigger discovery | `unimus_trigger_discovery` |

### Change Tracking

Use Unimus to audit network config changes — critical for incident investigation:

```
# Find devices with changes in last 24 hours
unimus_find_devices_with_changes
  since: <unix_ms_24h_ago>

# Compare old vs new config
unimus_get_backup_diff
  origBackupId: <older>
  revBackupId: <newer>
```

---

## Before Destructive Operations

**Casa Lima guardrail**: Before any destructive operation, generate a backup and prepare a rollback plan.

### Pre-Destruction Checklist

1. **Identify what to back up** — container data, network config, DNS records
2. **Take backup**:
   - Container: check Duplicacy has recent backup of the appdata path
   - Network: `unimus_trigger_backup` for affected devices
   - DNS: `cloudflare_export_dns_records` for external; `pihole_list_cnames` for internal
3. **Document rollback plan** — what to restore and how
4. **Get user approval** — present the plan before executing

---

## Restore Procedures

### Duplicacy Restore

Duplicacy restores are done via its web UI or CLI. The agent can:
1. Verify backup health: `duplicacy_get_backup_status`
2. List available snapshots: `duplicacy_get_job_logs`
3. Guide the user through the web UI restore process

### Unimus Config Restore

Unimus stores config text. To restore:
1. `unimus_get_latest_backup` — retrieve the config text
2. Apply manually to the device (SSH or device management interface)
3. Unimus does not push configs — it's backup-only

---

## Gotchas

- **Duplicacy web UI** — all config changes through the UI; no direct config file editing
- **B2 lifecycle rules** — don't set B2 bucket lifecycle rules that conflict with Duplicacy retention
- **Unimus is read-only** — it backs up configs but cannot push/restore them
- **Backup ≠ disaster recovery** — backups cover data; full DR requires XML templates + documented procedures
- **Duplicacy lock files** — if a job hangs, stale locks may prevent next run; check via web UI
