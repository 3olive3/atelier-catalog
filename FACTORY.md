# Atelier Factory — one-page manual

<!-- Installed by atelier-factory (kit 0.6.5). Do not edit here: edit
     atelier-factory/kit/MANUAL.md and reinstall. -->

The factory is how work gets built in this repo: rules enforced by code (**harness**),
every unit checked until it passes (**loop**), work split into real steps with gates
(**graph**), and every failure turned into a rule (**learn**).

## What is always on (nothing to do)

- **Right model for the job.** An agent call without a model is blocked. `mechanic` runs on Haiku, `worker`, `verifier` and `learner` on Sonnet, `planner` and `security-reviewer` on Opus. Opus anywhere else needs a written reason.
- **Safety.** Pushing to `main` or `develop` and writing `.env` files are blocked. Secrets live only in Vaultwarden.
- **Learned rules.** The never-list in this repo's CLAUDE.md is loaded in every session.
- **Telemetry.** Every subagent call and every block goes to the ledger (`~/.atelier-factory/ledger/`), which feeds the scorecard.
- **CI.** PRs run the repo's tests and gates.
- **Design system.** Every PR runs the design-system check: no new colour literals, copies match their pin.

## What to say

| You say | What happens |
|---|---|
| «retoma a próxima fase do Atelier **e corre pela fábrica**» | Picks up the roadmap where it stopped, and runs each item through the steps below |
| «**corre isto pela fábrica**: …» | Same steps, for the thing you describe |
| *(answer the clarify questions)* | Spec Kit asks only what it can't decide; your answers go into the spec |
| «faz um TestFlight» | Builds from `develop`. The agent may also **propose** a build when changes are ready to test; it cuts it on your yes |
| «**lança para produção**» | Release: `develop` → `main` PR (merge commit), tag `vYYYY.MM.DD`, deploy |
| «volta o Butler para a versão anterior» | Redeploys the previous release tag (images are kept by commit) |
| «como está a fábrica?» | Scorecard (models used, first-pass rate, escalations) and the enforcement audit |
| «aprende com isto» | Runs the learner: lessons become never-list entries and rule proposals for you to approve |

## The steps behind "corre pela fábrica"

1. **Spec**: `/speckit-specify` → `/speckit-clarify` (your questions) → `/speckit-plan` → `/speckit-tasks`. A one-file fix may skip this.
2. **Graph + loop**: `/speckit-implement` turns the tasks into a graph and runs it. Each step has a check that must **fail first** and pass after. There are 3 attempts, and the same failure twice escalates to you.
3. **Gate + evidence**: code decides by **lane**. Then the `verifier` reviews against the spec.
4. **Ship**: PR to `develop`. Nothing reaches the house until a release to `main` (ADR-0038).
5. **Learn**: surprises go into the run's LESSONS.md, and the learner turns them into rules.

## How Learn works on the Mac

1. **Evidence**: hooks write every block and every subagent's model to the ledger. The runner writes each attempt and why it failed. Each run leaves a `LESSONS.md`.
2. **Brief (code)**: `factory-learn` collects the last 14 days of evidence into one brief.
3. **Learner (Sonnet)**: it reads the brief in its own worktree and may change only `wiki/`. Code reverts anything else. It writes never-list entries, wiki pages, and **proposals** for code changes.
4. **You decide**: wiki text merges by PR. Proposals that change hooks, gates or the runner wait for your yes.
5. **Back into every session**: the next kit install puts the never-list into each repo's CLAUDE.md, so the same mistake isn't repeated.

## What needs your approval

- **Closed lane** (see `factory.json`): Guardian and permissions, vault, firewall, alarm, doors, HomeKit writes, deletes. These never merge on their own.
- **Releases to production** and **TestFlight builds**.
- **Learner proposals** that change hooks, gates or the runner.
- **Deleting things**: worktrees, memory files, containers. A backup comes first.

Open and wide lanes may merge on their own once the checks and the gate pass.

## Where to look

- This repo: `factory.json` (lanes, checks), `specs/<id>/` (spec, graph, report, lessons).
- Factory: `~/Developer/atelier-platform/atelier-factory`. `wiki/never.md` is the learned rules, `enforcement.json` is every rule with its enforcer, and `wiki/proposals/` is what the learner suggests.
- Reports: `~/.atelier-factory/reports/` (audit, scorecard), `~/.atelier-factory/runs/<id>/` (each run).
- Decisions: home-docs ADR-0038 (main is production), knowledge base `docs/knowledge/`.

## Commands (if you want them directly)

```bash
node ~/Developer/atelier-platform/atelier-factory/bin/factory-scorecard.mjs --days 7
node ~/Developer/atelier-platform/atelier-factory/bin/factory-audit.mjs
node ~/Developer/atelier-platform/atelier-factory/bin/factory-learn.mjs
node ~/Developer/atelier-platform/atelier-factory/bin/factory-run.mjs specs/<id>/GRAPH.json
node ~/Developer/atelier-platform/atelier-factory/bin/factory-install.mjs <repo>
```

## Not built yet

- **Nightly audit, learner and scorecard**: Claude Code may not install a background job on your Mac, so run `bash ~/Developer/atelier-platform/atelier-factory/bin/factory-schedule.sh` once yourself. After that it runs every night at 05:15, and the learner's wiki changes arrive as a PR.
- **Health check and automatic rollback after a release**: until then, a rollback is a manual redeploy of the previous tag.
- **Per-person feature switches**: new features visible only to you first.
- **Factory in all products** (global baseline, `factory-new` for new repos).
