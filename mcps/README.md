# MCP Server Catalog

MCP server configurations that agents can connect to for tool access.

This directory is the single MCP index (the `atelier-mcps` distribution repo was retired 2026-10-19 — it never published a release). Entries are **generated** by `scripts/sync-catalog.py` from `atelier-butler/mcp/*` (tool counts, versions) and `atelier-butler/gateway/native-servers.json` (Butler-native servers); never hand-edit counts or versions. The code runs from the Butler image, and locally from `atelier-butler/mcp/<id>/dist`.

Entries here define the connection configuration (transport, command, args, env) that gets written to `.opencode/config.yaml` or `.claude/mcp.json` at export time.

## Entry Format

```json
{
  "catalogID": "unraid",
  "name": "UNRAID",
  "description": "Docker containers, VMs, system stats on UNRAID",
  "version": "1.0.0",
  "source": "builtIn",
  "transport": "stdio",
  "command": "node",
  "args": ["dist/index.js"],
  "env": { "UNRAID_HOST": "tower.local" }
}
```
