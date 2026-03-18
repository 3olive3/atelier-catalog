# Observability Skill

> Casa Lima platform observability — Prometheus, Grafana, Alertmanager, Loki. Butler is the source of truth for all observability configuration.

---

## Scope

This skill covers **implementing and operating** the Casa Lima observability stack. It is the authoritative reference for:

- Authoring Prometheus alert rules and recording rules
- Creating Grafana dashboards (JSON provisioning)
- Instrumenting services with `/metrics` endpoints
- Integrating observability into the deployment pipeline via manifest `observability:` blocks
- Operating the monitoring stack (reload, validate, troubleshoot)

**Relationship to other skills:**
- `deploy-container` — declares the `observability:` block in manifests; this skill implements what that block describes
- `prometheus-configuration` — generic Prometheus knowledge (community); this skill is Casa Lima-specific and authoritative

---

## Architecture

```
Services (/metrics)          Containers (stdout)
       │                            │
       ▼                            ▼
  Prometheus ◄───────────── Promtail (Docker SD)
  (16 targets,                      │
   90-day retention)                ▼
       │                          Loki
       ├─► Alertmanager ──► email-critical (1h repeat)
       │        │          ──► email-default (4h repeat)
       │        │          ──► companion-push (APNs)
       │        │
       │        └─► Karma (visual alert UI)
       │
       └─► Grafana (21 dashboards, Casa Lima folder)
                ├─ Datasource: Prometheus (UID: prometheus)
                └─ Datasource: Loki (UID: loki)
```

**Key URLs:**
- Prometheus: `prometheus.3olive3.com:9090`
- Grafana: `grafana.3olive3.com`
- Alertmanager: `alerts.3olive3.com:9093`
- Karma: `karma.3olive3.com`
- Loki: `tower.3olive3.com:3101`

---

## Five-Layer Alert Architecture

All alerts and dashboards are organized into five layers. Every new alert or dashboard MUST declare its layer.

| Layer | Name | Examples |
|-------|------|----------|
| 1 | Infrastructure | Host CPU/memory/disk, SMART, IPMI, Prometheus self-monitoring |
| 2 | Containers | cAdvisor metrics, container logs, restart loops, OOM kills |
| 3 | Network | DNS (Pihole), Cloudflare tunnels, WAN, LAN/WiFi, Fortigate security |
| 4 | Applications | PostgreSQL, Vaultwarden, Plex, Butler Gateway, Atelier Backend |
| 5 | Smart Home | Homebridge status, response times, memory |

---

## Manifest Integration

Every container managed by Butler has a YAML manifest. The `observability:` block is the contract between deployment and monitoring:

```yaml
observability:
  scrape:
    job: service-name          # Prometheus job_name (kebab-case)
    metrics_path: /metrics     # Endpoint path
    port: 8080                 # Scrape port
    interval: 30s              # Scrape interval
  logs: true                   # Promtail auto-collects via Docker SD
  dashboard: dashboard-uid     # Grafana dashboard UID
  alerts: [applications.yml]   # Alert rule file(s) containing rules for this service
  uptime_kuma:
    monitor_id: null           # Uptime Kuma monitor ID (null = not yet created)
```

**When `scrape` is defined:**
1. A Prometheus scrape target must exist in `prometheus.yml`
2. The service must expose `/metrics` (or custom path) without authentication
3. The job name must match what alert rules reference

**When `dashboard` is defined:**
1. A Grafana dashboard JSON must exist in `dashboards/<layer>/`
2. The dashboard UID must match the manifest value

**When `alerts` lists files:**
1. Those rule files must exist in `configs/prometheus/rules/`
2. Rules for this service use labels matching the manifest's job name

---

## Prometheus Scrape Configuration

### Adding a New Scrape Target

Add to `configs/prometheus/prometheus.yml` under `scrape_configs`:

```yaml
- job_name: 'my-service'
  static_configs:
    - targets: ['container-name:PORT']
  metrics_path: /metrics
  scrape_interval: 30s
```

