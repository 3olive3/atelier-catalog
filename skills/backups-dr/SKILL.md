# Backups & Disaster Recovery Skill

> Full backup management and disaster recovery for Casa Lima infrastructure.
> Use this skill when performing backup operations, test restores, or recovering from server failure.

## Backup Architecture

### Seven Backup Layers

```
Layer 1: USB Boot Drive
├── What: UNRAID license keys, network config, Docker XML templates, go script, SSH keys
├── Backup: Weekly script → /mnt/user/appdata/boot-backup/ → Duplicacy → R2
├── Script: atelier-butler/infra/scripts/backup-usb-boot.sh
└── Schedule: Sundays 3:00 AM

Layer 2: Container Appdata (Local)
├── What: All Docker container configs and data (/mnt/user/appdata, ~57 GB)
├── Backup: Duplicacy → /mnt/user0/Backups/storage_bck_local (~66 GB deduplicated)
├── Schedule: Daily 6:00 AM, 1 thread
├── Retention: 7 daily, 10 weekly, delete after 30 days
└── Status: Working (revision 753+)

Layer 3: Container Appdata (Cloud — Offsite)
├── What: Same source as Layer 2
├── Backup: Duplicacy → Cloudflare R2 (casalima-backup bucket, WEUR)
├── Schedule: Daily 5:00 AM, 4 threads
├── Retention: 7 daily, 30 weekly, delete after 60 days
├── Cost: ~$1.50/mo (~80-90 GB steady state), budget alert at $5/mo
├── Credentials: Vaultwarden → "Cloudflare R2 — Duplicacy Backup"
└── Status: Working (since 2026-03-17)

Layer 4: Code & Configuration (Git)
├── What: All repo source code, IaC configs, Docker templates, deploy scripts
├── Backup: Git → GitHub (9 repos, auto-synced to UNRAID every 10 min)
├── Repos: atelier, atelier-bridge, atelier-butler, atelier-catalog,
│          atelier-companion, atelier-mcps, home-docs, homebridge-pando-hood, minecraft-server
└── Status: Continuous (on every commit)

Layer 5: Secrets
├── What: All passwords, API keys, tokens, certificates
├── Backup: Vaultwarden database → backed up in Layer 2+3 (appdata)
├── Access: vault.3olive3.com / administrator@3olive3.com
└── Critical: Master password must be memorized — NOT stored digitally

Layer 6: Network Device Configs
├── What: Fortigate firewall, FortiSwitch, FortiAP configs
├── Backup: Unimus → MariaDB → backed up in Layer 2+3 (appdata)
├── Schedule: Automatic on change detection
└── Status: Working

Layer 7: Media Files
├── What: Movies, TV shows, music (~10+ TB)
├── Protection: UNRAID parity drive (single disk failure tolerance)
├── Backup: NONE (accepted risk — re-downloadable content)
└── Note: Not covered by Duplicacy — too large for cloud backup
```

### What's NOT Backed Up (Accepted Risks)

| Data | Size | Risk | Mitigation |
|------|------|------|------------|
| Media files | ~10+ TB | Disk failure beyond parity | Re-download from Usenet/sources |
| Container images | ~50 GB | Docker Hub/registry down | Rebuilt from Dockerfiles |
| Plex transcodes/cache | ~10 GB | None | Regenerated automatically |
| Minecraft world (live) | ~2 GB | Corruption | Paper auto-saves, backed up in appdata |

## MCP Tools Available

### Duplicacy MCP (6 tools)
- `check_duplicacy_health` — overall backup system status
- `get_backup_status` — current job status
- `list_backups` — configured backup jobs
- `list_storages` — storage backends (local + R2)
- `list_schedules` — scheduled backup jobs
- `get_job_logs` — recent backup/check/prune logs

### Unimus MCP (12 tools)
- `check_unimus_health` — network backup system health
- `list_devices` — devices being backed up
- `get_device` / `find_device_by_address` — device details
- `get_latest_backup` / `get_latest_backups` — latest configs
- `list_device_backups` — backup history for a device
- `get_backup_diff` — config changes between versions
- `find_devices_with_changes` — recently changed devices
- `list_schedules` — backup schedules
- `trigger_backup` / `trigger_discovery` — manual operations

