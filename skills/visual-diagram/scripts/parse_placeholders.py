#!/usr/bin/env python3
"""
Parse SVG blueprint for {{img:description}} placeholders.

Usage:
    uv run python parse_placeholders.py <path-to-blueprint.svg>

Output:
    Writes <blueprint-name>_placeholders.json next to the SVG file.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def parse_placeholders(svg_path: str) -> list[dict]:
    """Extract {{img:...}} placeholders from an SVG file.

    Finds placeholders in <text> elements and maps them to the nearest
    parent <rect> for position/size context.
    """
    svg_path = Path(svg_path)
    if not svg_path.exists():
        print(f"Error: {svg_path} not found", file=sys.stderr)
        sys.exit(1)

    tree = ET.parse(svg_path)
    root = tree.getroot()

    # Handle SVG namespace
    ns = {"svg": "http://www.w3.org/2000/svg"}
    if root.tag.startswith("{"):
        ns_uri = root.tag.split("}")[0] + "}"
        ns = {"svg": ns_uri.strip("{}")}

    placeholders = []
    placeholder_pattern = re.compile(r"\{\{img:(.+?)\}\}")

    # Search all text elements for placeholder patterns
    for text_elem in root.iter():
        tag = text_elem.tag.split("}")[-1] if "}" in text_elem.tag else text_elem.tag
        if tag != "text":
            continue

        # Get text content (may be in element or tspan children)
        text_content = text_elem.text or ""
        for child in text_elem:
            child_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if child_tag == "tspan":
                text_content += child.text or ""

        match = placeholder_pattern.search(text_content)
        if not match:
            continue

        description = match.group(1).strip()
        placeholder_id = re.sub(r"[^a-z0-9]+", "_", description.lower()).strip("_")

        # Get position from the text element
        x = float(text_elem.get("x", "0"))
        y = float(text_elem.get("y", "0"))

        # Try to find the parent rect (placeholder container)
        # Walk all rects and find the one that contains this text position
        container = _find_containing_rect(root, x, y, ns)

        placeholders.append(
            {
                "id": placeholder_id,
                "description": description,
                "search_query": description,
                "text_x": x,
                "text_y": y,
                "container": container,
            }
        )

    return placeholders


def _find_containing_rect(
    root: ET.Element, x: float, y: float, ns: dict
) -> dict | None:
    """Find the rectangle that contains the given (x, y) point."""
    best = None
    best_area = float("inf")

    for elem in root.iter():
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag != "rect":
            continue

        rx = float(elem.get("x", "0"))
        ry = float(elem.get("y", "0"))
        rw = float(elem.get("width", "0"))
        rh = float(elem.get("height", "0"))

        if rx <= x <= rx + rw and ry <= y <= ry + rh:
            area = rw * rh
            if area < best_area:
                best_area = area
                best = {"x": rx, "y": ry, "width": rw, "height": rh}

    return best


def main():
    if len(sys.argv) < 2:
        print("Usage: uv run python parse_placeholders.py <svg-file>", file=sys.stderr)
        sys.exit(1)

    svg_path = Path(sys.argv[1])
    placeholders = parse_placeholders(str(svg_path))

    output_path = svg_path.with_name(f"{svg_path.stem}_placeholders.json")
    with open(output_path, "w") as f:
        json.dump(placeholders, f, indent=2)

    print(f"Found {len(placeholders)} placeholder(s)")
    for p in placeholders:
        print(f"  - {p['id']}: \"{p['description']}\"")
    print(f"Written to: {output_path}")


if __name__ == "__main__":
    main()