**Conventions:**
- `job_name`: kebab-case, matches manifest `observability.scrape.job`
- Targets use container name (Docker DNS) or `10.1.3.100:PORT`
- Default interval: 30s for apps, 60s for infrastructure, 5m for external APIs
- After editing: sync file to UNRAID, then `docker kill --signal=SIGHUP prometheus`

### Current Targets (16)

| Job | Target | Interval | Layer |
|-----|--------|----------|-------|
| prometheus | localhost:9090 | 30s | 1 |
| node | node-exporter:9100 | 30s | 1 |
| cadvisor | cadvisor:8080 | 30s | 2 |
| postgres | postgres-exporter:9187 | 30s | 4 |
| pihole | pihole-exporter:9617 | 30s | 3 |
| loki | tower:3101 | 30s | 1 |
| promtail | tower:9080 | 30s | 1 |
| grafana | grafana:3000 | 30s | 4 |
| alertmanager | alertmanager:9093 | 30s | 1 |
| cloudflare | cloudflare-exporter:8080 | 5m | 3 |
| ipmi | ipmi-exporter:9290 | 60s | 1 |
| speedtest | speedtest-exporter:9469 | 5m | 3 |
| fortigate-snmp | fortigate:161 | 60s | 3 |
| fortiap-snmp | fortiap:161 | 60s | 3 |
| uptime-kuma | uptime-kuma:3001 | 60s | 4 |
| butler-gateway | atelier-butler:3100 | 30s | 4 |
| atelier-backend | atelier-backend:8082 | 30s | 4 |

---

## Recording Rules

Pre-computed metrics with `casa:` prefix. Used by Infrastructure Overview and Service Availability dashboards. Defined in `configs/prometheus/rules/recording.yml`.

### Naming Convention

```
casa:<domain>_<metric>_<unit>
```

Examples: `casa:node_cpu_usage_percent`, `casa:container_restarts_1h`, `casa:server_power_watts`

### Current Rules (16)

| Rule | Interval | Used By |
|------|----------|---------|
| `casa:node_cpu_usage_percent` | 60s | Infrastructure Overview |
| `casa:node_memory_usage_percent` | 60s | Infrastructure Overview |
| `casa:node_disk_usage_percent` | 60s | Infrastructure Overview |
| `casa:container_running_count` | 30s | Infrastructure Overview |
| `casa:container_memory_usage_bytes` | 30s | cAdvisor Docker |
| `casa:container_cpu_usage_percent` | 30s | cAdvisor Docker |
| `casa:container_restarts_1h` | 30s | Service Availability |
| `casa:network_receive_bytes_rate` | 60s | Network dashboards |
| `casa:network_transmit_bytes_rate` | 60s | Network dashboards |
| `casa:server_power_watts` | 60s | Infrastructure Overview |
| `casa:server_inlet_temp_celsius` | 60s | Infrastructure Overview |
| `casa:server_cpu1_temp_celsius` | 60s | Hardware Health |
| `casa:server_cpu2_temp_celsius` | 60s | Hardware Health |
| `casa:alerts_firing_total` | 30s | Infrastructure Overview |
| `casa:alerts_firing_critical` | 30s | Infrastructure Overview |
| `casa:alerts_firing_warning` | 30s | Infrastructure Overview |

---

## Alert Rules

### Rule File Organization

```
configs/prometheus/rules/
├── recording.yml          # 16 casa:* recording rules
├── infrastructure.yml     # Host, SMART, hardware alerts
├── containers.yml         # Container resource alerts
├── cron.yml               # Cron job health (staleness, failures)
├── network.yml            # DNS, Cloudflare, WAN alerts
├── network-security.yml   # Fortigate deny patterns (Loki Ruler)
├── applications.yml       # PostgreSQL, Plex, Vaultwarden, Butler, Atelier
├── storage.yml            # SMART disk health alerts
└── smarthome.yml          # Homebridge alerts
```

### Required Labels

Every alert rule MUST include these labels:

