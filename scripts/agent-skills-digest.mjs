#!/usr/bin/env node
// agent-skills-digest.mjs — the pin the Atelier Harness checks before it loads the
// agent-skills plugin (HARNESS_AGENT_SKILLS_DIGEST in the Harness manifest).
//
// Digest = sha256 hex of the concatenation, for every regular file under the plugin
// directory sorted by relative POSIX path (bytewise, UTF-8), of:
//   <relpath> NUL <sha256hex(file bytes)> LF
// Directories are not hashed. The Harness computes exactly this (atelier-harness).
//
// Usage: node scripts/agent-skills-digest.mjs [dir]   (default: agent-skills)
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Every regular file under `root` (symlinks and other types are listed too, so the lint can refuse them). */
export function walk(root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isDirectory()) visit(full);
      else out.push({ full, rel: relative(root, full).split(sep).join("/"), st });
    }
  };
  visit(root);
  return out;
}

export function digest(root) {
  const files = walk(root)
    .filter((f) => f.st.isFile())
    .sort((a, b) => Buffer.compare(Buffer.from(a.rel, "utf8"), Buffer.from(b.rel, "utf8")));
  const h = createHash("sha256");
  for (const f of files) {
    const fileHash = createHash("sha256").update(readFileSync(f.full)).digest("hex");
    h.update(Buffer.from(`${f.rel}\0${fileHash}\n`, "utf8"));
  }
  return h.digest("hex");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(digest(process.argv[2] ?? "agent-skills"));
}
