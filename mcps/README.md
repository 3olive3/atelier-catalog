# MCP Server Catalog

MCP server configurations that agents can connect to for tool access.

See also: [atelier-mcps](https://github.com/3olive3/atelier-mcps) for the full MCP server distribution catalog with installable packages.

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