```yaml
labels:
  severity: critical | warning | info
  system: service-name        # e.g., butler, atelier, postgres
  layer: infrastructure | containers | network | applications | smarthome
```

Optional labels:
- `tier: "1" | "2" | "3"` — service criticality (Tier 1 = business-critical)

### Required Annotations

Every alert rule MUST include these annotations:

```yaml
annotations:
  summary: "Human-readable title with {{ $labels.name }} interpolation"
  description: "Detailed explanation with {{ $value | printf \"%.1f\" }} formatting"
  dashboard_url: "/d/<uid>/<slug>"
  logs_url: "/d/loki-container-logs/logs-app?var-query={container=\"<name>\"}"
```

The `dashboard_url` and `logs_url` create a three-way correlation: **alert email -> dashboard -> logs**.

### Alert Rule Template

```yaml
- alert: ServiceSpecificAlert
  expr: metric_name{label="value"} > threshold
  for: 5m
  labels:
    severity: warning
    system: service-name
    layer: applications
  annotations:
    summary: "Service alert: {{ $value | printf \"%.1f\" }}% threshold exceeded"
    description: "Detailed description of what this means and impact."
    dashboard_url: "/d/service-dashboard/service-dashboard"
    logs_url: "/d/loki-container-logs/logs-app?var-query={container=\"service-container\"}"
```

### Severity Guidelines

| Severity | Criteria | Alertmanager Routing |
|----------|----------|---------------------|
| critical | Service down, data loss risk, security breach | email-critical (1h repeat) + companion-push |
| warning | Degraded performance, approaching limits | email-default (4h repeat) + companion-push |
| info | Informational, no action needed | email-default (relaxed timing) |

### Validation

Always validate rules before deploying:

```bash
# On UNRAID (via MCP run_command):
docker exec prometheus promtool check rules /etc/prometheus/rules/*.yml
```

### Reload After Changes

Prometheus does NOT have the lifecycle API enabled. Reload via SIGHUP:

```bash
docker kill --signal=SIGHUP prometheus
```

---

## Alertmanager Routing

```
Prometheus (45 rules) + Loki Ruler (5 rules)
    │
    ▼
Alertmanager :9093
    ├── route: severity=critical
    │   ├── email-critical (group_wait 10s, repeat 1h)
    │   └── continue → companion-push
    ├── route: severity=warning
    │   ├── email-default (group_wait 30s, repeat 4h)
    │   └── continue → companion-push
    └── route: severity=info
        └── email-default (relaxed timing)

Receivers:
  email-critical → postfix relay → Cloudflare Email → administrator@3olive3.com
  email-default  → same path, relaxed timing
  companion-push → POST http://10.1.3.100:8081/api/v1/webhooks/generic → APNs
```

---

## Grafana Dashboards

### Provisioning

Dashboards are file-provisioned (not API-created):
- JSON files: `/mnt/user/appdata/grafana/data/dashboards/` on UNRAID
- Source of truth: `dashboards/` directory in Butler repo (`infra/dashboards/`)
- Provider: `Casa Lima` folder, `disableDeletion: true`, `editable: false`

### Dashboard JSON Requirements

1. **Datasource references** must use UIDs, not names:
   ```json
   "datasource": { "type": "prometheus", "uid": "prometheus" }
   ```
   Never use `${DS_PROMETHEUS}` variable syntax — it doesn't resolve in file-based provisioning.

2. **Required fields**: `uid` (kebab-case, matches manifest), `title`, `tags` (include layer)

3. **Strip before committing**: Remove `id`, `version` fields (Grafana auto-assigns these)

### Directory Structure

```
dashboards/
├── infrastructure-overview.json
├── service-availability.json
├── pihole-dns.json
├── infrastructure/
│   ├── hardware-health.json
│   ├── cron-job-health.json
│   ├── cloud-costs.json
│   ├── smart-disk-health.json
│   └── ...
├── network/
│   ├── cloudflare-analytics.json
│   ├── fortigate-security.json
│   ├── network-lan-wifi.json
│   └── network-wan.json
├── applications/
│   ├── butler-gateway.json
│   ├── atelier-backend.json
│   └── atelier-platform.json
└── smarthome/
    └── smart-home.json
```

