#!/usr/bin/env python3
"""
Generate a polished illustration-style diagram from an SVG blueprint.

Convenience wrapper around generate.py with style=polished.

Usage:
    uv run python generate_illustration.py <blueprint.svg> [--images <mapping.json>] [--output <output.png>]
"""

import sys

from generate import generate_diagram

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run python generate_illustration.py <svg-file> [--images <mapping.json>] [--output <output.png>]", file=sys.stderr)
        sys.exit(1)

    svg_path = sys.argv[1]
    images = None
    output = None

    args = sys.argv[2:]
    i = 0
    while i < len(args):
        if args[i] in ("--images", "-i") and i + 1 < len(args):
            images = args[i + 1]
            i += 2
        elif args[i] in ("--output", "-o") and i + 1 < len(args):
            output = args[i + 1]
            i += 2
        else:
            i += 1

    generate_diagram(
        svg_path=svg_path,
        style="polished",
        image_mapping_path=images,
        output_path=output,
    )
