---
name: minecraft-ops
description: "Minecraft Paper server management on UNRAID — DMZ networking, macvlan, plugins, RCON, security layers, and Fortigate VIP configuration."
---

# Minecraft Operations

Management and operations for the Casa Lima Minecraft server running on UNRAID. Paper server with macvlan networking in the DMZ, 10 security layers, and RCON web admin.

## Architecture

```
Internet → Fortigate VIP (wan1:25565) → 10.10.11.5:25565 (macvlan, VLAN 11)
                                              ↓
                                    Paper Minecraft Server (Docker)
                                              +
                                    RCON Web Admin (companion container)
```

## Server Details

| Component | Value |
|-----------|-------|
| Server type | Paper (Minecraft) |
| Network | macvlan on VLAN 11 (DMZ_PUBLIC) |
| IP | 10.10.11.5 |
| Game port | 25565 |
| External access | Fortigate VIP: wan1:25565 → 10.10.11.5:25565 |
| RCON | Web admin companion container |
| Config location | UNRAID XML templates in `unraid/` directory |

## Security Layers (10 total)

1. **Fortigate VIP** — only port 25565 exposed
2. **DMZ VLAN isolation** — VLAN 11 cannot reach internal VLANs
3. **Fortigate policies** — explicit allow for game traffic only
4. **Paper built-in** — whitelist, anti-cheat
5. **Plugin: AuthMe** — player authentication
6. **Plugin: EssentialsX** — permissions, command control
7. **Plugin: WorldGuard** — region protection
8. **Plugin: CoreProtect** — block logging and rollback
9. **RCON restricted** — admin access only via companion container
10. **Fortigate IPS** — intrusion prevention on DMZ policies

## Plugin Management

Plugins are managed via the `PLUGINS` environment variable:

```
PLUGINS=AuthMe,EssentialsX,WorldGuard,CoreProtect,...
```

### Special Case: NBTAPI

NBTAPI must be installed via Spiget (not Modrinth/Bukkit):
```
SPIGET_RESOURCES=7939
```

## Common Operations

| Task | Tool |
|------|------|
| Check server status | `unraid_get_container_logs` |
| Verify config | `unraid_inspect_container` |
| Restart server | `unraid_restart_container` |
| Update plugins | Update `PLUGINS` env var, restart container |
| Update server version | Update image tag in XML template, apply via UNRAID UI |

## Fortigate Configuration

### VIP (Virtual IP)
- Interface: wan1
- External port: 25565
- Mapped IP: 10.10.11.5
- Mapped port: 25565

### DMZ Isolation
- DMZ → Internet: allowed (for updates, plugin downloads)
- DMZ → Internal VLANs: **denied** (security isolation)
- Internal → DMZ: allowed (for management/RCON)

## Gotchas

- **macvlan networking** — container has its own IP, not accessible from the UNRAID host itself (Docker limitation)
- **SPIGET_RESOURCES for NBTAPI** — must use `SPIGET_RESOURCES=7939`, not the regular PLUGINS var
- **Port 25565 only** — Fortigate VIP only forwards this port
- **DMZ isolation** — the Minecraft server cannot access internal services by design
- **RCON security** — RCON password must be in Vaultwarden; never expose RCON port externally
- **Backup** — world data should be included in Duplicacy backup scope
- **Java memory** — Paper server needs adequate JVM heap; configured via container env vars