### Creating a New Dashboard

1. Build in Grafana UI or create JSON manually
2. Export via API: `GET /api/dashboards/uid/<uid>` → `jq '.dashboard | del(.id, .version)'`
3. Ensure datasource UIDs are correct (`prometheus`, `loki`)
4. Save to `dashboards/<layer>/` in Butler repo
5. Copy to UNRAID: `/mnt/user/appdata/grafana/data/dashboards/`
6. Restart Grafana: `docker restart grafana`
7. Update manifest `observability.dashboard` field
8. Update `home-docs/docs/observability/dashboards.md` inventory

---

## Instrumenting a New Service

### Node.js (prom-client)

Butler Gateway pattern — 13 custom metrics:

```typescript
import client from 'prom-client';

// Enable default Node.js metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics();

// Custom metrics
const httpDuration = new client.Histogram({
  name: 'service_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

// Expose endpoint (must be unauthenticated)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});
```

**Butler's custom metrics (reference):**
| Metric | Type | Labels |
|--------|------|--------|
| `butler_queries_total` | Counter | source, provider, role |
| `butler_tool_calls_total` | Counter | mcp_server, category, result |
| `butler_guardian_verdicts_total` | Counter | verdict, source_layer |
| `butler_mcp_servers_connected` | Gauge | — |
| `butler_mcp_tools_available` | Gauge | — |
| `butler_trail_entries_total` | Gauge | — |
| `butler_provider_health` | Gauge | provider, type |
| `butler_http_request_duration_seconds` | Histogram | method, route, status_code |
| `butler_llm_tokens_total` | Counter | model, type |
| `butler_tool_call_duration_seconds` | Histogram | server, tool |
| `butler_guardian_evaluation_duration_seconds` | Histogram | phase |
| `butler_r2_storage_bytes` | Gauge | bucket |
| `butler_r2_storage_limit_bytes` | Gauge | bucket |

### Swift/Vapor

Atelier Backend pattern — hand-built Prometheus text format:

```swift
// In routes.swift, register metrics route outside auth middleware:
app.get("metrics") { req async -> Response in
    let body = buildMetricsText()
    return Response(status: .ok, headers: ["Content-Type": "text/plain; version=0.0.4"], body: .init(string: body))
}
```

**Auth bypass is critical**: The `/metrics` endpoint MUST be excluded from JWT authentication. In Butler, add to `PUBLIC_PREFIXES` in `jwt-plugin.ts`. In Atelier Backend, add to `exemptPaths` in `JWTAuthMiddleware.swift`.

### Metric Naming Conventions

```
<namespace>_<name>_<unit>
```

| Namespace | Service |
|-----------|---------|
| `butler_` | Butler Gateway |
| `atelier_` | Atelier Backend |
| `casa:` | Recording rules (pre-computed, colon separator) |

**Units**: `_seconds` for durations, `_bytes` for sizes, `_total` for counters, `_percent` for ratios (0-100).

---

## Cron Job Observability

All UNRAID cron jobs are wrapped with `cron-wrapper.sh` for Prometheus metrics and alerting. **Any new recurring script MUST be integrated into this system.**

### How It Works

```
cron triggers → cron-wrapper.sh <job-name> <command>
                    ├── Runs the command
                    ├── Captures exit code + duration
                    ├── Writes metrics to cron.prom (textfile collector)
                    └── Persists state in /mnt/user/appdata/cron-metrics/<job>.state
```

### Metrics Exported

