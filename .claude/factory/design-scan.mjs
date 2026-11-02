#!/usr/bin/env node
// design-scan --dir <tree> --baseline <file|-> [--pins <design-system.json|->] [--json]
//
// The design-system-only scanner (ADR-0022), shared by factory-design-check (nightly)
// and the factory-design.yml CI job that the kit installs into each repo. Zero
// dependencies, no imports from the factory: the kit copies this file as it is.
// It walks <dir> (git ls-files when <dir> is a git work tree, else a recursive walk
// minus .git and node_modules), lists colour literals, subtracts the baseline, and with
// --pins checks every copy's sha256 in design-system.json against the file in <dir>.
// `-` for --baseline or --pins means none. Exit 1 on a new literal or a pin mismatch,
// 2 when an input cannot be read, 0 otherwise.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const UI_FILE = /\.(css|scss|tsx|jsx|html|vue|swift)$/;
const EXCLUDED_SEGMENT = new Set(["node_modules", "vendor", "vendored", "third_party", "Pods", "Carthage", "generated", "__generated__", "dist", "build", "test", "tests", "__tests__", "Tests", "UITests", "e2e"]);
const EXCLUDED_NAME = /(\.(test|spec|generated|gen|min)\.[^/]+$)|(Tests?\.swift$)|(\.d\.ts$)/;
const REFERENCES = /(^|\/)skills\/(.+\/)?references\//;
// Mirrors and retired pages, not UI anyone writes: home-docs' deck mirrors and docs/archive.
const NOT_UI = /(^|\/)(decks|archive)\//;
// A file that says it is generated in its first lines is checked by its generator, not here.
const GENERATED_HEADER = /\bGENERATED\b|[Gg]enerated by|do not edit/;

