# Atelier Catalog

Unified distribution catalog for the [Atelier](https://github.com/3olive3/atelier) platform.

## What is this?

This repository contains community and built-in catalog entries for all 10 Atelier resource types. The Atelier Designer app syncs from this catalog to populate its resource library.

## Resource Types

| Directory | Resource Type | Description |
|-----------|--------------|-------------|
| `guardrails/` | Custom Guardrails | Reusable guardrail toggle definitions |
| `permissions/` | Permission Overrides | Pre-configured permission rule sets |
| `mcps/` | MCP Servers | Model Context Protocol server configurations |
| `skills/` | Skills | On-demand knowledge modules (SKILL.md files) |
| `role-profiles/` | Role Profiles | Agent role archetype presets |
| `git-repositories/` | Git Repositories | Repository templates and references |
| `tech-stacks/` | Tech Stacks | Approved technology bundles |
| `knowledge-bases/` | Knowledge Bases | Documentation and reference links |
| `context-files/` | Context Files | AGENTS.md / CLAUDE.md templates |
| `observability/` | Observability Sources | Log and monitoring provider configs |

## Catalog Entry Format

Each resource type directory contains JSON manifest files. Every entry follows a common schema:

```json
{
  "catalogID": "unique-slug",
  "name": "Human Readable Name",
  "description": "What this entry provides",
  "version": "1.0.0",
  "source": "builtIn",
  ...type-specific fields
}
```

### Common Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `catalogID` | `string` | Yes | Unique slug identifier (lowercase, hyphens) |
| `name` | `string` | Yes | Human-readable display name |
| `description` | `string` | Yes | Short description for catalog browsing |
| `version` | `string` | Yes | Semantic version (e.g., `1.0.0`) |
| `source` | `string` | Yes | One of: `builtIn`, `marketplace`, `custom` |

Type-specific fields are documented in each directory's own README.

## How Atelier Syncs

1. **Settings > Catalog**: User configures this repo URL as a catalog source
2. **Sync**: Atelier fetches the catalog manifest and compares versions
3. **Install**: New or updated entries are merged into the local resource library
4. **Assign**: Resources appear in the Agent Inspector for per-agent scoping

## Contributing

1. Fork this repository
2. Add your catalog entry in the appropriate directory
3. Follow the naming convention: `{catalogID}.json`
4. Submit a pull request

## License

MIT
