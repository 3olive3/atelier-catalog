#!/usr/bin/env node
// lint-agent-skills.mjs — refuse anything in agent-skills/ that is not text for a model.
//
// The agent-skills plugin is loaded by the Atelier Harness into agents that act on the
// house. A plugin can carry hooks, MCP servers, sub-agents and commands — each one a way
// to give an agent capability or code that Guardian never sees. So this plugin may hold
// ONLY: .claude-plugin/plugin.json, README.md, skills/<id>/SKILL.md. The Harness refuses
// the same things at load time; this is the review-time half.
//
// Usage: node scripts/lint-agent-skills.mjs [dir]   (default: agent-skills)
// Exit 0 = clean (prints the digest), 1 = findings.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { digest, walk } from "./agent-skills-digest.mjs";

const root = process.argv[2] ?? "agent-skills";
const PLUGIN_NAME = "casa";
const MAX_SKILL_CHARS = 12_000;
const ID = /^[a-z][a-z0-9-]{1,40}$/;
const PLUGIN_KEYS = new Set(["name", "version", "description", "author", "license", "keywords"]);
const FORBIDDEN_DIRS = ["hooks", "agents", "commands", "output-styles", "scripts", "bin", "mcp"];
const FORBIDDEN_FILES = [".mcp.json", ".lsp.json", "hooks.json", "settings.json"];

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(api[_-]?key|token|secret|password|passwd|pwd)\b["']?\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{8,}/i, "credential assignment"],
  [/\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, "GitHub token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "API key (sk-)"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, "JWT"],
  [/\b[0-9a-f]{32,}\b/i, "long hex run"],
  [/[A-Za-z0-9+/]{40,}={0,2}/, "long base64 run"],
];
const URL_PATTERN = /\b(https?|ftp|wss?):\/\/|\bwww\.[a-z0-9-]+\./i;

const problems = [];
const bad = (path, msg) => problems.push(`${path}: ${msg}`);

let entries;
try {
  entries = walk(root);
} catch (e) {
  console.error(`cannot read ${root}: ${e.message}`);
  process.exit(1);
}

const seenSkills = [];
for (const { full, rel, st } of entries) {
  const parts = rel.split("/");
  const dirHit = parts.slice(0, -1).find((p) => FORBIDDEN_DIRS.includes(p));
  if (dirHit) { bad(rel, `forbidden directory "${dirHit}/" (hooks, agents, commands, scripts never belong in agent skills)`); continue; }
  if (FORBIDDEN_FILES.includes(parts.at(-1))) { bad(rel, `forbidden file "${parts.at(-1)}" (no MCP servers, hooks or settings)`); continue; }
  if (st.isSymbolicLink()) { bad(rel, "symlink not allowed"); continue; }
  if (!st.isFile()) { bad(rel, "not a regular file"); continue; }

  const isPlugin = rel === ".claude-plugin/plugin.json";
  const isReadme = rel === "README.md";
  const isSkill = parts.length === 3 && parts[0] === "skills" && parts[2] === "SKILL.md";
  if (!isPlugin && !isReadme && !isSkill) { bad(rel, "unexpected file: only .claude-plugin/plugin.json, README.md and skills/<id>/SKILL.md are allowed"); continue; }

  const buf = readFileSync(full);
  const text = buf.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buf)) { bad(rel, "not valid UTF-8"); continue; }
  if (URL_PATTERN.test(text)) bad(rel, "contains a URL (skills are judgement, not links; agents have no web)");
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) bad(rel, `looks like a secret (${what})`);

  if (isPlugin) {
    let pj;
    try { pj = JSON.parse(text); } catch (e) { bad(rel, `invalid JSON: ${e.message}`); continue; }
    if (pj?.name !== PLUGIN_NAME) bad(rel, `plugin name must be "${PLUGIN_NAME}"`);
    for (const k of Object.keys(pj ?? {})) if (!PLUGIN_KEYS.has(k)) bad(rel, `key "${k}" not allowed (only ${[...PLUGIN_KEYS].join(", ")})`);
  }
  if (isSkill) {
    const id = parts[1];
    seenSkills.push(id);
    if (!ID.test(id)) bad(rel, `skill id "${id}" must match ${ID}`);
    if (text.length > MAX_SKILL_CHARS) bad(rel, `${text.length} chars > ${MAX_SKILL_CHARS}`);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!fm) { bad(rel, "missing YAML frontmatter (---)"); continue; }
    const field = (k) => (new RegExp(`^${k}:\\s*(.+)$`, "m").exec(fm[1])?.[1] ?? "").trim();
    if (field("name") !== id) bad(rel, `frontmatter name "${field("name")}" must equal the directory "${id}"`);
    const desc = field("description");
    if (!desc) bad(rel, "frontmatter description missing");
    else if (desc.length > 1024) bad(rel, "description longer than 1024 chars");
    for (const k of ["allowed-tools", "hooks", "model", "context", "agent"]) if (field(k)) bad(rel, `frontmatter "${k}" not allowed (a skill grants no tools and runs no code)`);
  }
}
if (!entries.some((e) => e.rel === ".claude-plugin/plugin.json")) bad(".claude-plugin/plugin.json", "missing");
if (!seenSkills.length) bad("skills/", "no skills found");

if (problems.length) {
  console.error(`agent-skills lint: ${problems.length} problem(s) in ${root}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`agent-skills lint: OK — ${seenSkills.length} skills (${seenSkills.sort().join(", ")})`);
console.log(`digest: ${digest(root)}`);
