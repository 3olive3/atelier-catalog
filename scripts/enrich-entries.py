#!/usr/bin/env python3
"""
One-time script to enrich MCP and skill entries with distribution fields
from the existing atelier-mcps and atelier-skills catalogs.

This ensures the unified catalog has all fields the Atelier app expects.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
MCPS_CATALOG = Path.home() / "Developer/atelier-mcps/catalog.json"
SKILLS_CATALOG = Path.home() / "Developer/atelier-skills/catalog.json"


def enrich_mcps():
    """Enrich MCP entries with fields from atelier-mcps catalog."""
    print("Enriching MCP entries...")

    # Load existing atelier-mcps catalog as reference
    ref_data = json.loads(MCPS_CATALOG.read_text())
    ref_by_id = {mcp["id"]: mcp for mcp in ref_data["mcps"]}

    mcps_dir = REPO_ROOT / "mcps"
    for json_file in sorted(mcps_dir.glob("*.json")):
        entry = json.loads(json_file.read_text())
        catalog_id = entry["catalogID"]

        # Find matching reference entry
        ref = ref_by_id.get(catalog_id)
        if not ref:
            # Try alternate IDs (ipam->netbox, observability->prometheus)
            alt_map = {"ipam": "netbox", "observability": "prometheus"}
            ref = ref_by_id.get(alt_map.get(catalog_id, ""))

        if ref:
            # Enrich with distribution fields from atelier-mcps
            entry["runtime"] = ref.get("runtime", "node")
            entry["tags"] = ref.get("tags", [])
            entry["downloadURL"] = ref.get("downloadURL", "")
            entry["size"] = ref.get("size", "unknown")
            entry["checksum"] = ref.get("checksum", "")
            # Update description if richer in reference
            if len(ref.get("description", "")) > len(entry.get("description", "")):
                entry["description"] = ref["description"]
            # Update toolCount from reference
            entry["toolCount"] = ref.get("toolCount", entry.get("toolCount", 0))
            # Update version from reference
            entry["version"] = ref.get("version", entry.get("version", "1.0.0"))
            # Update name from reference if different
            if ref.get("name") and ref["name"] != entry["name"]:
                entry["name"] = ref["name"]
            print(f"  {catalog_id}: enriched from atelier-mcps")
        else:
            # Add defaults for missing MCPs
            entry.setdefault("runtime", "node")
            entry.setdefault("tags", [])
            entry.setdefault(
                "downloadURL",
                f"https://github.com/3olive3/atelier-mcps/releases/download/v{entry['version']}/{catalog_id}-{entry['version']}.tar.gz",
            )
            entry.setdefault("size", "unknown")
            entry.setdefault("checksum", "")
            print(f"  {catalog_id}: no reference found, added defaults")

        json_file.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + "\n")

    print()


def enrich_skills():
    """Enrich skill entries with fields from atelier-skills catalog."""
    print("Enriching skill entries...")

    # Load existing atelier-skills catalog as reference
    ref_data = json.loads(SKILLS_CATALOG.read_text())
    ref_by_id = {skill["id"]: skill for skill in ref_data["skills"]}

    skills_dir = REPO_ROOT / "skills"
    for json_file in sorted(skills_dir.glob("*.json")):
        entry = json.loads(json_file.read_text())
        catalog_id = entry["catalogID"]

        ref = ref_by_id.get(catalog_id)
        if ref:
            # Enrich with distribution fields from atelier-skills
            entry["author"] = ref.get("author", entry.get("author", "Unknown"))
            entry["license"] = ref.get("license", "MIT")
            entry["sourceURL"] = ref.get("sourceURL", "")
            entry["tags"] = ref.get("tags", entry.get("tags", []))
            entry["category"] = ref.get("category", entry.get("category", "general"))
            entry["downloadURL"] = ref.get("downloadURL", "")
            # Use richer description if available
            if len(ref.get("description", "")) > len(entry.get("description", "")):
                entry["description"] = ref["description"]
            print(f"  {catalog_id}: enriched from atelier-skills")
        else:
            # Add defaults
            entry.setdefault("author", "Unknown")
            entry.setdefault("license", "MIT")
            entry.setdefault("sourceURL", "")
            entry.setdefault("tags", [])
            entry.setdefault("category", "general")
            entry.setdefault(
                "downloadURL",
                f"https://raw.githubusercontent.com/3olive3/atelier-skills/main/skills/{catalog_id}/SKILL.md",
            )
            print(f"  {catalog_id}: no reference found, added defaults")

        json_file.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + "\n")

    print()


def extract_bundles():
    """Extract bundles from atelier-skills catalog into bundles.json."""
    print("Extracting bundles...")
    ref_data = json.loads(SKILLS_CATALOG.read_text())
    bundles = ref_data.get("bundles", [])

    bundles_path = REPO_ROOT / "bundles.json"
    bundles_path.write_text(json.dumps(bundles, indent=2, ensure_ascii=False) + "\n")
    print(f"  Wrote {len(bundles)} bundles to bundles.json\n")


if __name__ == "__main__":
    enrich_mcps()
    enrich_skills()
    extract_bundles()
    print("Done! Now run: python3 scripts/build-catalog.py")
