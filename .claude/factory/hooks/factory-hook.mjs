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
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROTECTED_BRANCHES = ["main", "develop"];
const ENV_TEMPLATES = /\.(example|sample|template|dist)$/;

const stateRoot = () => process.env.FACTORY_STATE_DIR || join(homedir(), ".atelier-factory");

function ledger(entry) {
  try {
    const dir = join(stateRoot(), "ledger");
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
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; } // absent or unreadable: no pin from here
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
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

// A check that re-runs (a docs gate on a PR body edit) leaves its old failure in the rollup.
// Drop an entry only when it is in BODY_DEPENDENT_WORKFLOWS and a strictly newer run (a
// different run id) of the same workflow+name exists; anything with a missing field stays
// and is judged as before, so this fails closed.
// Only the Docs gate: its verdict depends on the PR body, not the code, and it re-runs as a
// new run when the body is edited. Every other check's failure is about the code and must
// never be hidden (matrix legs share workflow and name, so a pass must not mask a failed leg).
const BODY_DEPENDENT_WORKFLOWS = new Set(["Docs gate"]);
const runId = (c) => {
  const m = /\/actions\/runs\/(\d+)\//.exec((c && c.detailsUrl) || "");
  return m ? m[1] : null;
};
const startedMs = (c) => {
  const t = Date.parse(c && c.startedAt);
  return t > Date.parse("2000-01-01T00:00:00Z") ? t : null;
};
const isCheckRun = (c) => !(c.__typename === "StatusContext" || (c.state !== undefined && c.conclusion === undefined));
export function latestChecks(rollup) {
  return rollup.filter((c) => {
    if (!c || !isCheckRun(c) || !c.workflowName || !c.name) return true;
    if (!BODY_DEPENDENT_WORKFLOWS.has(c.workflowName)) return true;
    const t = startedMs(c);
    const id = runId(c);
    if (t === null || id === null) return true;
    return !rollup.some((o) => {
      if (o === c || !o || !isCheckRun(o) || o.workflowName !== c.workflowName || o.name !== c.name) return false;
      const oid = runId(o);
      return oid !== null && oid !== id && (startedMs(o) ?? -1) > t;
    });
  });
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
  rollup = latestChecks(rollup);
  if (rollup.length === 0) return 'no checks reported ("no checks" is not green)';
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

// The PR's base branch from gh; throws when gh fails (the caller fails closed).
function ghBase({ selector, repo, cwd }) {
  const args = ["pr", "view", ...(selector ? [selector] : []), ...(repo ? ["-R", repo] : []), "--json", "baseRefName"];
  const out = execFileSync("gh", args, { encoding: "utf8", cwd, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out).baseRefName;
}

function gitRemote(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const LOCK_TTL_MS = 3 * 3600 * 1000;
const repoName = (s) => s.replace(/\/+$/, "").split(/[/:]/).pop().replace(/\.git$/, "");
const tokensOf = (rest) => (rest.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ""));
const repoFlag = (toks) => {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === "-R" || toks[i] === "--repo") return toks[i + 1] || null;
    if (toks[i].startsWith("--repo=")) return toks[i].slice(7);
  }
  return null;
};
const isTagRefspec = (r) => {
  const dst = r.replace(/^\+/, "").split(":").pop();
  return dst.startsWith("refs/tags/") || /^v?\d+\.\d+/.test(dst) || dst.includes("@");
};

// Release actions in one command, each segment on its own: { found: [{ action, key?, repo?, dir? }] } or { error }.
function releaseActions(cmd, cwd, baseOf) {
  const found = [];
  for (const seg of cmd.split(/&&|\|\||;|\n/)) {
    let m;
    if ((m = seg.match(/\bgh\s+pr\s+merge\b(.*)$/))) {
      const { selector, repo } = parseMerge(m[1]);
      let base;
      try {
        base = baseOf({ selector, repo, cwd });
      } catch (e) {
        return { error: `could not read the base branch of the PR to merge (${String(e.message || e).split("\n")[0].slice(0, 160)})` };
      }
      if (base === "main") found.push({ action: "gh pr merge into main", repo });
    }
    if ((m = seg.match(/\bgh\s+pr\s+create\b(.*)$/))) {
      const toks = tokensOf(m[1]);
      const i = toks.findIndex((t) => t === "-B" || t === "--base" || t.startsWith("--base="));
      const base = i < 0 ? null : toks[i].startsWith("--base=") ? toks[i].slice(7) : toks[i + 1];
      if (base === "main") found.push({ action: "gh pr create --base main", repo: repoFlag(toks) });
    }
    if ((m = seg.match(/\bgh\s+release\s+create\b(.*)$/))) found.push({ action: "gh release create", repo: repoFlag(tokensOf(m[1])) });
    if ((m = seg.match(/\bgit\b(?:\s+-C\s+(\S+))?((?:\s+-c\s+\S+)*)\s+push\b(.*)$/))) {
      const toks = tokensOf(m[3]);
      const refspecs = toks.filter((a) => !a.startsWith("-")).slice(1);
      if (toks.includes("--tags") || toks.includes("--follow-tags") || refspecs.some(isTagRefspec)) {
        found.push({ action: "git push of a tag", dir: m[1] ? m[1].replace(/^["']|["']$/g, "") : null });
      }
    }
    if (/\bharness-release\.sh\b/.test(seg)) found.push({ action: "harness-release.sh", key: "atelier-harness" });
    if (/\bxcodebuild\b/.test(seg) && /(^|\s)(archive|-exportArchive)(\s|$)/.test(seg)) found.push({ action: "xcodebuild archive/export", key: "atelier-companion" });
    if (/\barchive-tvos\.sh\b/.test(seg) && /\bupload\b/.test(seg)) found.push({ action: "archive-tvos.sh upload", key: "atelier-companion" });
    if (/\b(altool|notarytool)\b/.test(seg)) found.push({ action: "altool/notarytool", key: "atelier-companion" });
  }
  return { found };
}

const safeKey = (key) => key.replace(/[^A-Za-z0-9._-]/g, "_");

// Take, renew or refuse the release lock. Exclusive create (wx): of two racing takers one gets EEXIST.
export function acquireLock({ stateDir, key, session, action, now }) {
  const dir = join(stateDir, "release-lock");
  const file = join(dir, `${safeKey(key)}.json`);
  mkdirSync(dir, { recursive: true });
  const iso = new Date(now).toISOString();
  const fresh = { session_id: session, key, action, taken_at: iso, renewed_at: iso };
  try {
    writeFileSync(file, JSON.stringify(fresh, null, 2) + "\n", { flag: "wx" });
    return { state: "taken", lock: fresh };
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  let held;
  try { held = JSON.parse(readFileSync(file, "utf8")); } catch { return { state: "unreadable", file }; }
  const replace = (lock) => {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(lock, null, 2) + "\n");
    renameSync(tmp, file);
  };
  if (!(now - Date.parse(held.renewed_at) < LOCK_TTL_MS)) { // also true when renewed_at is unparseable
    replace(fresh);
    return { state: "taken", lock: fresh };
  }
  if (held.session_id === session) {
    const lock = { ...held, action, renewed_at: iso };
    replace(lock);
    return { state: "renewed", lock };
  }
  return { state: "held", lock: held };
}

// rule: release-lock
export function checkRelease(input, deps = {}) {
  const baseOf = deps.baseOf || ghBase;
  const remoteOf = deps.remoteOf || gitRemote;
  const now = deps.now === undefined ? Date.now() : deps.now;
  const cwd = input.cwd || process.cwd();
  const cmd = (input.tool_input && input.tool_input.command) || "";
  const block = (reason) => ({ block: true, rule: "release-lock", reason: `Factory rule release-lock: ${reason}` });
  const r = releaseActions(cmd, cwd, baseOf);
  if (r.error) return block(`${r.error}; failing closed. Retry once gh works.`);
  let result = { block: false, rule: "release-lock" };
  for (const a of r.found) {
    let key = a.key;
    if (!key) {
      if (a.repo) key = repoName(a.repo);
      else {
        const url = remoteOf(a.dir || cwd);
        key = url ? repoName(url) : null;
      }
    }
    if (!key) return block(`${a.action} is a release action but the repo could not be told (no -R and no origin remote in ${cwd}); failing closed.`);
    if (!input.session_id) return block(`${a.action} on ${key} needs a session_id to hold the release lock and there is none; failing closed.`);
    let got;
    try {
      got = acquireLock({ stateDir: deps.stateDir || stateRoot(), key, session: input.session_id, action: a.action, now });
    } catch (e) {
      return block(`${a.action} on ${key}: the release lock could not be written (${String(e.message || e).slice(0, 120)}); failing closed.`);
    }
    if (got.state === "unreadable") return block(`${a.action} on ${key}: the lock file ${got.file} is unreadable; failing closed. With Filipe's OK: node bin/factory-release-lock.mjs release ${key}`);
    if (got.state === "held") {
      const h = got.lock;
      return {
        ...block(
          `${a.action} on ${key} is blocked, session ${h.session_id} holds the release lock (${h.action}, taken ${h.taken_at}). ` +
            `Hand the release to that session, or, if it has finished, run \`node bin/factory-release-lock.mjs release ${key}\` (only with Filipe's OK).`,
        ),
        key,
        holder: h.session_id,
      };
    }
    result = { block: false, rule: "release-lock", lock: got.state, key, lockAction: a.action };
  }
  return result;
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
      const b = forced === undefined ? checkBash(input) : checkBash(input, undefined, () => {
        if (forced === "gh-error") throw new Error("gh: forced failure");
        return JSON.parse(forced);
      });
      // Same injection for the PR base, so the proof session never shells out to gh for it.
      return b.block ? b : checkRelease(input, forced === undefined ? {} : { baseOf: () => process.env.FACTORY_PROOF_BASE || "develop" });
    }
    if (tool === "mcp__unraid__run_command") return checkRelease(input);
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
    ledger({ ...base, rule: d.rule, action: "blocked", tool: input.tool_name, ...(d.key ? { key: d.key, holder: d.holder } : {}) });
    process.stderr.write(d.reason + "\n");
    process.exit(2);
  }
  if (d.rule === "release-lock" && d.lock) {
    ledger({ ...base, rule: d.rule, action: d.lock, tool: input.tool_name, key: d.key, release: d.lockAction });
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
