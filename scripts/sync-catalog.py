#!/usr/bin/env python3
"""
sync-catalog.py — derive the MCP entries in mcps/*.json from source instead of hand-editing them.

Source of truth is `atelier-butler/mcp/<id>/`: the directory name is the MCP's
id, `package.json` carries the version, and the tool list is whatever
`server.tool("name", ...)` registrations exist in `src/`. `mcps/<id>.json` in
this repo is output (and `catalog.json` + `compat/` after it, via
`scripts/build-catalog.py`, which `--write` runs for you).

Why this exists (audit, 2026-08-29): all 17 MCPs had drifted in at least one
layer. fortigate was published as 43 tools while source had 71. shelly was 12
in one catalog and 13 in the other. Three renames (netbox→ipam,
prometheus→observability, homekit→homebridge) never reached the distribution
index. Hand-maintained metadata is what produced all of that, so this script
generates it.

History: until 2026-10-19 this script lived in `atelier-mcps` and also wrote
that repo's `catalog.json` and `mcps/<id>/manifest.json`, plus a GitHub
Releases `downloadURL`/`checksum`/`size` here. atelier-mcps never cut a single
release (every checksum was "sha256:placeholder", every URL 404) and its only
consumer, Atelier Designer, is archived, so the repo was retired and this
catalog became the single index. MCPs run from the Butler image
(`atelier-butler/mcp/`) and, for local Claude Code, from
`atelier-butler/mcp/<id>/dist`. A `--write` strips the old download fields.

Native servers (2026-10-18). Butler also serves tools itself — `atelier.*`,
`people.*`, `memory.*`, … — registered in the gateway, with no `mcp/<id>/`
directory. Their source of truth is `atelier-butler/gateway/native-servers.json`,
generated in that repo by `gateway/scripts/native-servers.mjs` (CI-checked
there). They are indexed with `kind: "native"`: version = the gateway's
version, no package. If that file is missing (an older atelier-butler
checkout), native entries are left exactly as they are and the run says
NOT VERIFIED — never dropped.

Usage:
    scripts/sync-catalog.py                 # report drift, change nothing
    scripts/sync-catalog.py --check         # exit 1 if drift exists (CI gate)
    scripts/sync-catalog.py --write         # apply, then rebuild catalog.json + compat/
    scripts/sync-catalog.py --write --adopt-source-versions

On versions: package.json is canonical, but catalog versions were once ahead of
source. So a *lower* source version is reported and NOT written unless
--adopt-source-versions is passed. Regenerating must never silently downgrade.

Paths (override with env): MCP_SOURCE_DIR (default ../atelier-butler/mcp),
MCP_NATIVE_MANIFEST (default ../atelier-butler/gateway/native-servers.json),
MCP_CONSUMER_CATALOG (default ./mcps).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATFORM = os.path.dirname(REPO_ROOT)

SOURCE_DIR = os.environ.get("MCP_SOURCE_DIR", os.path.join(PLATFORM, "atelier-butler", "mcp"))
CONSUMER_CATALOG = os.environ.get("MCP_CONSUMER_CATALOG", os.path.join(REPO_ROOT, "mcps"))
NATIVE_MANIFEST = os.environ.get(
    "MCP_NATIVE_MANIFEST",
    os.path.join(os.path.dirname(os.path.abspath(SOURCE_DIR)), "gateway", "native-servers.json"),
)
NATIVE_ENDPOINT = "/api/v1/butler/mcp"
BUILD_CATALOG = os.path.join(REPO_ROOT, "scripts", "build-catalog.py")

# Matches `server.tool(` followed by the tool name, across newlines. Both the
# one-line and the wrapped registration styles appear in these sources.
TOOL_RE = re.compile(r"""server\.tool\(\s*["']([A-Za-z0-9_]+)["']""")

# Fields that only ever pointed at atelier-mcps GitHub Releases (never cut).
RELEASE_ONLY = ("downloadURL", "size", "checksum")
# Package-only fields a native entry must not carry (nothing to download or spawn).
PACKAGE_ONLY = RELEASE_ONLY + ("entrypoint", "minRuntimeVersion", "command", "args", "env")


# ── helpers ──────────────────────────────────────────────────────────────────

def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def dump_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def semver(v):
    """('1.2.3') -> (1, 2, 3). Unparseable sorts lowest so it never wins."""
    parts = re.findall(r"\d+", str(v or ""))
    return tuple(int(p) for p in (parts + ["0", "0", "0"])[:3])


def discover_tools(src_dir):
    """Every tool registered anywhere under src/, deduped, in declaration order."""
    seen, ordered = set(), []
    for path in sorted(glob.glob(os.path.join(src_dir, "**", "*.ts"), recursive=True)):
        with open(path, encoding="utf-8", errors="replace") as fh:
            for name in TOOL_RE.findall(fh.read()):
                if name not in seen:
                    seen.add(name)
                    ordered.append(name)
    return ordered


def read_source():
    """{id: {version, tools, description}} from atelier-butler/mcp/*/."""
    out = {}
    if not os.path.isdir(SOURCE_DIR):
        sys.exit(f"Source tree not found: {SOURCE_DIR}\nSet MCP_SOURCE_DIR to override.")
    for entry in sorted(os.listdir(SOURCE_DIR)):
        d = os.path.join(SOURCE_DIR, entry)
        pkg = load_json(os.path.join(d, "package.json"))
        if not pkg:
            continue
        src = os.path.join(d, "src")
        out[entry] = {
            "version": pkg.get("version", "0.0.0"),
            "description": pkg.get("description", ""),
            "tools": discover_tools(src) if os.path.isdir(src) else [],
        }
    return out


def read_native():
    """{id: {...}} from atelier-butler/gateway/native-servers.json, or None if absent."""
    data = load_json(NATIVE_MANIFEST)
    if data is None:
        return None
    if data.get("kind") != "native" or not isinstance(data.get("servers"), list):
        sys.exit(f"{NATIVE_MANIFEST} is not a native-servers manifest (kind/servers missing)")
    version = data.get("gatewayVersion") or "0.0.0"
    return {
        s["id"]: {
            "version": version,
            "name": s.get("name") or s["id"],
            "description": s.get("description", ""),
            "tags": s.get("tags", []),
            "tools": list(s.get("tools", [])),
        }
        for s in data["servers"]
    }


# ── planning ─────────────────────────────────────────────────────────────────

def plan(source, adopt_source_versions, native=None):
    """Decide the target state for every MCP, and collect drift notes.

    Notes are (severity, message). BLOCKING means `--write` fixes it, so CI
    should refuse the PR. ADVISORY needs a human decision — reported every run,
    but never fails the gate. A gate that cannot go green is a gate everyone
    learns to ignore.
    """
    BLOCKING, ADVISORY = "blocking", "advisory"
    consumer = {}
    for f in glob.glob(os.path.join(CONSUMER_CATALOG, "*.json")):
        d = load_json(f)
        if d:
            consumer[d.get("catalogID", os.path.basename(f)[:-5])] = (f, d)

    entries, notes = {}, []

    collisions = sorted(set(source) & set(native or {}))
    if collisions:
        sys.exit(f"ids both under mcp/ and native in the gateway: {', '.join(collisions)} — rename one")

    for mcp_id, s in sorted(source.items()):
        path, prev = consumer.get(mcp_id, (None, {}))
        if not prev:
            notes.append((BLOCKING, f"{mcp_id}: not indexed in mcps/ yet"))
        if prev.get("kind") == "native":
            notes.append((BLOCKING, f"{mcp_id}: indexed as native but now has a source directory under mcp/"))

        version = s["version"]
        published = prev.get("version")
        if published and semver(published) > semver(version):
            if adopt_source_versions:
                notes.append((ADVISORY,
                    f"{mcp_id}: adopting source {version} over catalog {published} (--adopt-source-versions)"))
            else:
                notes.append((ADVISORY,
                    f"{mcp_id}: source package.json says {version} but the catalog has {published} — "
                    f"keeping {published}. Bump package.json, or pass --adopt-source-versions."))
                version = published
        elif published and published != version:
            notes.append((BLOCKING, f"{mcp_id}: version {published} -> {version}"))

        tools = s["tools"]
        if prev.get("toolCount") is not None and prev["toolCount"] != len(tools):
            notes.append((BLOCKING, f"{mcp_id}: toolCount {prev['toolCount']} -> {len(tools)}"))
        stale = [k for k in RELEASE_ONLY if k in prev]
        if stale:
            notes.append((BLOCKING, f"{mcp_id}: drops {', '.join(stale)} (atelier-mcps releases, retired)"))

        entries[mcp_id] = {
            "id": mcp_id,
            "name": prev.get("name") or mcp_id,
            "version": version,
            "description": prev.get("description") or s["description"],
            "toolCount": len(tools),
            "runtime": prev.get("runtime", "node"),
            "transport": prev.get("transport", "stdio"),
            "tags": prev.get("tags") or [],
            "_path": path,
            "_prev": prev,
        }

    # ── native servers (gateway/native-servers.json) ──
    if native is None:
        kept = sorted(i for i, (_, d) in consumer.items() if d.get("kind") == "native")
        notes.append((ADVISORY,
            f"native servers NOT VERIFIED: {NATIVE_MANIFEST} not found — "
            f"{len(kept)} native entr{'y' if len(kept) == 1 else 'ies'} left untouched"))
        native_ids = set(kept)
    else:
        native_ids = set(native)
        for mcp_id, n in sorted(native.items()):
            path, prev = consumer.get(mcp_id, (None, {}))
            if not prev:
                notes.append((BLOCKING, f"{mcp_id} (native): not indexed in mcps/ yet"))
            tools = n["tools"]
            if prev.get("toolCount") is not None and prev["toolCount"] != len(tools):
                notes.append((BLOCKING, f"{mcp_id} (native): toolCount {prev['toolCount']} -> {len(tools)}"))
            if prev.get("version") is not None and prev["version"] != n["version"]:
                notes.append((BLOCKING, f"{mcp_id} (native): version {prev['version']} -> {n['version']} (gateway)"))
            entries[mcp_id] = {
                "id": mcp_id,
                "kind": "native",
                "name": n["name"],
                "version": n["version"],
                "description": n["description"],
                "toolCount": len(tools),
                "tags": n["tags"],
                "_path": path,
                "_prev": prev,
            }

    for stale in sorted(set(consumer) - set(source) - native_ids):
        notes.append((BLOCKING, f"{stale}: mcps/ entry with no source directory — renamed or retired. Will be dropped."))

    return entries, notes


def write(entries, native_verified=True):
    for mcp_id, e in entries.items():
        cpath = e["_path"] or os.path.join(CONSUMER_CATALOG, f"{mcp_id}.json")
        if e.get("kind") == "native":
            entry = {k: v for k, v in e["_prev"].items() if k not in PACKAGE_ONLY}
            entry.update(
                {
                    "catalogID": mcp_id,
                    "kind": "native",
                    "name": e["name"],
                    "description": e["description"],
                    "version": e["version"],
                    "source": "butlerNative",
                    "transport": "butler",
                    "endpoint": NATIVE_ENDPOINT,
                    "toolCount": e["toolCount"],
                    "runtime": "butler-gateway",
                    "tags": e["tags"],
                }
            )
        else:
            entry = {k: v for k, v in e["_prev"].items() if k not in RELEASE_ONLY}
            entry.update(
                {
                    "catalogID": mcp_id,
                    "name": e["name"],
                    "description": e["description"],
                    "version": e["version"],
                    "transport": e["transport"],
                    "toolCount": e["toolCount"],
                    "runtime": e["runtime"],
                    "tags": e["tags"],
                }
            )
            entry.setdefault("source", "builtIn")
            entry.setdefault("command", "node")
            entry.setdefault("args", ["dist/index.js"])
        entry.setdefault("category", "core")
        dump_json(cpath, entry)

    # Drop entries whose source is gone. An unverified run keeps native rows.
    keep = set(entries)
    for f in glob.glob(os.path.join(CONSUMER_CATALOG, "*.json")):
        d = load_json(f)
        if not d:
            continue
        cid = d.get("catalogID", os.path.basename(f)[:-5])
        if cid in keep or (not native_verified and d.get("kind") == "native"):
            continue
        os.remove(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="apply changes, then run build-catalog.py")
    ap.add_argument("--check", action="store_true", help="exit 1 if drift exists (CI gate)")
    ap.add_argument(
        "--adopt-source-versions",
        action="store_true",
        help="let package.json win even when it is LOWER than the catalog version",
    )
    args = ap.parse_args()

    source = read_source()
    native = read_native()
    entries, notes = plan(source, args.adopt_source_versions, native)

    pkgs = [e for e in entries.values() if e.get("kind") != "native"]
    nats = [e for e in entries.values() if e.get("kind") == "native"]
    p_tools, n_tools = sum(e["toolCount"] for e in pkgs), sum(e["toolCount"] for e in nats)
    print(f"{len(pkgs)} MCPs / {p_tools} tools from {SOURCE_DIR}")
    if native is None:
        print(f"native servers: NOT VERIFIED ({NATIVE_MANIFEST} not found)")
    else:
        print(f"{len(nats)} native servers / {n_tools} tools from {NATIVE_MANIFEST}")
        print(f"total: {len(entries)} servers / {p_tools + n_tools} tools")
    print()
    print(f"{'mcp':<16} {'version':<9} {'tools':>6}  kind")
    print("-" * 50)
    for mcp_id, e in sorted(entries.items(), key=lambda kv: (kv[1].get("kind") == "native", kv[0])):
        kind = "native (served by Butler)" if e.get("kind") == "native" else "package (atelier-butler/mcp)"
        print(f"{mcp_id:<16} {e['version']:<9} {e['toolCount']:>6}  {kind}")

    blocking = [m for sev, m in notes if sev == "blocking"]
    advisory = [m for sev, m in notes if sev == "advisory"]

    if blocking:
        print()
        print(f"BLOCKING — --write fixes these ({len(blocking)}):")
        for m in blocking:
            print(f"  - {m}")

    if advisory:
        print()
        print(f"advisory — needs a decision ({len(advisory)}):")
        for m in advisory:
            print(f"  - {m}")

    if args.check:
        if blocking:
            print(
                f"\nFAIL: {len(blocking)} generated field(s) disagree with source. "
                f"Run scripts/sync-catalog.py --write and commit the result."
            )
            return 1
        print(f"\nOK: generated fields match source ({len(advisory)} advisory item(s)).")
        return 0

    if args.write:
        write(entries, native_verified=native is not None)
        print(f"\nWrote {CONSUMER_CATALOG}/*.json — rebuilding catalog.json + compat/ …")
        return subprocess.call([sys.executable, BUILD_CATALOG])
    print("\nDry run — nothing written. Pass --write to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
