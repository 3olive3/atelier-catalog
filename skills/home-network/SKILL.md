---
name: home-network
description: "Casa Lima network architecture — VLANs, Fortigate firewall (DNS + DHCP authoritative), FortiSwitch, FortiAP, NGINX reverse proxy, and Cloudflare tunnels/Zero Trust."
---

# Home Network

Casa Lima network architecture reference and operational procedures. Covers VLANs, firewall, switching, wireless, DNS, reverse proxy, and Cloudflare integration.

## Network Topology

```
Internet → Fortigate 61F (HA, DNS + DHCP authoritative) → FortiSwitch (x2) → FortiAP (x4)
                                      ↓
                              UNRAID (HP DL380 Gen9)
                              NGINX Proxy Manager
                              Container fleet
```

## VLAN Architecture

Verified against the device 2026-08-16. An earlier version of this table listed a
VLAN 7 (IoT) and VLAN 8 (Guest) that **do not exist**, omitted VLAN 4 and 20, and
called VLAN 6 "Trusted" when it is the wireless VLAN. Confirm with
`fortigate_list_interfaces` rather than trusting any table, including this one.

| VLAN ID | Interface | Subnet | Alias | Purpose |
|---------|-----------|--------|-------|---------|
| 3 | `MGT-DEVICES` | 10.1.3.0/24 | MGT-Devices | UNRAID, Docker containers |
| 4 | `home1` | 10.1.4.0/24 | LAN_H1 | Wired home LAN. Intended as the future dedicated IoT VLAN |
| 6 | `Home1_W1` | 10.1.6.0/24 | WIFI_H1 | **All wireless clients**, plus the PoE cameras. Every SSID lands here |
| 10 | `DMZ_SERVERS` | 10.10.10.0/24 | Servers | NGINX Proxy Manager (10.10.10.1, macvlan) |
| 11 | `DMZ_PUBLIC` | 10.10.11.0/24 | DMZ Public | Public-facing services (Minecraft) |
| 15 | `WAN_LINK` | — | WAN_LINK | Uplink |
| 20 | `MGT_NET` | 10.1.2.0/24 | MGM-NET | Out-of-band management (iLO 10.1.2.21) |

FortiGate management is 10.1.1.254; the fortilink-internal VLANs (1, 4088–4093:
`vsw`, `nac_segment`, `onboarding`, `cam`, `voi`, `snf`, `qtn`) are switch-controller
plumbing, not user networks.

**Note for smart-home work**: wired and wireless devices currently share VLAN 6,
so HomeKit/Matter discovery between them is intra-VLAN. VLAN 4 is prepared for an
IoT split (IPv6 + mDNS reflection both configured) but nothing has been moved.

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
4 APs: 2x FortiAP-U231F (Office, Suite), 1x FortiAP-231F (Garagem), 1x FortiAP-231K (Office, replaced the U231F 2026-08-15 — the 231K has a real 6GHz radio-3, unlike the older units where radio-3 is monitor-only).

- `fortigate_list_managed_aps` — AP inventory and status
- `fortigate_list_wifi_clients` — connected clients
- `fortigate_list_ssids` — SSID definitions
- `fortigate_list_wtp_profiles` / `fortigate_get_wtp_profile` — radio templates
- `fortigate_update_ssid` — modify an SSID (requires approval)
- `fortigate_create_ssid` — new SSID (requires approval)
- `fortigate_update_wtp_profile_radio` — channels, band, bonding, SSID assignment (requires approval)

**Channel plan**: 2.4GHz restricted to 1/6/11 on every profile. 5GHz is DFS-inclusive (36–157) — that is the FortiOS default and correct here; going non-DFS-only leaves too few channels for 4 APs. Channel 140 is not a valid 40MHz primary in this region and the device rejects it.

**6GHz**: mandates WPA3-SAE with PMF — it rejects WPA2 and transition mode outright. It therefore needs its own SSID, and FortiOS will not let two VAPs share one SSID string, so it cannot reuse the 2.4/5GHz name.

**Assignment**: a new SSID does not broadcast until `update_wtp_profile_radio` puts it on a radio, and `vap-all` must be `manual` for an explicit list to apply.

### Interfaces, IPv6 and multicast
- `fortigate_list_interfaces` / `fortigate_get_interface` — VLAN tag, addressing, IPv6 block
- `fortigate_set_interface_ipv6` — address, mode, router advertisements (requires approval)
- `fortigate_set_interface_igmp_snooping` — per-interface (requires approval)
- `fortigate_get_igmp_snooping` / `fortigate_set_igmp_snooping` — global switch settings
- `fortigate_list_multicast_policies` / `fortigate_create_multicast_policy`

**For HomeKit/Matter/AirPlay discovery**, the things that actually matter:
- `flood-unknown-multicast` **enabled** globally, so the switch does not drop multicast for groups it has not learned
- per-interface IGMP snooping **disabled** on home VLANs
- `multicast-forward` enabled in `system settings` (global) — without it, multicast policies do nothing
- a `firewall multicast-policy` per direction for UDP/5353 to 224.0.0.251
- IPv6 with SLAAC (`ip6-send-adv`, managed/other flags off) — Matter requires IPv6; Thread border routers do not expect DHCPv6

A multicast policy referencing a **deleted address object stops matching silently**. That had happened here: five deleted objects (`Bonjour`, `all_hosts`, `all_routers`, `EIGRP`, `OSPF`) had quietly broken the whole Bonjour setup with no error anywhere. Cross-check policy address names against `fortigate_list_address_objects`.

---

## DNS Architecture

### Internal (FortiGate DNS Database)

FortiGate is the primary DNS for all VLANs. DHCP scopes push FortiGate's per-interface IP as DNS (`dns-service: default`). The DNS Database zone `3olive3-com` (domain `3olive3.com`, view `shadow`, mode `recursive`) holds all local records.

- **CNAME records**: `service.3olive3.com → nginx.3olive3.com` (most services behind NPM)
- **A records**: direct IP mappings for infrastructure (nginx, tower, unraid, netbox, ilo, game servers)
- **Upstream**: DoH to `3olive3.cloudflare-gateway.com` (Cloudflare Zero Trust — applies block policies for adult/security categories)
- **Interfaces serving DNS** (in `system dns-server`): MGT-DEVICES, MGT_NET, Home1_W1, home1, DMZ_SERVERS, DMZ_PUBLIC, fortilink — all `mode: recursive`

#### Managing records

**Use the MCP tools** (added 2026-08-16 — this section previously told you to curl the REST API; that is no longer necessary):

| Task | Tool |
|------|------|
| List zones and record counts | `fortigate_list_dns_zones` |
| Find a record | `fortigate_list_dns_records` (takes `hostFilter` — the main zone holds ~94) |
| Add a record | `fortigate_create_dns_record` (requires approval) |
| Remove a record | `fortigate_delete_dns_record` (requires approval) |

```
fortigate_create_dns_record(zone="3olive3-com", hostname="newservice",
                            type="CNAME", canonicalName="nginx.3olive3.com")
```

Zone is `3olive3-com` (domain `3olive3.com`). **Prefer CNAME to `nginx.3olive3.com`** over an A record — an A record straight to a container IP bypasses NGINX Proxy Manager and therefore its TLS.

`create_dns_record` refuses to add a duplicate hostname+type, and both write tools rewrite the zone's whole `dns-entry` array, so they abort rather than write if the read comes back in an unexpected shape. That guard exists because the equivalent DHCP tool would otherwise have deleted all 36 reservations on a bad read.

The web UI (Network → DNS Servers → DNS Database) remains available for anything the tools do not cover.

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
