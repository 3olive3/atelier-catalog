---
name: home-network
description: "Casa Lima network architecture — VLANs, Fortigate firewall (DNS + DHCP authoritative), FortiSwitch, FortiAP, NGINX reverse proxy, and Cloudflare tunnels/Zero Trust."
---

# Home Network

Casa Lima network architecture reference and operational procedures. Covers VLANs, firewall, switching, wireless, DNS, reverse proxy, and Cloudflare integration.

## Network Topology

```
Internet → Fortigate 61F (HA, DNS + DHCP authoritative) → FortiSwitch (x2) → FortiAP-231F (x3)
                                      ↓
                              UNRAID (HP DL380 Gen9)
                              NGINX Proxy Manager
                              Container fleet
```

## VLAN Architecture

| VLAN ID | Name | Subnet | Purpose |
|---------|------|--------|---------|
| 1 | Default/Management | 10.1.1.0/24 | Fortigate, switches, APs |
| 3 | Servers | 10.1.3.0/24 | UNRAID, Docker containers |
| 6 | Trusted | 10.1.6.0/24 | Family devices, workstations |
| 7 | IoT | 10.1.7.0/24 | Smart home, Shelly, cameras |
| 8 | Guest | 10.1.8.0/24 | Guest WiFi, isolated |
| 11 | DMZ_PUBLIC | 10.10.11.0/24 | Public-facing services (Minecraft) |

### Key Addressing

- **UNRAID/Tower**: 10.1.3.100 (VLAN 3 / MGT)
- **NGINX Proxy Manager**: 10.10.10.1 (macvlan `br0.10`, VLAN 10 / DMZ) — NOT on atelier-network
- **Fortigate**: 10.1.1.254 (mgmt) / 10.1.3.254 (VLAN 3 gateway + DNS) — authoritative DNS server for `3olive3.com`

---

## Fortigate Firewall

### Policy Structure

Policies control inter-VLAN traffic. Key principle: **deny by default, allow by policy**.

- Use address objects and groups for source/destination
- Use service objects and groups for ports
- **Always get explicit user approval before any firewall write operation**

### Common Operations

| Task | MCP Tool |
|------|----------|
| List all policies | `fortigate_list_policies` |
| View policy detail | `fortigate_get_policy` |
| List address objects | `fortigate_list_address_objects` |
| List service objects | `fortigate_list_service_objects` |
| DHCP leases | `fortigate_list_dhcp_leases` |
| DHCP servers + reservations | `fortigate_list_dhcp_servers` |
| Static routes | `fortigate_list_static_routes` |
| VPN status | `fortigate_get_vpn_status` |
| System health | `fortigate_get_system_status` |

### Write Operations (require user approval)

- `fortigate_create_policy` / `fortigate_update_policy` / `fortigate_delete_policy`
- `fortigate_create_address_object` / `fortigate_create_service_object`
- `fortigate_create_dhcp_reservation`
- `fortigate_create_static_route`

---

## FortiSwitch & FortiAP

### Switches
- Managed via FortiGate switch-controller
- `fortigate_list_managed_switches` — inventory
- `fortigate_get_managed_switch` — port configs, VLANs, PoE
- `fortigate_get_switch_port_stats` — link status, TX/RX, errors
- `fortigate_update_switch_port` — change VLAN, speed, PoE (requires approval)

### Wireless
- 3x FortiAP-231F managed via FortiGate wireless-controller
- `fortigate_list_managed_aps` — AP inventory and status
- `fortigate_list_wifi_clients` — connected clients
- `fortigate_list_ssids` — SSID definitions
- `fortigate_list_wtp_profiles` — radio configuration templates
- `fortigate_update_ssid` — modify SSID settings (requires approval)

---

## DNS Architecture

### Internal (FortiGate DNS Database)

FortiGate is the primary DNS for all VLANs. DHCP scopes push FortiGate's per-interface IP as DNS (`dns-service: default`). The DNS Database zone `3olive3-com` (domain `3olive3.com`, view `shadow`, mode `recursive`) holds all local records.

- **CNAME records**: `service.3olive3.com → nginx.3olive3.com` (most services behind NPM)
- **A records**: direct IP mappings for infrastructure (nginx, tower, unraid, netbox, ilo, game servers)
- **Upstream**: DoH to `3olive3.cloudflare-gateway.com` (Cloudflare Zero Trust — applies block policies for adult/security categories)
- **Interfaces serving DNS** (in `system dns-server`): MGT-DEVICES, MGT_NET, Home1_W1, home1, DMZ_SERVERS, DMZ_PUBLIC, fortilink — all `mode: recursive`