| Metric | Type | Description |
|--------|------|-------------|
| `casa_cron_last_run_timestamp{job}` | gauge | Unix timestamp of last execution |
| `casa_cron_last_success_timestamp{job}` | gauge | Unix timestamp of last successful run |
| `casa_cron_last_duration_seconds{job}` | gauge | Duration of last run in seconds |
| `casa_cron_last_exit_code{job}` | gauge | Exit code (0 = success) |
| `casa_cron_runs_total{job,status}` | counter | Cumulative runs by success/failure |

### Adding a New Cron Job (Mandatory Steps)

When creating a new recurring script:

1. **Create the script** in `infra/scripts/<name>.sh`
2. **Add a wrapped cron entry** to `infra/configs/cron/casa-lima`:
   ```cron
   */N * * * * root /bin/bash $WRAPPER <job-name> /bin/bash $SCRIPTS/<name>.sh > /dev/null 2>&1
   ```
3. **Add a staleness alert** to `infra/configs/prometheus/rules/cron.yml`:
   ```yaml
   - alert: CronJobStale<Interval>
     expr: (time() - casa_cron_last_run_timestamp{job="<job-name>"}) > <3x_interval_seconds>
     for: 5m
     labels:
       severity: warning
       system: cron
       layer: infrastructure
     annotations:
       summary: "<job-name> stale"
       description: "<job-name> hasn't run in expected window."
       dashboard_url: "/d/cron-job-health/cron-job-health"
   ```
4. **Update cron-strategy.md** — add the job to the inventory table
5. **Deploy**:
   - Sync repo to UNRAID
   - `cp .../casa-lima /etc/cron.d/casa-lima` (or wait for next reboot)
   - `cp cron.yml to /mnt/user/appdata/prometheus/rules/ && docker kill --signal=SIGHUP prometheus`

### Current Alert Rules (cron.yml)

| Alert | Trigger | Severity |
|-------|---------|----------|
| `CronJobFailed` | Any job exits non-zero | warning |
| `CronJobPersistentFailure` | 3+ failures in 30 min | critical |
| `CronJobStale5m` | 5-min jobs not run in 15 min | warning |
| `CronJobStale10m` | repo-sync not run in 30 min | warning |
| `CronJobStale15m` | mkdocs-sync not run in 45 min | warning |
| `CronJobStaleWeekly` | Weekly jobs not run in 8 days | warning |
| `CronJobStaleMonthly` | test-restore not run in 35 days | warning |
| `CronMetricsMissing` | No cron metrics at all for 30 min | critical |

### Dashboard

**Cron Job Health** (`/d/cron-job-health/cron-job-health`) — shows status, staleness, duration trends, failure counts for all wrapped jobs.

---

## Logging (Loki)

### Collection

Promtail auto-discovers Docker containers and ships logs to Loki. No per-container configuration needed — just write to stdout/stderr.

### Structured Logging Standard

All services should emit JSON to stdout:

```json
{
  "timestamp": "2026-03-17T10:30:00Z",
  "level": "info",
  "service": "butler-gateway",
  "request_id": "uuid-v4",
  "operation": "query.execute",
  "duration_ms": 1523,
  "user_id": "operator-uuid",
  "message": "Query completed successfully"
}
```

### Loki Derived Fields

The Loki datasource has a derived field linking `container_name` labels to cAdvisor dashboard panels — one-click from log line to container metrics.

### Log-Based Alert Rules (Loki Ruler)

Network security alerts use LogQL in `configs/prometheus/rules/network-security.yml`:

```yaml
# Example: Loki ruler alert
- alert: WanDenySpikeDetected
  expr: |
    sum(count_over_time({job="fortigate-syslog"} |~ "action=deny" [5m])) > 50
  for: 5m
  labels:
    severity: warning
    system: fortigate
    layer: network
```

---

## Deployment Flow

### Adding Observability to a New Container

1. **Instrument**: Add `/metrics` endpoint (unauthenticated)
2. **Manifest**: Add `observability:` block to container manifest
3. **Scrape config**: Add target to `configs/prometheus/prometheus.yml`
4. **Alert rules**: Add rules to appropriate `configs/prometheus/rules/<layer>.yml`
5. **Dashboard**: Create JSON in `dashboards/<layer>/`
6. **Deploy to UNRAID**:
   - Sync prometheus.yml → `docker kill --signal=SIGHUP prometheus`
   - Sync rule files → `docker kill --signal=SIGHUP prometheus`
   - Sync dashboard JSON → `docker restart grafana`
