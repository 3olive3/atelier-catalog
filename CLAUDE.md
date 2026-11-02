# Atelier Catalog

Source of truth for the platform's **skills** — 48 skill modules, plus role profiles, guardrails, permissions, tech stacks and MCP reference metadata.

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
skills/                   # 48 skill dirs — each: <name>.json metadata + SKILL.md content
agent-personas/           # reviewed IDENTITY/SOUL/USER for the Atelier agents (Bridge workspaces are not in git) + scripts/install-agent-personas.sh
agent-skills/             # the `casa` plugin for household agents on the Atelier Harness (text only, linted, pinned by digest) — see its README
mcps/                     # MCP reference metadata (servers live in atelier-butler/mcp/; kind "native" = served by the Butler gateway itself)
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
- **MCPs**: developed in `atelier-butler/mcp/`, built into the Butler image (and run locally from `atelier-butler/mcp/<id>/dist`), only *indexed* here. This catalog is the single MCP index since `atelier-mcps` was retired (2026-10-19; it never cut a release).
- Skills were merged in from the archived `atelier-skills` repo (2026-03-16); this is the live one.

> `atelier` (Designer) is **archived** and no longer fetches `catalog.json`.

## Agent skills (`agent-skills/`)

Skills for the **household agents** (not operator skills): one `SKILL.md` per skill, pt-PT, loaded by the Atelier Harness as the local plugin `casa`. Text only — `node scripts/lint-agent-skills.mjs` refuses hooks, `.mcp.json`, agents, commands, scripts, links and secrets (CI: `.github/workflows/agent-skills.yml`, negative test `scripts/test-lint-agent-skills.sh`). The Harness loads it only when `node scripts/agent-skills-digest.mjs` equals its pin `HARNESS_AGENT_SKILLS_DIGEST` (atelier-butler manifest), so a change here needs a pin bump + Harness redeploy.

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
- **Stale skill to review**: `content-pipeline` still describes its later stages as n8n workflows, and n8n is **decommissioned**. Deterministic work now lives in `atelier-butler/infra/scripts/`. (`n8n-workflows` itself was removed; its last dangling symlink in `atelier-bridge` was cleaned up 2026-08-29.)
- `excalidraw-diagram` needs Python 3.11+, Playwright 1.40+, Chromium (`uv run playwright install chromium`) — unusual dep.
- Updating `SKILL.md` without re-running `build-catalog.py` leaves the catalog version unchanged.
- `bundles.json` is hand-maintained with **no validation that members exist** — renaming or removing a skill can rot a bundle silently.
- `compat/` shims have no deprecation timeline. With Designer archived, they are candidates for removal.
- MCP counts here are reference metadata only, **generated** by `scripts/sync-catalog.py` in this repo (reads `../atelier-butler/mcp/*` + `gateway/native-servers.json`; `--write` also runs `scripts/build-catalog.py`; CI gate: `Catalog Drift` workflow, NOT VERIFIED until the `CASALIMA_REPO_TOKEN` secret exists). Never hand-edit `mcps/*.json`. As of 2026-10-18: **30 servers / 517 tools** = 17 package servers / 462 tools (`atelier-butler/mcp/`) + 13 Butler-native servers / 55 tools (`kind: "native"`, `source: "butlerNative"`: `atelier`, `people`, `memory`, `case`, `knowledge`, `inbox`, `incidents`, `trail`, `approvals`, `history`, `workflows`, `wifi`, `weather` — served by the gateway, no package). No entry has `downloadURL`/`checksum`/`size` any more — they pointed at atelier-mcps releases that never existed. Best read off the gateway's own startup log rather than any document — a hardcoded banner in the FortiGate server reported the wrong count for a day. Figures of 397, 400, 19/396, 404, 425 and 436 elsewhere are stale.

## More context

- **ADRs**: <https://docs.3olive3.com/adr/>
- **Skills architecture**: <https://docs.3olive3.com/butler/skills/>
- **Agent roster** (which agent gets which skills): <https://docs.3olive3.com/butler/agent-roster/>

<!-- factory:begin -->
## Atelier Factory (generated — edit atelier-factory/kit, then reinstall)

This repo runs the Atelier Factory kit (version 0.6.5). Its rules are enforced by hooks, not by memory:

