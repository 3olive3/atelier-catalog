#!/usr/bin/env python3
"""
Build unified catalog.json from individual entry files.

Reads all JSON entries from the 10 type directories, validates them,
and assembles a single catalog.json that the Atelier app can fetch
in one HTTP request.

Also generates backward-compatible shim catalogs for the legacy
atelier-mcps and atelier-skills fetch URLs.

Usage:
    python3 scripts/build-catalog.py
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent

RESOURCE_TYPES = [
    "guardrails",
    "permissions",
    "mcps",
    "skills",
    "role-profiles",
    "git-repositories",
    "tech-stacks",
    "knowledge-bases",
    "context-files",
    "observability",
]

REQUIRED_FIELDS = {"catalogID", "name", "description", "version", "source"}


def load_entries(type_dir: str) -> list[dict]:
    """Load all JSON entries from a resource type directory."""
    dir_path = REPO_ROOT / type_dir
    if not dir_path.is_dir():
        print(f"  WARNING: directory {type_dir}/ not found, skipping")
        return []

    entries = []
    for json_file in sorted(dir_path.glob("*.json")):
        try:
            data = json.loads(json_file.read_text())
        except json.JSONDecodeError as e:
            print(f"  ERROR: invalid JSON in {json_file.name}: {e}")
            sys.exit(1)

        # Validate required fields
        missing = REQUIRED_FIELDS - set(data.keys())
        if missing:
            print(f"  ERROR: {json_file.name} missing required fields: {missing}")
            sys.exit(1)

        # Validate catalogID matches filename
        expected_id = json_file.stem
        if data["catalogID"] != expected_id:
            print(
                f"  ERROR: {json_file.name} catalogID '{data['catalogID']}' "
                f"doesn't match filename '{expected_id}'"
            )
            sys.exit(1)

        entries.append(data)

    return entries


def build_compat_mcps(mcp_entries: list[dict]) -> dict:
    """Generate backward-compatible MCP catalog (atelier-mcps format).

    Maps catalogID -> id and ensures all fields expected by
    MCPCatalogEntry.init(from:) are present.
    """
    compat_entries = []
    for entry in mcp_entries:
        compat = {
            "id": entry["catalogID"],
            "name": entry["name"],
            "version": entry.get("version", "1.0.0"),
            "description": entry["description"],
            "toolCount": entry.get("toolCount", 0),
            "runtime": entry.get("runtime", "node"),
            "transport": entry.get("transport", "stdio"),
            "tags": entry.get("tags", []),
            "downloadURL": entry.get(
                "downloadURL",
                f"https://github.com/3olive3/atelier-mcps/releases/download/v{entry.get('version', '1.0.0')}/{entry['catalogID']}-{entry.get('version', '1.0.0')}.tar.gz",
            ),
            "size": entry.get("size", "unknown"),
            "checksum": entry.get("checksum", ""),
        }
        compat_entries.append(compat)

    return {
        "version": "2.0.0",
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mcps": compat_entries,
    }


def build_compat_skills(skill_entries: list[dict], bundles: list[dict]) -> dict:
    """Generate backward-compatible skills catalog (atelier-skills format).

    Maps catalogID -> id and ensures all fields expected by
    SkillCatalogEntry.init(from:) are present.
    """
    compat_entries = []
    for entry in skill_entries:
        compat = {
            "id": entry["catalogID"],
            "name": entry["name"],
            "version": entry.get("version", "1.0.0"),
            "description": entry["description"],
            "author": entry.get("author", "Unknown"),
            "license": entry.get("license", "MIT"),
            "sourceURL": entry.get("sourceURL", ""),
            "tags": entry.get("tags", []),
            "category": entry.get("category", "general"),
            "downloadURL": entry.get(
                "downloadURL",
                f"https://raw.githubusercontent.com/3olive3/atelier-skills/main/skills/{entry['catalogID']}/SKILL.md",
            ),
        }
        compat_entries.append(compat)

    return {
        "version": "1.3.0",
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "skills": compat_entries,
        "bundles": bundles,
    }


def main():
    print("Building unified catalog...")

    all_types = {}
    total_entries = 0

    for resource_type in RESOURCE_TYPES:
        print(f"  Loading {resource_type}/...")
        entries = load_entries(resource_type)
        all_types[resource_type] = entries
        total_entries += len(entries)
        print(f"    {len(entries)} entries")

    # Load bundles from bundles.json if it exists
    bundles_file = REPO_ROOT / "bundles.json"
    bundles = []
    if bundles_file.exists():
        bundles = json.loads(bundles_file.read_text())
        print(f"  Loaded {len(bundles)} bundles")

    # Build unified catalog
    catalog = {
        "name": "Atelier Official Catalog",
        "version": "2.0.0",
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "description": "Built-in and community catalog entries for the Atelier platform",
        "repository": "https://github.com/3olive3/atelier-catalog",
        "totalEntries": total_entries,
        "types": all_types,
        "bundles": bundles,
    }

    # Write unified catalog
    catalog_path = REPO_ROOT / "catalog.json"
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"\n  Wrote catalog.json ({total_entries} entries)")

    # Build backward-compatible shim catalogs
    compat_dir = REPO_ROOT / "compat"
    compat_dir.mkdir(exist_ok=True)

    mcps_compat = build_compat_mcps(all_types.get("mcps", []))
    mcps_compat_path = compat_dir / "mcps-catalog.json"
    mcps_compat_path.write_text(
        json.dumps(mcps_compat, indent=2, ensure_ascii=False) + "\n"
    )
    print(f"  Wrote compat/mcps-catalog.json ({len(mcps_compat['mcps'])} MCPs)")

    skills_compat = build_compat_skills(all_types.get("skills", []), bundles)
    skills_compat_path = compat_dir / "skills-catalog.json"
    skills_compat_path.write_text(
        json.dumps(skills_compat, indent=2, ensure_ascii=False) + "\n"
    )
    print(
        f"  Wrote compat/skills-catalog.json ({len(skills_compat['skills'])} skills, {len(bundles)} bundles)"
    )

    print(f"\nDone! {total_entries} entries across {len(RESOURCE_TYPES)} types.")


if __name__ == "__main__":
    main()
