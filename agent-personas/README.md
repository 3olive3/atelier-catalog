# agent-personas — reviewed persona files for the Atelier agents

The agents' `IDENTITY.md`, `SOUL.md` and `USER.md` live in the Bridge workspaces on UNRAID (`/mnt/cache/appdata/atelier-bridge/workspace` for Filipe, `config/agents/<id>/workspace` for everyone else), which are **not in git**. The Atelier Harness reads them into each agent's prompt (ADR-0029). This folder is where changes to them are written and reviewed; `scripts/install-agent-personas.sh` puts them in place.

| Agent | Files here | Notes |
|---|---|---|
| eletricista, net-eng, cinema, professor, chef, rotinas | IDENTITY, SOUL, USER | rewritten in pt-PT (2026-10-18); OpenClaw boilerplate removed |
| filipe | IDENTITY, SOUL | no more Kimchi, `sessions_spawn`, `agents_list`, the scout/builder/Content Factory classifier, "never say I can't", "update these files". His USER.md stays as is. |
| vice, chico | IDENTITY, SOUL | `sessions_spawn` → `Agent` (SDK sub-agent); Minecraft: own server only, via `minecraft.*` |
| guida | SOUL, USER | "actualizo" removed (preferences now go to Atelier Memory) |
| guest | IDENTITY, SOUL | lights in the guest zone + film requests (Filipe, 2026-10-18); never the family's viewing |

Rules:
- Only these three files; never TOOLS.md, AGENTS.md or MEMORY.md (TOOLS.md's still-valid house rules moved into the Harness preamble).
- A person's USER.md also carries **Butler-generated blocks** (`<!-- BEGIN CASA LIMA PREFERÊNCIAS -->`, `<!-- BEGIN ATELIER MEMORY -->`). They are not in this repo; the installer keeps the live ones verbatim.
- No secrets, no links.

Install (on UNRAID, by hand): `bash scripts/install-agent-personas.sh` (dry run, shows diffs) → `--apply` (backup `*.bak-personas-<ts>` of each replaced file, same owner and mode, prints the rollback). `--only a,b` limits it. Every agent runs in the Harness since 2026-10-19; the person agents' IDENTITY.md delegate with the native `Agent` tool (Harness 0.9.0). Test: `bash scripts/test-install-agent-personas.sh`.