7. **Verify**:
   - Prometheus targets page: new target shows UP
   - Grafana: dashboard renders data
   - `promtool check rules` passes
8. **Documentation**: Update `home-docs/docs/observability/` (metrics.md, alerting.md, dashboards.md)
9. **Uptime Kuma**: Create monitor (handled by `deploy-container` skill)

### Reload Commands (via UNRAID MCP)

```bash
# Prometheus (config + rules)
docker kill --signal=SIGHUP prometheus

# Grafana (dashboards)
docker restart grafana

# Alertmanager
docker kill --signal=SIGHUP alertmanager

# Validate before reload
docker exec prometheus promtool check config /etc/prometheus/prometheus.yml
docker exec prometheus promtool check rules /etc/prometheus/rules/*.yml
```

---

## MCP Tools for Observability

The Observability MCP (`observability` server) provides direct access to all four backends:

**Prometheus**: `query_instant`, `query_range`, `list_metrics`, `list_targets`, `list_rules`, `list_alerts`, `find_series`, `get_metric_metadata`, `get_tsdb_stats`

**Loki**: `loki_query_logs`, `loki_query_metric`, `loki_list_labels`, `loki_list_label_values`, `loki_series`, `loki_stats`

**Alertmanager**: `am_list_alerts`, `am_list_alert_groups`, `am_list_silences`, `am_create_silence`, `am_delete_silence`, `am_list_receivers`, `am_get_status`

**Grafana**: `grafana_search_dashboards`, `grafana_get_dashboard`, `grafana_list_folders`, `grafana_list_annotations`, `grafana_create_annotation`

Use these tools to query live state, verify deployments, and investigate alerts.

---

## Troubleshooting

### Target Not Scraping

1. Check Prometheus targets: `query_instant` with `up{job="job-name"}`
2. Verify endpoint is reachable: `curl http://container:port/metrics` (via UNRAID MCP)
3. Check auth bypass: `/metrics` must not require JWT
4. Verify Prometheus config was reloaded after editing

### Alert Not Firing

1. Validate rule syntax: `promtool check rules`
2. Check Prometheus `/alerts` page for rule state
3. Verify labels match routing rules in Alertmanager
4. Check Alertmanager `/api/v2/alerts` for suppressed alerts

### Dashboard Shows No Data

1. Verify datasource UID matches (`prometheus` or `loki`)
2. Check metric name exists: `list_metrics` with keyword filter
3. Verify time range covers available data
4. Check if recording rule is evaluating: `query_instant` with `casa:*` metric

### Grafana Won't Start

1. Check for circular datasource references (Loki derived fields referencing Prometheus)
2. Delete SQLite DB if migrating from UI-provisioned to file-provisioned: stop Grafana, remove `grafana.db`, restart
3. Verify dashboard JSON is valid: `jq . < dashboard.json`

---

## Quick Reference

| Action | Command |
|--------|---------|
| Reload Prometheus | `docker kill --signal=SIGHUP prometheus` |
| Reload Alertmanager | `docker kill --signal=SIGHUP alertmanager` |
| Reload Grafana | `docker restart grafana` |
| Validate rules | `docker exec prometheus promtool check rules /etc/prometheus/rules/*.yml` |
| Validate config | `docker exec prometheus promtool check config /etc/prometheus/prometheus.yml` |
| Test alert | `curl -X POST http://localhost:9093/api/v2/alerts -d '[{"labels":{"alertname":"Test"}}]'` |
| Check targets | Observability MCP → `list_targets` |
| Query metric | Observability MCP → `query_instant` |
| Check firing alerts | Observability MCP → `am_list_alerts` |
| View logs | Observability MCP → `loki_query_logs` |
