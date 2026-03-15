# Atelier Catalog

Unified distribution catalog for the [Atelier](https://github.com/3olive3/atelier) platform.

## What is this?

This repository contains community and built-in catalog entries for all 10 Atelier resource types. The Atelier Designer app fetches `catalog.json` in a single HTTP request to populate its resource library across all types.

**90 entries** across **10 types**, with **10 skill bundles**.

## Repository Structure

```
atelier-catalog/
├── catalog.json              # Unified manifest (auto-generated)
├── bundles.json              # Skill bundles
├── compat/                   # Backward-compatible shim catalogs
│   ├── mcps-catalog.json     #   atelier-mcps format
│   └── skills-catalog.json   #   atelier-skills format
├── scripts/
│   ├── build-catalog.py      # Assembles catalog.json from entries
│   └── enrich-entries.py     # One-time enrichment from legacy repos
├── guardrails/               # 3 entries
├── permissions/              # 3 entries
├── mcps/                     # 19 entries
├── skills/                   # 40 entries
├── role-profiles/            # 3 entries
├── git-repositories/         # 11 entries
├── tech-stacks/              # 5 entries
├── knowledge-bases/          # 2 entries
├── context-files/            # 2 entries
└── observability/            # 2 entries
```

## Resource Types

| Directory | Resource Type | Count | Description |
|-----------|--------------|-------|-------------|
| `guardrails/` | Custom Guardrails | 3 | Reusable guardrail toggle definitions |
| `permissions/` | Permission Overrides | 3 | Pre-configured permission rule sets |
| `mcps/` | MCP Servers | 19 | Model Context Protocol server configurations |
| `skills/` | Skills | 40 | On-demand knowledge modules (SKILL.md files) |
| `role-profiles/` | Role Profiles | 3 | Agent role archetype presets |
| `git-repositories/` | Git Repositories | 11 | Repository templates and references |
| `tech-stacks/` | Tech Stacks | 5 | Approved technology bundles |
| `knowledge-bases/` | Knowledge Bases | 2 | Documentation and reference links |
| `context-files/` | Context Files | 2 | AGENTS.md / CLAUDE.md templates |
| `observability/` | Observability Sources | 2 | Log and monitoring provider configs |

## Unified Catalog Format (v2.0.0)

The Atelier app fetches a single `catalog.json` containing all entries:

```
GET https://raw.githubusercontent.com/3olive3/atelier-catalog/main/catalog.json
```

### catalog.json Schema

```json
{
  "name": "Atelier Official Catalog",
  "version": "2.0.0",
  "lastUpdated": "2026-03-15T00:00:00Z",
  "description": "...",
  "repository": "https://github.com/3olive3/atelier-catalog",
  "totalEntries": 90,
  "types": {
    "guardrails": [ ...entries... ],
    "permissions": [ ...entries... ],
    "mcps": [ ...entries... ],
    "skills": [ ...entries... ],
    "role-profiles": [ ...entries... ],
    "git-repositories": [ ...entries... ],
    "tech-stacks": [ ...entries... ],
    "knowledge-bases": [ ...entries... ],
    "context-files": [ ...entries... ],
    "observability": [ ...entries... ]
  },
  "bundles": [ ...skill bundles... ]
}
```

### Common Entry Fields

Every entry across all 10 types shares these required fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `catalogID` | `string` | Yes | Unique slug identifier (lowercase, hyphens) |
| `name` | `string` | Yes | Human-readable display name |
| `description` | `string` | Yes | Short description for catalog browsing |
| `version` | `string` | Yes | Semantic version (e.g., `1.0.0`) |
| `source` | `string` | Yes | One of: `builtIn`, `marketplace`, `custom` |

Type-specific fields are documented in each directory's own README.

### Backward Compatibility

The `compat/` directory contains shim catalogs that match the legacy formats:

| File | Matches | Used by |
|------|---------|---------|
| `compat/mcps-catalog.json` | `atelier-mcps/catalog.json` | `DefaultMCPManager` |
| `compat/skills-catalog.json` | `atelier-skills/catalog.json` | `DefaultSkillManager` |

These allow gradual migration — existing app versions can point to the compat URLs while new versions use the unified `catalog.json`.

## How Atelier Syncs

1. **Fetch**: App fetches `catalog.json` (single HTTP request, ~90 entries)
2. **Decode**: `CatalogSyncService` parses typed arrays per resource type
3. **Distribute**: Type-specific managers receive their entries (MCPManager gets MCPs, SkillManager gets skills, etc.)
4. **Merge**: Entries merge into `AppSettings` with `source: .marketplace` and `catalogID` for tracking
5. **Scope**: Resources appear in the Agent Inspector for per-agent scoping

## Building

The individual JSON files in each directory are the source of truth. The `catalog.json` is assembled by the build script:

```bash
# Assemble catalog.json from individual entries
python3 scripts/build-catalog.py
```

The build script:
- Validates all entries have required fields
- Validates `catalogID` matches filename
- Assembles the unified `catalog.json`
- Generates backward-compatible shim catalogs in `compat/`

## Contributing

1. Fork this repository
2. Add your catalog entry as `{catalogID}.json` in the appropriate directory
3. Run `python3 scripts/build-catalog.py` to rebuild the catalog
4. Submit a pull request

## License

MIT
