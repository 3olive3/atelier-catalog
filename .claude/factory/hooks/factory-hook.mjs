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
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
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

// The PR's check rollup from gh; throws when gh fails (the caller fails closed).
function ghChecks({ selector, repo, cwd }) {
  const args = ["pr", "view", ...(selector ? [selector] : []), ...(repo ? ["-R", repo] : []), "--json", "statusCheckRollup"];
  const out = execFileSync("gh", args, { encoding: "utf8", cwd, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out).statusCheckRollup || [];
}

// `gh pr merge` arguments -> { selector (number, URL or null), repo }.
function parseMerge(rest) {
  const flagsWithValue = new Set(["-b", "--body", "-F", "--body-file", "-t", "--subject", "-A", "--author-email", "--match-head-commit"]);
  // Quoted values (a --body with spaces) stay one token.
  const toks = (rest.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ""));
  let selector = null, repo = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "-R" || t === "--repo") repo = toks[++i] || null;
    else if (t.startsWith("--repo=")) repo = t.slice(7);
    else if (flagsWithValue.has(t)) i++;
    else if (!t.startsWith("-") && selector === null) selector = t;
  }
  return { selector, repo };
}

// rule: merge-on-green
function mergeVerdict(ref, checksOf) {
  let rollup;
  try {
    rollup = checksOf(ref);
  } catch (e) {
    return `could not read the PR's checks (${String(e.message || e).split("\n")[0].slice(0, 160)})`;
  }
  if (!Array.isArray(rollup) || rollup.length === 0) return 'no checks reported ("no checks" is not green)';
  const bad = [];
  for (const c of rollup) {
    const name = c.name || c.context || "unnamed check";
    if (c.__typename === "StatusContext" || (c.state !== undefined && c.conclusion === undefined)) {
      if (c.state !== "SUCCESS") bad.push(`${name}: ${(c.state || "unknown").toLowerCase()}`);
    } else if (c.status !== "COMPLETED") {
      bad.push(`${name}: pending`);
    } else if (!["SUCCESS", "SKIPPED", "NEUTRAL"].includes(c.conclusion)) {
      bad.push(`${name}: ${(c.conclusion || "unknown").toLowerCase()}`);
    }
  }
  return bad.length ? `checks not green: ${bad.join(", ")}` : null;
}

// rules: git-flow-protected-push, merge-on-green
export function checkBash(input, branchOf = currentBranch, checksOf = ghChecks) {
  const cmd = (input.tool_input && input.tool_input.command) || "";
  // Each `git push` / `gh pr merge` segment of a compound command is checked on its own.
  for (const seg of cmd.split(/&&|\|\||;|\n/)) {
    const g = seg.match(/\bgh\s+pr\s+merge\b(.*)$/);
    if (g) {
      const { selector, repo } = parseMerge(g[1]);
      const why = mergeVerdict({ selector, repo, cwd: input.cwd || process.cwd() }, checksOf);
      if (why) {
        return {
          block: true,
          rule: "merge-on-green",
          reason:
            `Factory rule merge-on-green: gh pr merge${selector ? " " + selector : ""} is blocked, ${why}. ` +
            "Wait for every check to finish and pass (gh pr checks --watch), fix any failure, then merge in a later step.",
        };
      }
      continue;
    }
    const m =seg.match(/\bgit\b(?:\s+-C\s+(\S+))?((?:\s+-c\s+\S+)*)\s+push\b(.*)$/);
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
    if (tool === "Bash") {
      // factory-proof forces merge-on-green without a network: only its own session id may inject the rollup.
      const forced = input.session_id === "factory-proof" ? process.env.FACTORY_PROOF_CHECKS : undefined;
      if (forced === undefined) return checkBash(input);
      return checkBash(input, undefined, () => {
        if (forced === "gh-error") throw new Error("gh: forced failure");
        return JSON.parse(forced);
      });
    }
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
  // --global (user settings): a project with its own kit hook decides itself; two hooks would double the ledger lines.
  if (process.argv.includes("--global") && projectDir && existsSync(join(projectDir, ".claude/factory/hooks/factory-hook.mjs"))) process.exit(0);
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

// Fail closed: run whenever the started script is this file, however its path was spelled
// (a symlinked dir, --preserve-symlinks-main, a realpath error). Only an importer (the tests)
// does not run main(); a guard that exits 0 having checked nothing allows everything.
const startedAsHook = (() => {
  const arg = process.argv[1] || "";
  if (arg.endsWith("/factory-hook.mjs") || arg === "factory-hook.mjs") return true;
  try { return import.meta.url === pathToFileURL(realpathSync(arg)).href; } catch { return false; }
})();
if (startedAsHook) main();