### Cloudflare MCP (R2 tools)
- `list_r2_buckets` — list R2 storage buckets
- `get_r2_bucket_usage` — storage size, object count, cost estimate

### UNRAID MCP
- `run_command` — execute shell commands for manual backup operations

## Monitoring & Alerting

### Prometheus Metrics
- `butler_r2_storage_bytes{bucket="casalima-backup"}` — R2 usage
- `butler_r2_storage_limit_bytes{bucket="casalima-backup"}` — budget limit (333 GB)

### Alertmanager Rules
- **R2StorageWarning** — 80% of $5/mo budget (~267 GB)
- **R2StorageCritical** — exceeds $5/mo budget (333 GB)
- **R2StorageMetricMissing** — no metric for 24h

### Grafana Dashboard
- **Cloud Costs** (`cloud-costs`) — R2 usage over time, daily growth, cost estimate, days-until-budget

## Daily Verification Checklist

When asked to check backup health:

```
1. Check Duplicacy status:
   → duplicacy.check_duplicacy_health
   → duplicacy.get_backup_status

2. Verify local backup ran today:
   → duplicacy.list_schedules (check LOCAL_appdata_daily status)

3. Verify R2 cloud backup ran today:
   → duplicacy.list_schedules (check R2_appdata_daily status)

4. Check R2 storage costs:
   → cloudflare.get_r2_bucket_usage("casalima-backup")

5. Check network device backups:
   → unimus.check_unimus_health

6. Report summary to user
```

## Test Restore Procedure

Monthly test restore validates the full backup chain:

```
1. Run test restore script on UNRAID:
   → unraid.run_command("/mnt/user/repos/atelier-butler/infra/scripts/test-restore.sh vaultwarden")

2. Check results:
   → unraid.run_command("tail -20 /var/log/test-restore.log")

3. If FAILED:
   → Check R2 connectivity: cloudflare.get_r2_bucket_usage("casalima-backup")
   → Check Duplicacy logs: unraid.run_command("tail -50 /mnt/user/appdata/Duplicacy/logs/backup-r2-*.log | tail -20")
   → Check credentials: Vaultwarden → "Cloudflare R2 — Duplicacy Backup"
```

## Disaster Recovery — Full Server Rebuild

### Prerequisites
- New server with UNRAID installed on USB flash
- Internet access (for GitHub repos + R2 restore)
- Vaultwarden master password (memorized)
- This skill loaded in a Claude Code agent on your Mac

### Phase 1: Base System (30 min)

```
1. Install UNRAID on USB flash (download from unraid.net)
2. Boot server, set static IP: 10.1.3.100, gateway 10.1.3.254
3. Register license (if new USB, contact Lime Technology with old GUID)
4. Enable SSH, set root password from Vaultwarden
5. Enable Docker service
```

### Phase 2: Bootstrap Duplicacy (15 min)

```
6. Create Duplicacy container manually in UNRAID Docker tab:
   - Image: saspus/duplicacy-web
   - Port: 3875
   - /backuproot → /mnt (rw)
   - /config → /mnt/user/appdata/Duplicacy (rw)
   - /cache → /mnt/user/appdata/Duplicacy/cache (rw)
   - /logs → /mnt/user/appdata/Duplicacy/logs (rw)
   - Env: DUPLICACY_R2_STORAGE_BCK_S3_ID=<from Vaultwarden>
   - Env: DUPLICACY_R2_STORAGE_BCK_S3_SECRET=<from Vaultwarden>
   - Extra: --hostname=backups

7. In Duplicacy Web UI (http://10.1.3.100:3875):
   - Add storage: S3 compatible
     - Name: R2_storage_bck
     - Endpoint: https://0684163c994f00955dbfb4c039fdead3.r2.cloudflarestorage.com
     - Bucket: casalima-backup
     - Region: auto
   - Navigate to Restore tab
   - Select R2_storage_bck
   - Restore LATEST revision to /backuproot/user/appdata
```

### Phase 3: Restore Appdata (1-4 hours)

