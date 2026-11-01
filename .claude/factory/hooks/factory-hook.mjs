#!/usr/bin/env node
// Atelier Factory hook — the Harness layer of the factory, installed into each
// repo at .claude/factory/hooks/ by bin/factory-install.mjs. Do not edit the
// copy in a repo: edit atelier-factory/kit and reinstall.
//
// One dispatcher for every hook event so the rules live in one place. Each rule
// has an id that matches enforcement.json; every block is written to the ledger
// so the nightly audit can prove the rule has fired (proof of function).
//
// Exit codes follow Claude Code: 0 = allow, 2 = block (stderr goes to Claude).
// Dependency-free on purpose: it runs on the Mac and in the UNRAID container.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROTECTED_BRANCHES = ["main", "develop"];
const ENV_TEMPLATES = /\.(example|sample|template|dist)$/;

function ledger(entry) {
  try {
    const dir = join(process.env.FACTORY_STATE_DIR || join(homedir(), ".atelier-factory"), "ledger");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    appendFileSync(join(dir, `${ts.slice(0, 7)}.jsonl`), JSON.stringify({ ts, ...entry }) + "\n");
  } catch {
    // The ledger is evidence, not a gate: a full disk must not block work.
  }
}

// Model pinned in an agent definition's frontmatter, or null.
export function pinnedModel(agentType, projectDir) {
  if (!agentType) return null;
  const dirs = [projectDir && join(projectDir, ".claude", "agents"), join(homedir(), ".claude", "agents")];
  for (const dir of dirs.filter(Boolean)) {
    const file = join(dir, `${agentType}.md`);
    if (!existsSync(file)) continue;
    const fm = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
    const m = fm && fm[1].match(/^model:\s*(\S+)/m);
    if (m) return m[1];
  }
  return null;
}

// rule: model-tiering
export function checkAgent(input, projectDir) {
  const ti = input.tool_input || {};
  const pinned = pinnedModel(ti.subagent_type, projectDir);
  const model = ti.model || pinned;
  if (!model) {
    return {
      block: true,
      rule: "model-tiering",
      reason:
        `Factory rule model-tiering: the Agent call for "${ti.subagent_type || "general-purpose"}" has no model. ` +
        "Pass model explicitly: haiku for mechanical work (renames, lint, sync, log triage), sonnet by default, " +
        "opus only for planning, security, alarm/HomeKit-write logic or architecture — with a first prompt line " +
        "'Opus-reason: <why>'. Or use a factory agent that pins its model (planner, worker, mechanic, verifier, " +
        "security-reviewer, learner).",
    };
  }
  if (model === "opus" && !pinned && !/^\s*Opus-reason:\s*\S/im.test(ti.prompt || "")) {
    return {
      block: true,
      rule: "model-tiering",
      reason:
        "Factory rule model-tiering: opus needs a reason. Add a line 'Opus-reason: <why this needs the most capable " +
        "model>' to the prompt, or use sonnet.",
    };
  }
  return { block: false, rule: "model-tiering", model, pinned: Boolean(pinned) };
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// rule: git-flow-protected-push
export function checkBash(input, branchOf = currentBranch) {
  const cmd = (input.tool_input && input.tool_input.command) || "";
  // Each `git push` segment of a compound command is checked on its own.
  for (const seg of cmd.split(/&&|\|\||;|\n/)) {
    const m = seg.match(/\bgit\b(?:\s+-C\s+(\S+))?((?:\s+-c\s+\S+)*)\s+push\b(.*)$/);
    if (!m) continue;
    const args = m[3].trim().split(/\s+/).filter((a) => a && !a.startsWith("-"));
    // args = [remote, ...refspecs]
    const refspecs = args.slice(1);
    let targets;
    if (refspecs.length === 0) {
      const dir = m[1] ? m[1].replace(/^["']|["']$/g, "") : input.cwd || process.cwd();
      targets = [branchOf(dir)];
    } else {
      targets = refspecs.map((r) => r.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, ""));
    }
    const hit = targets.find((t) => t && PROTECTED_BRANCHES.includes(t));
    if (hit) {
      return {
        block: true,
        rule: "git-flow-protected-push",
        reason:
          `Factory rule git-flow-protected-push: pushing to "${hit}" directly is not allowed. ` +
          "Push a feature/* or bugfix/* branch and open a PR (gh pr create); merge with gh pr merge.",
      };
    }
  }
  return { block: false, rule: "git-flow-protected-push" };
}

// rule: secrets-no-env-files
export function checkWrite(input) {
  const path = (input.tool_input && (input.tool_input.file_path || input.tool_input.notebook_path)) || "";
  const name = basename(path);
  if (/^\.env(\..+)?$/.test(name) && !ENV_TEMPLATES.test(name)) {
    return {
      block: true,
      rule: "secrets-no-env-files",
      reason:
        `Factory rule secrets-no-env-files: writing ${name} is not allowed. Secrets live only in Vaultwarden; ` +
        "manifests point at vault items. Edit a .env.example with placeholders instead.",
    };
  }
  return { block: false, rule: "secrets-no-env-files" };
}

export function decide(input, projectDir) {
  const event = input.hook_event_name;
  if (event === "PreToolUse") {
    const tool = input.tool_name;
    if (tool === "Agent" || tool === "Task") return checkAgent(input, projectDir);
    if (tool === "Bash") return checkBash(input);
    if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) return checkWrite(input);
  }
  return { block: false };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  const base = { session: input.session_id, cwd: input.cwd, event: input.hook_event_name, real: input.session_id !== "factory-proof" };

  if (input.hook_event_name === "SessionStart") {
    // rule: max-only-billing — SessionStart cannot block, so it warns loudly and records.
    if (process.env.ANTHROPIC_API_KEY) {
      ledger({ ...base, rule: "max-only-billing", action: "warned" });
      process.stdout.write(
        "WARNING (factory rule max-only-billing): ANTHROPIC_API_KEY is set in this environment. " +
          "It bills the API instead of Filipe's Max plan. Tell Filipe and stop before doing paid work.\n",
      );
    }
    ledger({ ...base, action: "session-start", source: input.source });
    process.exit(0);
  }
  if (input.hook_event_name === "SubagentStop" || input.hook_event_name === "Stop") {
    ledger({ ...base, action: input.hook_event_name === "Stop" ? "turn-end" : "subagent-end" });
    process.exit(0);
  }

  const d = decide(input, projectDir);
  if (d.block) {
    ledger({ ...base, rule: d.rule, action: "blocked", tool: input.tool_name });
    process.stderr.write(d.reason + "\n");
    process.exit(2);
  }
  if (d.rule === "model-tiering") {
    // Tier telemetry: every subagent call and the model it ran on.
    ledger({ ...base, rule: d.rule, action: "allowed", tool: input.tool_name,
      agent: (input.tool_input || {}).subagent_type || "general-purpose", model: d.model, pinned: d.pinned });
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
