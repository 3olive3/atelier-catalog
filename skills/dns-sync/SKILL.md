---
name: dns-sync
description: "FortiGate DHCP → NetBox IPAM → FortiGate DNS Database synchronization pipeline, IP address management via NetBox, and DNS record lifecycle."
---

# DNS Sync & IPAM

The Casa Lima DHCP-to-DNS synchronization pipeline and IP address management system. Two automated sync jobs keep FortiGate DHCP leases, NetBox IPAM, and the FortiGate DNS Database in sync. **Pi-hole was decommissioned in May 2026**; FortiGate (`10.1.3.254` / `10.1.1.254`) is now the authoritative DNS for `3olive3.com` via its `system dns-database` zone `3olive3-com` (view `shadow`, mode `recursive`).

> **Status:** The sync service implementation is being rewritten — see task "Rebuild netbox-dhcp-sync". This skill describes the **target architecture** that users will follow going forward.

## Pipeline Architecture

```
FortiGate DHCP ──(Job A: 5min)──→ NetBox IPAM ──(Job B': webhook + reconcile)──→ FortiGate DNS Database
                                                                                  (zone 3olive3-com)
```

Two jobs only — both flow outward from NetBox. FortiGate is the source of DHCP truth, so there is no second source to import from (the old Pi-hole → NetBox backfill is gone).

### Sync Jobs

| Job | Direction | Trigger | Purpose |
|-----|-----------|---------|---------|
| **A** | FortiGate DHCP → NetBox | Every 5 minutes | Sync DHCP leases to NetBox IP addresses (unchanged from previous architecture) |
| **B'** | NetBox → FortiGate DNS Database | Webhook on IP change + periodic reconcile | Create/update DNS entries in zone `3olive3-com` from NetBox; reconcile pass catches missed webhooks |

### Source Code

Located in `~/Developer/IPAM AND DNS/` (rewrite in progress — see task "Rebuild netbox-dhcp-sync"):
- Python 3 + Flask webhook
- Runs as a container on UNRAID
- Job B' replaces the previous Pi-hole-targeted Job B; calls FortiGate REST API `/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry` for CRUD operations

---

## Critical: dhcp-dynamic Tag

The `dhcp-dynamic` tag in NetBox is a **safety guard**. It distinguishes DHCP-synced records from manually created static records.

- **Tagged `dhcp-dynamic`**: safe to auto-update/delete during sync
- **NOT tagged**: treated as static — sync jobs will **never** modify or delete these
- When creating static DNS entries in NetBox, **do not** add the `dhcp-dynamic` tag

---

## NetBox IPAM Operations

### Querying

| Task | MCP Tool |
|------|----------|
| List IPs in a subnet | `ipam_list_ip_addresses` with `address` filter |
| Find IP by DNS name | `ipam_list_ip_addresses` with `dns_name` filter |
| List all prefixes | `ipam_list_prefixes` |
| Find available IPs | `ipam_get_available_ips` with prefix ID |
| List VLANs | `ipam_list_vlans` |
| List devices | `ipam_list_devices` |
| Search anything | `ipam_search_netbox` |

### Creating Records

| Task | MCP Tool |
|------|----------|
| Reserve an IP | `ipam_create_ip_address` with `status: reserved` |
| Allocate next available | `ipam_allocate_next_ip` from a prefix |
| Create a prefix | `ipam_create_prefix` |
| Update IP details | `ipam_update_ip_address` |

---

## How To Add A Record

### Step 1: Reserve IP in NetBox

```
ipam_create_ip_address
  address: "10.1.3.50/24"
  status: "active"
  dns_name: "myservice.3olive3.com"
  description: "My Service"
  # Do NOT add dhcp-dynamic tag — this is a static record
```

### Step 2: Create FortiGate DNS Entry

For services behind NGINX (most common — CNAME to `nginx.3olive3.com`):

```bash
# Token from vault item "Fortigate 60F" / butler-api
curl -sk -X POST -H "Authorization: Bearer $FG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"myservice","type":"CNAME","canonical-name":"nginx.3olive3.com","status":"enable"}' \
  "https://10.1.1.254/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry"
```

For direct IP mapping (no proxy):

```
# Job B' webhook will create the A record in zone 3olive3-com from NetBox automatically.
# Manual fallback if the sync service is down:
curl -sk -X POST -H "Authorization: Bearer $FG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"myservice","type":"A","ip":"10.1.3.50","status":"enable"}' \
  "https://10.1.1.254/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry"
```

### Step 3: Create DHCP Reservation (if applicable)

If the device gets its IP via DHCP, create a static reservation:

```
fortigate_create_dhcp_reservation
  serverId: <DHCP server ID from fortigate_list_dhcp_servers>
  ip: "10.1.3.50"
  mac: "AA:BB:CC:DD:EE:FF"
  description: "My Service"
```

---

## Verifying Sync Health

### Check NetBox
```
ipam_check_netbox_health → should return HEALTHY
ipam_list_ip_addresses → verify record count
```

### Check FortiGate DNS
```bash
# Resolve from inside the network against the authoritative server
dig +short myservice.3olive3.com @10.1.3.254

# List DNS-database entries via REST
curl -sk -H "Authorization: Bearer $FG_TOKEN" \
  "https://10.1.1.254/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry"
```

### Check FortiGate DHCP
```
fortigate_list_dhcp_leases → active leases
fortigate_list_dhcp_servers → server configs + reservations
```

### Cross-Reference

Compare counts: FortiGate leases ≈ NetBox `dhcp-dynamic` IPs ≈ FortiGate DNS-database A records in zone `3olive3-com`. Small differences are normal (timing, offline devices).

---

## Prefix / VLAN Reference

| Prefix | VLAN | Name | NetBox Status |
|--------|------|------|---------------|
| 10.1.1.0/24 | 1 | Management | active |
| 10.1.3.0/24 | 3 | Servers | active |
| 10.1.6.0/24 | 6 | Trusted | active |
| 10.1.7.0/24 | 7 | IoT | active |
| 10.1.8.0/24 | 8 | Guest | active |
| 10.10.11.0/24 | 11 | DMZ_PUBLIC | active |

---

## Gotchas

- **dhcp-dynamic tag** — never add to static records; never remove from DHCP-synced records
- **Webhook latency** — Job B' fires on NetBox change; FortiGate DNS-database update is near-instant but depends on FortiGate API availability. The reconcile pass catches any missed webhooks.
- **CNAME vs A record** — services behind NGINX use CNAMEs to `nginx.3olive3.com`; direct-access services use A records
- **DNS service per interface** — adding records to `dns-database` alone doesn't expose them; the interface must have an entry in `system dns-server` (mode `recursive`) too. The six serving interfaces are pre-configured (MGT-DEVICES, MGT_NET, Home1_W1, home1, DMZ_SERVERS, DMZ_PUBLIC, fortilink).
- **Duplicate DNS names** — NetBox allows duplicate `dns_name`; FortiGate DNS-database does not. Job B' resolves conflicts by overwriting the existing entry.
- **IP conflicts** — always check `ipam_get_available_ips` before assigning manually
- **Fortigate DHCP server ID** — use `fortigate_list_dhcp_servers` to find the correct server ID for the target VLAN
- **No Pi-hole backfill** — the old Job C (Pi-hole → NetBox) is gone. FortiGate is the sole DHCP source of truth; there is no second DNS server to import from.