```
8. Wait for full restore to complete (~50-60 GB download from R2)
9. Verify key directories exist:
   → ls /mnt/user/appdata/vaultwarden/
   → ls /mnt/user/appdata/nginx-proxy-manager/
   → ls /mnt/user/appdata/pihole/
   → ls /mnt/user/appdata/Grafana/
```

### Phase 4: Deploy Stack (30 min)

```
10. Clone atelier-butler repo:
    git clone https://github.com/3olive3/atelier-butler.git /mnt/user/repos/atelier-butler

11. Restore USB boot config from backup:
    cp -r /mnt/user/appdata/boot-backup/config/* /boot/config/
    (This restores XML templates, network config, SSH keys)

12. Reboot UNRAID to apply network config changes

13. Start containers in order:
    - MariaDB/PostgreSQL (databases first)
    - Vaultwarden (secrets needed by others)
    - Pihole (DNS)
    - NGINX Proxy Manager (reverse proxy)
    - Postfix-Relay (email)
    - All remaining containers (from XML templates in Docker tab)

14. For each container needing secrets:
    - Open Vaultwarden (vault.3olive3.com or direct IP)
    - Find the credential entry
    - Update container environment variables
```

### Phase 5: Verify (30 min)

```
15. Check all containers running:
    → docker ps | wc -l (expect 50+)

16. Check critical services:
    → curl -s http://10.1.2.100/admin → Pihole
    → curl -s http://localhost:81 → NGINX Proxy Manager
    → curl -s http://localhost:3100/api/v1/butler/health → Butler Gateway
    → curl -s https://vault.3olive3.com → Vaultwarden

17. Check monitoring:
    → Prometheus targets: http://localhost:9090/targets
    → Grafana: http://localhost:3000

18. Check external access:
    → DNS: dig squadsurvival.3olive3.com
    → HTTPS: curl https://butler.3olive3.com
    → Cloudflare tunnel status

19. Re-enable daily backups:
    → Verify LOCAL_appdata_daily schedule in Duplicacy
    → Verify R2_appdata_daily schedule in Duplicacy
    → Run manual backup to confirm both work
```

### Phase 6: Restore Network Configs (if needed)

```
20. If Fortigate was factory reset:
    → Unimus has the latest config backup
    → unimus.get_latest_backup(device_id) → download config
    → Upload to Fortigate via System → Configuration → Restore

21. If DNS records lost:
    → Pihole config is in appdata backup (auto-restored)
    → Cloudflare DNS managed via API (unchanged by server failure)
```

## Key Credentials (from Vaultwarden)

| Service | Vaultwarden Entry | Used For |
|---------|------------------|----------|
| UNRAID root | `UNRAID SSH` | SSH access, CLI |
| Cloudflare R2 | `Cloudflare R2 — Duplicacy Backup` | Offsite backup credentials |
| Cloudflare API | `Cloudflare API Token` | DNS, tunnels, R2 tools |
| Vaultwarden | Master password (memorized) | All secrets access |
| GitHub | SSH key on Mac | Clone repos during recovery |

## File Locations

| File | Path | Purpose |
|------|------|---------|
| USB boot backup script | `atelier-butler/infra/scripts/backup-usb-boot.sh` | Weekly /boot/ backup |
| Test restore script | `atelier-butler/infra/scripts/test-restore.sh` | Monthly restore validation |
| Duplicacy config | `/mnt/user/appdata/Duplicacy/duplicacy.json` | Backup schedules + storage |
| Duplicacy preferences | `/mnt/user/appdata/Duplicacy/cache/localhost/0/.duplicacy/preferences` | Storage mapping |
| Duplicacy logs | `/mnt/user/appdata/Duplicacy/logs/` | Daily backup/check/prune logs |
| Boot backup output | `/mnt/user/appdata/boot-backup/` | Weekly USB boot snapshot |
| Alertmanager rules | `atelier-butler/infra/configs/prometheus/rules/infrastructure.yml` | R2 storage alerts |
| Cloud Costs dashboard | `atelier-butler/infra/dashboards/cloud-costs.json` | R2 cost tracking |
| DR runbook (docs) | `docs.3olive3.com → Platform → Disaster Recovery` | Full recovery guide |
| Backup docs | `docs.3olive3.com → Server → Backups` | Configuration reference |
