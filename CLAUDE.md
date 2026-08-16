# Atelier Catalog

Source of truth for the platform's **skills** — 47 skill modules, plus role profiles, guardrails, permissions, tech stacks and MCP reference metadata.

> **Rearchitected 2026-08-11.** The primary consumer was Atelier Designer, which is archived. Skills are now consumed by **OpenClaw** and **Claude Code**, both of which read Markdown directly. Read <https://docs.3olive3.com/adr/> before architectural changes.

## Purpose

A skill is a structured Markdown instruction document that teaches a model *how to approach a domain* — deploy conventions, incident methodology, vault access patterns. **Not code.** Judgement, not capability.

| | Provides | Answers |
|---|---|---|
| **MCP server** (`atelier-butler/mcp/`) | capability | *what can I do?* |
| **Skill** (here) | judgement | *how should I do it here?* |

An MCP gives an agent the ability to restart a container. A skill tells it Casa Lima deploys only via `deploy-container.sh` reading the manifest as source of truth.

## Distribution

Skills are **static files distributed by git** — deliberately not behind a runtime service, so a Butler outage cannot also cost you your skills.

```
atelier-catalog/skills/  ──sync──▶  OpenClaw agent workspace
                         ──sync──▶  Claude Code (--plugin-dir / .claude/skills symlinks)
```

Both consumers read Markdown, so no transformation is needed. Per-repo `.claude/skills/<name>` are relative symlinks back here.

!!! info "`catalog.json` is now largely vestigial"
    It existed so Atelier Designer could populate pickers at runtime. Designer is archived. The build still validates and assembles metadata, which remains useful, but **no live consumer fetches `catalog.json`** today. Do not add features that assume one does.

## Stack

- Python 3 build scripts (no runtime; pure metadata + content)
- Output: `catalog.json` + `bundles.json` + `compat/` legacy shims
- Distribution: git (the repo itself is the artifact)

## Layout

```
skills/                   # 47 skill dirs — each: <name>.json metadata + SKILL.md content
mcps/                     # MCP reference metadata (servers live in atelier-butler/mcp/)
role-profiles/            # 16 agent archetypes
guardrails/               # 13 toggle rules
permissions/              # 3 pre-configured rule sets
tech-stacks/              # 5 approved language bundles
git-repositories/         # repo refs
knowledge-bases/ context-files/ observability/
catalog.json              # build output — see note above
bundles.json              # 10 skill bundles (hand-maintained, unvalidated)
compat/                   # legacy shim catalogs
scripts/build-catalog.py  # validator + assembler
```

## Commands

```bash
python3 scripts/build-catalog.py     # rebuild catalog.json + compat shims

# Add a skill
mkdir skills/<name>
#   skills/<name>/SKILL.md      (frontmatter + body)
#   skills/<name>/<name>.json   (metadata)
python3 scripts/build-catalog.py
```

## Cross-repo dependencies

- **Consumed by**: `atelier-bridge` (OpenClaw agent workspaces), and every repo's `.claude/skills/` symlinks for Claude Code.
- **MCPs**: developed in `atelier-butler/mcp/`, packaged in `atelier-mcps/`, only *referenced* here.
- Skills were merged in from the archived `atelier-skills` repo (2026-03-16); this is the live one.

> `atelier` (Designer) is **archived** and no longer fetches `catalog.json`.

## Authoring conventions

- One skill, one domain. If the description needs "and", it is probably two skills.
- The `description` field decides whether a model loads the skill at all — write it as **trigger conditions**, not a summary.
- State when **not** to use the skill. That prevents misfires better than a longer description.
- Skills shape *behaviour*, never *access*. Giving an agent a `deploy-container` skill it has no tools for teaches conventions it cannot act on — capability is governed by the Gatekeeper.
- Distribute changes with the `distribute-skill-mcp` skill so all consumers stay in sync.

## Skills installed

Available via the skill tool — this repo is the source of truth, so `.claude/skills/` here symlinks back to `skills/` in the same repo rather than to another one.

**Casa Lima mandatory** (every repo): `vault-access`, `build-image`, `deploy-container`, `incidents-methodology`, `distribute-skill-mcp`, `home-network`, `bash-pro`, `git-advanced-workflows`, `systematic-debugging`, `security-review`.

**This repo also has**: `architecture-decision-records`, `mcp-builder`, `skill-creator`.

## Gotchas

- **Skills and MCPs are different types** in one manifest — don't conflate when adding entries.
- **9 skills tagged `casa-lima-ops` are not portable** — they assume this specific home (VLANs, FortiGate authoritative DNS for `3olive3.com` with upstream DoH to Cloudflare Zero Trust, UNRAID). Treat as operational runbooks.
- **Stale skills to review**: `n8n-workflows` and `content-pipeline` assume n8n, which is **decommissioned**. Deterministic work now lives in `atelier-butler/infra/scripts/`.
- `excalidraw-diagram` needs Python 3.11+, Playwright 1.40+, Chromium (`uv run playwright install chromium`) — unusual dep.
- Updating `SKILL.md` without re-running `build-catalog.py` leaves the catalog version unchanged.
- `bundles.json` is hand-maintained with **no validation that members exist** — renaming or removing a skill can rot a bundle silently.
- `compat/` shims have no deprecation timeline. With Designer archived, they are candidates for removal.
- MCP counts here are reference metadata only. Authoritative: **17 servers / 415 tools** as of 2026-08-16 (fortigate 43 -> 58). Best read off the gateway's own startup log rather than any document — a hardcoded banner in the FortiGate server reported the wrong count for a day. Figures of 397, 400, 19/396, 404, 425 and 436 elsewhere are stale.

## More context

- **ADRs**: <https://docs.3olive3.com/adr/>
- **Skills architecture**: <https://docs.3olive3.com/butler/skills/>
- **Agent roster** (which agent gets which skills): <https://docs.3olive3.com/butler/agent-roster/>
