---
name: firewall-flows
description: "Fortigate firewall traffic flows for UNRAID services — NGINX reverse proxy path, service objects, service groups, cross-VLAN policies, and the mandatory steps to open a new container port."
---

# Firewall Flows — UNRAID Service Access

How traffic reaches UNRAID containers through the Fortigate firewall. **Read this before deploying any new container that needs reverse proxy or cross-VLAN access.**

## Why This Matters

NGINX Proxy Manager runs on a **macvlan** network (`br0.10`) with its own IP on the DMZ VLAN. UNRAID containers expose ports on the Servers VLAN. Traffic between them crosses VLANs through the Fortigate firewall, which blocks everything not explicitly allowed.

**If the container port is not in the firewall service group, NGINX gets a timeout (504) even though direct access from the same VLAN works fine.** This is the #1 cause of "it works on curl but not through the proxy" issues.

---

## Network Topology

```
Client (VLAN 6: 10.1.6.0/24)
  │
  ├─ DNS query ──► Pihole (10.1.3.53)
  │                returns CNAME: service.3olive3.com → nginx.3olive3.com
  │                nginx.3olive3.com → 10.10.10.1
  │
  ├─ HTTPS ──► NGINX Proxy Manager (10.10.10.1, VLAN 10 DMZ, macvlan br0.10)
  │             │
  │             │  *** CROSSES VLAN BOUNDARY — FORTIGATE POLICY REQUIRED ***
  │             │
  │             ├─ HTTP ──► UNRAID host port (10.1.3.100:XXXX, VLAN 3 MGT)
  │             │            │
  │             │            └─ Docker port map ──► Container (172.19.0.X:YYYY)
  │             │
  │             └─ Policy #50: "PROXIES to APPS - TOWER"
  │                srcintf: DMZ → dstintf: MGT
  │                srcaddr: NGINX, Cloudflared Tunnels → dstaddr: TOWER
  │                service: 3OLIVE3_NGINX_PROXY (service group)
```

### Key IPs

| Component | IP | VLAN | Network Type |
|-----------|-----|------|-------------|
| NGINX Proxy Manager | 10.10.10.1 | 10 (DMZ) | macvlan `br0.10` |
| UNRAID / Tower | 10.1.3.100 | 3 (MGT/Servers) | host |
| Pihole | 10.1.3.53 | 3 (MGT/Servers) | container |
| Containers (atelier-network) | 172.19.0.X | — | Docker bridge |

**NGINX is NOT on `atelier-network`.** It cannot reach containers by Docker hostname or bridge IP. It must go through the host-mapped port on `10.1.3.100`, which means traffic crosses VLANs via the Fortigate.

---

## The Gating Policy

**Policy #50 — "PROXIES to APPS - TOWER"**

| Field | Value |
|-------|-------|
| Source Interface | DMZ |
| Destination Interface | MGT |
| Source Address | NGINX, Cloudflared Tunnels |
| Destination Address | TOWER (10.1.3.100) |
| Service | `3OLIVE3_NGINX_PROXY` (service group) |
| Action | ACCEPT |
| NAT | disabled |

This single policy controls ALL traffic from NGINX to UNRAID containers. The service group `3OLIVE3_NGINX_PROXY` acts as the allowlist of ports.

---

## Mandatory Steps for New Container Port

### Step 1: Create Service Object

```
Tool: fortigate_create_service_object
  name:         "ServiceName_PORT"     (e.g., "AtelierBackend_8082")
  protocol:     "TCP/UDP/SCTP"
  tcpPortrange: "PORT"                 (e.g., "8082")
  comment:      "ServiceName container on UNRAID"
```

Naming convention: `ServiceName_PORT` (matches existing: `Butler_3100`, `OpenClaw_18789`).

### Step 2: Add to Service Group

```
Tool: fortigate_update_service_group
  name:    "3OLIVE3_NGINX_PROXY"
  members: [ ...existing members..., "ServiceName_PORT" ]
```

**CRITICAL: You must include ALL existing members plus the new one.** The `members` field replaces the entire list. Use `fortigate_list_service_objects` first to get current members.

### Step 3: Verify

From inside the NGINX container, test the port:

```bash
# Via UNRAID MCP:
docker exec Nginx-Proxy-Manager-Official curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://10.1.3.100:PORT/health
```

Expected: HTTP status code (200, 404, etc.) — anything except timeout (exit code 28).

---

## Other Traffic Flows

### Cloudflare Tunnel → Container

Same path as NGINX. Cloudflared containers are also in DMZ, and Policy #50 includes `Cloudflared Tunnels` as a source address. Same service group applies.

### LAN → Container (Direct)

Policy #42 "LAN to MGT" allows LAN (VLAN 6) → MGT (VLAN 3) with **ALL** services. No service object needed for direct LAN access. This is why `curl http://10.1.3.100:PORT` works from your Mac but the proxy fails.

### Other Policies Involving TOWER

| Policy | Flow | Service |
|--------|------|---------|
| #50 | NGINX/CF Tunnels → TOWER | `3OLIVE3_NGINX_PROXY` group |
| #18 | NGINX/CF Tunnels → Other MGT hosts | Specific services |
| #19 | MGT → LAN | ALL |
| #42 | LAN → MGT | ALL |

---

## Diagnostic Checklist (504 from NGINX)

When NGINX returns 504 Gateway Timeout for a new service:

1. **Direct test** — `curl http://10.1.3.100:PORT` from UNRAID. If this fails, container/port issue.
2. **NGINX-to-host test** — `docker exec Nginx-Proxy-Manager-Official curl --max-time 5 http://10.1.3.100:PORT`. If timeout → firewall.
3. **Check service group** — `fortigate_list_service_objects`, find `3OLIVE3_NGINX_PROXY` group, verify port is listed.
4. **Check policy** — `fortigate_get_policy(50)`, verify it's enabled and references the service group.
5. **Fortigate session table** — after adding the service, old denied sessions may be cached. Wait 30s or clear from FortiGate CLI.

---

## Gotchas

- **NGINX is on macvlan, not atelier-network** — it CANNOT use Docker hostnames or bridge IPs to reach containers. Always use `10.1.3.100:HOST_PORT`.
- **`fortigate_update_service_group` replaces members** — always fetch current list first, append your new service, then update. Missing this drops all other services.
- **Policy changes are WRITE operations** — always present to the user and get explicit confirmation before executing.
- **Port 80/443 (HTTP/HTTPS) are already allowed** — the base policy includes HTTP and HTTPS service objects. Only non-standard ports need a service object.
- **Pihole MCP `pihole_add_cname` is unreliable for Pihole v6** — verify the record actually exists in `/etc/pihole/pihole.toml` after adding. If missing, edit the file directly inside the `Pihole-v6` container.