const LITERALS = [
  { kind: "hex", re: /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g },
  { kind: "function", re: /\b(?:rgba?|hsla?|oklch)\(\s*[\d.]+/g },
  { kind: "swift", re: /\b(?:UIColor|Color)\(\s*(?:red|hex):|#colorLiteral/g },
];
const ALLOW = /design-system:\s*allow\s+(?!\*\/|-->)(\S.*?)\s*(?:\*\/|-->)?\s*$/;

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function isExcluded(path, copies = []) {
  if (copies.includes(path) || REFERENCES.test(path) || NOT_UI.test(path) || EXCLUDED_NAME.test(path)) return true;
  return path.split("/").slice(0, -1).some((s) => EXCLUDED_SEGMENT.has(s));
}

const normalize = (line) => line.trim().replace(/\s+/g, " ").slice(0, 200);

// The code part of a line: comments are prose ("PR #553", "issue #112") and never
// render a colour. Block comments are tracked across lines; `//` counts only at the
// start or after whitespace, so "https://" is not a comment.
export function codeOf(text, state) {
  let out = "";
  let i = 0;
  let quote = null; // a comment opener inside a string ("<!-- x", "src/**") is not a comment
  while (i < text.length) {
    if (state.inBlock) {
      const end = text.indexOf(state.inBlock, i);
      if (end < 0) return out;
      i = end + state.inBlock.length;
      state.inBlock = null;
      state.openedAt = null;
      continue;
    }
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === "\\") { out += text[i + 1] ?? ""; i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if ((ch === '"' || ch === "'" || ch === "`") && !state.markup) { quote = ch; out += ch; i += 1; continue; }
    const rest = text.slice(i);
    if (rest.startsWith("/*")) { state.inBlock = "*/"; state.openedAt ??= state.line; i += 2; continue; }
    if (state.markup && rest.startsWith("<!--")) { state.inBlock = "-->"; state.openedAt ??= state.line; i += 4; continue; }
    if (rest.startsWith("//") && (i === 0 || /\s/.test(text[i - 1]))) return out;
    out += text[i];
    i += 1;
  }
  return out;
}

// Every literal on every UI file of the export: { hits, allowed, generated, unclosed }.
export function scanLiterals(src, copies = []) {
  const hits = [];
  const allowed = [];
  const generated = [];
  const unclosed = [];
  for (const file of src.list().filter((p) => UI_FILE.test(p) && !isExcluded(p, copies)).sort()) {
    const body = src.read(file);
    if (!body) continue;
    const lines = body.toString("utf8").split("\n");
    // Skipped, but listed: a "do not edit" header must not hide hand-written UI unseen.
    if (GENERATED_HEADER.test(lines.slice(0, 5).join("\n"))) { generated.push(file); continue; }
    const state = { inBlock: null, openedAt: null, line: 0, markup: /\.(html?|vue|md)$/.test(file) };
    const codes = lines.map((text, i) => { state.line = i; return codeOf(text, state); });
    // A comment still open at the end of the file was not a comment: scan from its start as code.
    if (state.inBlock && state.openedAt != null) {
      for (let i = state.openedAt; i < lines.length; i++) codes[i] = lines[i];
      unclosed.push(file);
    }
    lines.forEach((text, i) => {
      const code = codes[i];
      const found = [];
      for (const { kind, re } of LITERALS) for (const m of code.matchAll(re)) found.push({ kind, literal: m[0] });
      if (!found.length) return;
      const allow = ALLOW.exec(text);
      for (const f of found) {
        const hit = { file, line: i + 1, kind: f.kind, literal: f.literal, text: normalize(text) };
        if (allow) allowed.push({ ...hit, reason: allow[1] });
        else hits.push(hit);
      }
    });
  }
  return { hits, allowed, generated, unclosed };
}

export const hitKey = (h) => `${h.file}\t${h.literal}\t${h.text}`;

export function loadBaseline(path) {
  if (!existsSync(path)) return { entries: [] };
  return JSON.parse(readFileSync(path, "utf8"));
}

// repo undefined: every entry (a repo's own slice, as the kit installs it).
export function baselineFor(baseline, repo) {
  const counts = new Map();
  for (const e of baseline.entries || []) {
    if (repo === undefined || e.repo === repo) counts.set(hitKey(e), (counts.get(hitKey(e)) || 0) + (e.count || 1));
  }
  return counts;
}

export function buildBaselineEntries(repo, hits) {
  const counts = new Map();
  for (const h of hits) {
    const k = hitKey(h);
    const e = counts.get(k) || { repo, file: h.file, literal: h.literal, text: h.text, count: 0 };
    e.count++;
    counts.set(k, e);
  }
  return [...counts.values()];
}

// The baseline hits are matched as a multiset: each entry absorbs `count` hits.
export function splitByBaseline(hits, counts) {
  const left = new Map(counts);
  const fresh = [];
  let baselined = 0;
  for (const h of hits) {
    const k = hitKey(h);
    if ((left.get(k) || 0) > 0) {
      left.set(k, left.get(k) - 1);
      baselined++;
    } else fresh.push(h);
  }
  return { fresh, baselined };
}

// A copy with a sha256 pin must hash to it. Returns drift details.
export function checkPins(cfg, src) {
  const drift = [];
  for (const { to, sha256: want } of cfg.copies || []) {
    if (!want) continue;
    const body = src.read(to);
    if (!body) { drift.push({ kind: "pin", detail: `${to}: missing in the repo (pinned sha256 ${want})` }); continue; }
    const got = sha256(body);
    if (got !== want) drift.push({ kind: "pin", detail: `${to} has sha256 ${got}, pinned ${want}` });
  }
  return drift;
}

function walk(root, rel = "") {
  const out = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// A tree on disk: { list(), read(path) -> Buffer|null }.
export function dirSource(dir) {
  const inGit = spawnSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).stdout?.trim() === "true";
  const tracked = inGit ? spawnSync("git", ["-C", dir, "ls-files", "-z"], { encoding: "utf8" }).stdout.split("\0").filter(Boolean) : null;
  return {
    list: () => tracked || walk(dir),
    read: (p) => { try { return readFileSync(join(dir, p)); } catch { return null; } },
  };
}

export function renderScan({ drift, fresh, allowed, generated, unclosed, total, baselined }) {
  const cell = (s) => String(s).replace(/\|/g, "/");
  const out = ["| Result | Detail |", "|---|---|"];
  for (const d of drift) out.push(`| drift: ${d.kind} | ${cell(d.detail)} |`);
  for (const h of fresh) out.push(`| literal | ${cell(`${h.file}:${h.line} ${h.literal}`)} |`);
  for (const a of allowed) out.push(`| allowed | ${cell(`${a.file}:${a.line} ${a.literal} (${a.reason})`)} |`);
  for (const g of generated) out.push(`| not scanned (generated header) | ${cell(g)} |`);
  for (const u of unclosed) out.push(`| comment never closed: scanned as code | ${cell(u)} |`);
  out.push(`| summary | ${total} literal(s), ${baselined} baselined, ${fresh.length} new, ${allowed.length} allowed, ${drift.length} drift |`);
  return out.join("\n") + "\n";
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const fail = (msg) => { process.stderr.write(`design-scan: ${msg}\n`); process.exit(2); };
  const dir = opt("--dir");
  const baselinePath = opt("--baseline");
  const pinsPath = opt("--pins");
  if (!dir || !baselinePath) fail("usage: design-scan.mjs --dir <tree> --baseline <file|-> [--pins <design-system.json|->] [--json]");
  if (!existsSync(dir)) fail(`--dir ${dir} does not exist`);
  let baseline = { entries: [] };
  if (baselinePath !== "-") {
    if (!existsSync(baselinePath)) fail(`baseline ${baselinePath} does not exist`);
    try { baseline = loadBaseline(baselinePath); } catch (e) { fail(`cannot read baseline ${baselinePath}: ${e.message}`); }
  }
  let cfg = null;
  if (pinsPath && pinsPath !== "-") {
    try { cfg = JSON.parse(readFileSync(pinsPath, "utf8")); } catch (e) { fail(`cannot read pins ${pinsPath}: ${e.message}`); }
  }
  const src = dirSource(dir);
  const copies = (cfg?.copies || []).map((c) => c.to);
  const { hits, allowed, generated, unclosed } = scanLiterals(src, copies);
  const { fresh, baselined } = splitByBaseline(hits, baselineFor(baseline));
  const drift = cfg ? checkPins(cfg, src) : [];
  const result = { drift, fresh, allowed, generated, unclosed, total: hits.length, baselined };
  for (const d of drift) process.stderr.write(`design-scan: drift-${d.kind}: ${d.detail}\n`);
  for (const h of fresh) process.stderr.write(`design-scan: literal: ${h.file}:${h.line} ${h.literal} — ${h.text}\n`);
  process.stdout.write(argv.includes("--json") ? JSON.stringify(result, null, 2) + "\n" : renderScan(result));
  process.exit(drift.length || fresh.length ? 1 : 0);
}

// Compare real paths: started through a symlink (macOS /var → /private/var) the plain
// comparison is false and the scanner would exit 0 having checked nothing.
const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1] || "")).href; } catch { return false; } })();
if (isMain) main();