#### Managing records

FortiGate REST API (`/api/v2/cmdb/system/dns-database/3olive3-com`) or web UI (Network → DNS Servers → DNS Database). Dedicated MCP tools pending — see task to add `fortigate_*` DNS Database tools.

Until MCP tools land, use curl via UNRAID (token in vault item "Fortigate 60F" / butler-api):
```bash
# Add an A record
curl -sk -X POST -H "Authorization: Bearer $FG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"newservice","type":"A","ip":"10.1.3.100","status":"enable"}' \
  "https://10.1.1.254/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry"

# Add a CNAME
curl -sk -X POST -H "Authorization: Bearer $FG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"newservice","type":"CNAME","canonical-name":"nginx.3olive3.com","status":"enable"}' \
  "https://10.1.1.254/api/v2/cmdb/system/dns-database/3olive3-com/dns-entry"
```

### External (Cloudflare)

Domain `3olive3.com` is on Cloudflare. External DNS records for public services.

- `cloudflare_list_dns_records` — view records
- `cloudflare_create_dns_record` / `cloudflare_update_dns_record` — manage records
- Most internal services don't need external DNS (FortiGate handles `*.3olive3.com` internally for LAN clients)

### Zero Trust DNS Filtering

FortiGate's upstream is the Cloudflare Zero Trust Gateway endpoint `3olive3.cloudflare-gateway.com` (DoH). All non-local queries are filtered by Gateway policies before resolving.

- `cloudflare_list_gateway_rules` — view active DNS policies
- Manage policies at <https://one.dash.cloudflare.com> → Gateway → Firewall Policies → DNS

---

## Reverse Proxy (NGINX Proxy Manager)

All HTTPS services go through NGINX Proxy Manager.

**Traffic flow**: Client → FortiGate DNS (CNAME) → NGINX (10.10.10.1, DMZ) → Fortigate policy #50 → Container (10.1.3.100:PORT, MGT)

**IMPORTANT**: NGINX is on macvlan (DMZ VLAN 10), containers are on VLAN 3 (MGT). Every container port must be added to the `3OLIVE3_NGINX_PROXY` Fortigate service group or NGINX gets 504. See `firewall-flows` skill for full details.

- `nginx_list_proxy_hosts` — all proxy hosts with status
- `nginx_create_proxy_host` — new proxy host
- `nginx_list_certificates` — SSL certs
- `nginx_renew_certificate` — renew Let's Encrypt cert

Standard proxy host config:
- Block exploits: enabled
- SSL forced: yes
- HTTP/2: yes
- WebSocket: enable for real-time apps

---

## Cloudflare Integration

### Tunnels

Cloudflare Tunnel (`cloudflared`) provides secure external access without exposing ports.

- `cloudflare_list_tunnels` — tunnel status
- `cloudflare_get_tunnel_config` — ingress rules (hostname → service mapping)
- `cloudflare_get_tunnel_connections` — active connectors

### Zero Trust / WARP

- `cloudflare_list_zt_devices` — enrolled WARP devices
- `cloudflare_get_split_tunnel_config` — what goes through WARP
- `cloudflare_get_local_domain_fallback` — domains resolved by local DNS
- `cloudflare_list_tunnel_routes` — private network routes for WARP

### WAF & Security

- `cloudflare_list_firewall_rules` — custom WAF rules
- `cloudflare_list_ip_access_rules` — IP blocks/allowlists
- `cloudflare_get_zone_analytics` — traffic analytics

---

## Network Config Backup (Unimus)

- `unimus_list_devices` — managed network devices
- `unimus_get_latest_backup` — current device config
- `unimus_get_backup_diff` — compare config versions
- `unimus_find_devices_with_changes` — recent config changes

---

## Gotchas

- **Fortigate session table** — old sessions persist after policy changes; may need CLI clear
- **CNAME target** — always `nginx.3olive3.com`, not the container IP directly (canonical name is on the A record list)
- **DNS service per interface** — adding records to `dns-database` alone doesn't expose them; the interface must have an entry in `system dns-server` (mode `recursive`) too
- **VLAN 11 (DMZ)** — macvlan networking, requires Fortigate VIP for port forwarding
- **Cloudflare proxy (orange cloud)** — hides origin IP but adds latency; disable for internal-only records
- **FortiAP firmware** — managed by FortiGate; don't update APs independently
- **Bandwidth testing** — use `iperf3_run_bandwidth_test` (requires iperf3 server on target)
