# agent-skills — the `casa` plugin for Atelier agents

Skills for the **household agents** that run on the Atelier Harness (Butler for each person, the specialists, the guest, the investigator). They are separate from `skills/`, which are operator skills for Claude Code sessions.

- Loaded by the Harness as a local Claude Agent SDK plugin (`plugins: [{type: "local", path}]`), with only the agent's own skills enabled (`skills: ["casa:<id>", …]`). The Harness turns on exactly one native tool for this: `Skill`.
- **Text only.** One `SKILL.md` per skill, pt-PT (AO90), no supporting files (agents have no Read tool). No hooks, no `.mcp.json`, no agents, no commands, no links, nothing secret-shaped. `scripts/lint-agent-skills.mjs` enforces it in CI; the Harness refuses a plugin that breaks it.
- **Pinned.** The Harness loads the plugin only when its digest (`node scripts/agent-skills-digest.mjs`) equals `HARNESS_AGENT_SKILLS_DIGEST` in its manifest (atelier-butler). A change here does nothing until the pin is bumped and the Harness redeployed.
- **Who gets what**: `casa-provas` every agent; `casa-delegar` the person agents; `minecraft-miudos` role kid; specialists their own (areas.json `specialists.<id>.skills`); `investigador-metodo` the investigator.

Changing a skill: edit, `node scripts/lint-agent-skills.mjs`, run the Harness evals for that skill (with and without the skill), bump the pin.
