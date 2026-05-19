# Atelier Catalog

Unified distribution catalog for the Atelier platform — 47 skills, 20 MCP refs, role profiles, tech stacks, guardrails, permissions, knowledge bases, context files, observability configs, and git repositories.

## Purpose

Single source of truth for everything the Atelier Designer can offer to a team config. The catalog is published as `catalog.json` (v2.6.0, ~140 entries) and served over HTTPS from GitHub raw URLs. Atelier Designer fetches it at runtime to populate pickers; agents fetch individual `SKILL.md` files via per-skill download URLs.

## Stack

- Python 3 build scripts (no runtime; pure metadata + content)
- Output: `catalog.json` + `bundles.json` + `compat/` legacy shims
- Distribution: GitHub raw URLs (no release artifacts; the repo itself is the artifact)

## Layout

```
catalog.json              # Unified manifest, 140 entries, v2.6.0 (build output)
bundles.json              # 10 skill bundles (hand-maintained)
scripts/
  build-catalog.py        # Validator + assembler
  enrich-entries.py       # Legacy migration tool
skills/                   # 47 skill directories (each: .json metadata + SKILL.md content)
mcps/                     # 20 MCP entry .json files (servers live in atelier-mcps)
role-profiles/            # 16 agent archetypes
guardrails/               # 13 toggle rules
permissions/              # 3 pre-configured rule sets
tech-stacks/              # 5 approved language bundles
git-repositories/         # 11 repo refs
knowledge-bases/          # 2 doc links
context-files/            # 2 CLAUDE.md / AGENTS.md templates
observability/            # 5 monitoring configs
compat/                   # Legacy shim catalogs (mcps-catalog.json, skills-catalog.json)
```

## Commands

```bash
python3 scripts/build-catalog.py     # Rebuild catalog.json + compat shims
python3 scripts/enrich-entries.py    # One-off migration helper
```

To add a new skill:
```bash
mkdir skills/<name>
# create skills/<name>/SKILL.md (frontmatter + body)
# create skills/<name>/<name>.json (metadata)
python3 scripts/build-catalog.py
```

## Cross-repo dependencies

- **Skills**: merged in from archived `atelier-skills` on 2026-03-16 — that repo is dead; this is the live one.
- **MCPs**: developed in `atelier-butler/mcp/`, packaged in `atelier-mcps/`, *referenced* here.
- **Consumers**: Atelier Designer (the `atelier` repo) fetches `https://raw.githubusercontent.com/3olive3/atelier-catalog/main/catalog.json`. Legacy consumers use `compat/mcps-catalog.json` and `compat/skills-catalog.json`.

## Skills installed

Available via the skill tool — symlinked into `.claude/skills/` from `skills/` (this repo IS the catalog source).

**Casa Lima mandatory** (every repo): `vault-access`, `build-image`, `deploy-container`, `incidents-methodology`, `distribute-skill-mcp`, `home-network`, `bash-pro`, `git-advanced-workflows`, `systematic-debugging`, `security-review`.

**This repo also has**: `skill-creator`, `mcp-builder`, `architecture-decision-records`.

## MCPs

See `.mcp.json`. Default-enabled: `vaultwarden`. The catalog repo doesn't actually need any MCPs to maintain itself — vaultwarden is here only for cases where a skill references a vault item and you want to verify it.

## Gotchas

- Skills and MCPs are **different types** in one manifest — skills are Markdown knowledge modules; MCPs are server configs. Don't conflate when adding entries.
- 9 skills are tagged `casa-lima-ops` and are **not portable** — they assume a specific home network (VLANs, Fortigate, Pihole, UNRAID, Cloudflare). Treat as operational runbooks.
- `excalidraw-diagram` skill needs Python 3.11+, Playwright 1.40+, Chromium (`uv run playwright install chromium`). Unusual dep.
- `.json` metadata is what the catalog references; `SKILL.md` is fetched separately by consumers. Updating `SKILL.md` without re-running `build-catalog.py` leaves the catalog version unchanged.
- `bundles.json` is hand-maintained — no validation that bundle members exist. Renaming or removing a skill can rot a bundle silently.
- `compat/` shims have no documented deprecation timeline — old consumers can stay on legacy URLs indefinitely.

## More context

- home-docs: <https://docs.3olive3.com/projects/atelier-catalog/> (may not exist yet — see home-docs roadmap)
- Tool count truth: this catalog references 20 MCPs; tool counts authoritative in `atelier-mcps/catalog.json`.
