---
name: dns-sync
description: "FortiGate → NetBox → Pihole DHCP/DNS synchronization pipeline, IP address management via NetBox, and DNS record lifecycle."
---

# DNS Sync & IPAM

The Casa Lima DHCP-to-DNS synchronization pipeline and IP address management system. Three automated sync jobs keep FortiGate DHCP leases, NetBox IPAM, and Pihole DNS in sync.

## Pipeline Architecture

```
FortiGate DHCP ──(Job A: 5min)──→ NetBox IPAM ──(Job B: webhook)──→ Pihole DNS
                                       ↑
                               Pihole ──(Job C: 1hr)──→ NetBox
```

### Sync Jobs

| Job | Direction | Trigger | Purpose |
|-----|-----------|---------|---------|
| **A** | FortiGate → NetBox | Every 5 minutes | Sync DHCP leases to NetBox IP addresses |
| **B** | NetBox → Pihole | Webhook on IP change | Create/update Pihole A records from NetBox |
| **C** | Pihole → NetBox | Every 1 hour | Backfill Pihole A records into NetBox |

### Source Code

Located in `~/Developer/IPAM AND DNS/`:
- Python 3 + Flask webhook
- Runs as a container on UNRAID

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

## Adding a New Static DNS Entry

### Step 1: Reserve IP in NetBox

```
ipam_create_ip_address
  address: "10.1.3.50/24"
  status: "active"
  dns_name: "myservice.3olive3.com"
  description: "My Service"
  # Do NOT add dhcp-dynamic tag — this is a static record
```

### Step 2: Create Pihole Record

For services behind NGINX (most common):
```
pihole_add_cname
  alias: "myservice.3olive3.com"
  target: "nginx.3olive3.com"
```

For direct IP mapping (no proxy):
```
# Job B webhook will create the A record from NetBox automatically
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

### Check Pihole
```
pihole_get_dns_stats → query stats, blocklist size
pihole_list_cnames → verify CNAME records
```

### Check FortiGate DHCP
```
fortigate_list_dhcp_leases → active leases
fortigate_list_dhcp_servers → server configs + reservations
```

### Cross-Reference

Compare counts: FortiGate leases ≈ NetBox `dhcp-dynamic` IPs ≈ Pihole A records. Small differences are normal (timing, offline devices).

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
- **Webhook latency** — Job B fires on NetBox change; Pihole update is near-instant but depends on container health
- **Pihole CNAME vs A record** — services behind NGINX use CNAMEs; direct-access services use A records
- **Duplicate DNS names** — NetBox allows duplicate dns_name; Pihole does not. Sync job B handles conflict by overwriting
- **IP conflicts** — always check `ipam_get_available_ips` before assigning manually
- **Fortigate DHCP server ID** — use `fortigate_list_dhcp_servers` to find the correct server ID for the target VLAN