- **Model tiering.** Every Agent call needs a model, or a factory agent that pins one. Use `mechanic` (Haiku) for work with one right answer, `worker` / `verifier` / `learner` (Sonnet) by default, `planner` / `security-reviewer` (Opus) only for planning, architecture and high-risk changes. A plain `opus` call needs an `Opus-reason:` line in its prompt.
- **Git flow.** Pushing to `main` or `develop` is blocked. Push a `feature/*` or `bugfix/*` branch and open a PR.
- **Secrets.** Writing `.env` files is blocked. Secrets live only in Vaultwarden.
- **Lanes.** `factory.json` maps paths to lanes by blast radius: open, wide, closed. Closed-lane changes always need Filipe's approval.
- **Design system.** Every PR runs the design-system check: no new colour literals, copies match their pin.
- **Skills.** Mandatory in every repo: `atelier-design`, `deploy-container`, `build-image`, `scheduled-jobs`, `decommission` (linked in `.claude/skills/`; load before any UI, icon or naming work).
- **Evidence.** Nothing is done until a check that could fail has passed: deterministic result > trace > independent `verifier` > self-report.

### Learned constraints (never-list)

- **Never** let a code node read another repo's working tree; read a clean export of the base ref with `git archive origin/develop`.
- **Never** treat "no checks reported" as green before checks register (wait at least two minutes, then merge only on green).
- **Never** trust a grep check to prove a claim about code is true; require the verifier for doc changes that make claims about code.
- **Never** parse git porcelain output after trimming it; the leading space is significant, and parsing gets a test with that case.
- **Never** read "passed on attempt 1" in a run report as "no earlier failures"; the report counts only the final execution, so check the ledger for failed attempts in earlier executions before drawing a conclusion about a model tier.
- **Never** record a failed attempt without its reason; a failure with no recorded cause cannot be assigned to a layer, so it teaches nothing.
- **Never** assume a code node's tools exist on the host; declare them and run Python through `uv run --with <deps>`.
- **Never** start a manual image build while CI is building the same tag; check `gh run list --workflow=<name> --limit 1` first and re-trigger with `gh workflow run`.
- **Never** branch off `develop` without checking `git log develop..main`; if main is ahead, develop is not a safe base.
- **Never** edit a repo that other agents may be using from its shared clone; use a worktree off `origin/develop` and check `git branch --show-current` before commit.
- **Never** hand-edit catalog MCP counts or versions; run `scripts/sync-catalog.py --write`.
- **Never** stop an MCP tool change at the source merge; the catalog, Butler image, credentials, local `.mcp.json` and docs go in the same piece of work.
- **Never** accept a knowledge migration on a "source listed on the page" check; it proves files are covered, not facts. Migrations of knowledge need a fact-level verifier node before merge.
- **Never** let a test or check touch the real `~/.atelier-factory` (or any home-directory state); point it at a throwaway folder through `FACTORY_STATE_DIR` or `$TMPDIR`. A worker's sandbox denies that path, so the check fails the same way on every attempt.
- **Never** read a "failed 3 attempts" escalation as three different failures; the repeat detector compares raw output, so a pid, a timing or a temp-dir name hides a repeat. Compare the failing lines yourself before blaming the attempt or the tier.
- **Never** let a worker fill a field the source does not give; write "not recorded", do not infer it.

### Working through the factory

The one-page manual for people is `FACTORY.md` at this repo's root.

When asked to "run this through the factory" (or to resume the roadmap through it), every item goes through harness, loop and graph:

1. **Spec** (features): `/speckit-specify` then `/speckit-clarify` (ask Filipe the open questions), `/speckit-plan`, `/speckit-tasks`. Small one-file fixes may skip the spec.
2. **Graph and loop:** `/speckit-implement` compiles `tasks.md` into `GRAPH.json` and runs `node ~/Developer/atelier-platform/atelier-factory/bin/factory-run.mjs <GRAPH.json>`. Every node needs a check that fails now and passes when done; `mechanic` (Haiku) for one-right-answer tasks, `worker` (Sonnet) otherwise.
3. **Evidence:** the gate decides by lane; then the `verifier` reviews the PR against the spec before merge.
4. **Ship:** PR to `develop`. A release to `main` (production, ADR-0038) only when Filipe asks: a `develop` → `main` PR merged with a merge commit and tagged.
5. **Learn:** failures and surprises go into the run's LESSONS.md; `factory-learn` turns them into rules.

The enforcement registry and audit live in `atelier-factory` (`bin/factory-audit.mjs`).
<!-- factory:end -->
