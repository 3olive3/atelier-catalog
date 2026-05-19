#!/usr/bin/env python3
"""
Generate a diagram image from an SVG blueprint using Nano Banana 2 (Gemini).

Usage:
    uv run python generate.py <blueprint.svg> [--images <mapping.json>] [--style handdrawn] [--output <output.png>]

Styles: handdrawn, polished, blueprint, watercolor, minimal

Requires GEMINI_API_KEY environment variable or ~/.config/visual-diagram/config.json.
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types


# ─── Style Presets ────────────────────────────────────────────────────────────

STYLE_PROMPTS = {
    "handdrawn": (
        "Transform this SVG diagram layout into a beautiful hand-drawn illustration. "
        "Use a sketchy, organic line style with slight imperfections that look naturally drawn. "
        "Warm paper-like texture background. Colors should be soft and inviting. "
        "Text must be perfectly legible — use a clean handwriting-style font. "
        "The overall feel should be like a talented designer's whiteboard sketch "
        "that's been polished to presentation quality. Keep all text readable."
    ),
    "polished": (
        "Transform this SVG diagram layout into a clean, modern digital illustration. "
        "Crisp edges, flat design aesthetic, professional infographic quality. "
        "Use subtle shadows and gradients for depth. Colors should be vibrant but harmonious. "
        "Text must be perfectly legible with a modern sans-serif look. "
        "The result should look like a professional infographic from a top design agency."
    ),
    "blueprint": (
        "Transform this SVG diagram layout into a technical blueprint-style illustration. "
        "Dark navy blue background with white and light blue line art. "
        "Engineering diagram aesthetic with grid lines visible in the background. "
        "Text in a monospace or technical font style. Precise, technical feel. "
        "Like a high-end architectural or engineering blueprint."
    ),
    "watercolor": (
        "Transform this SVG diagram layout into a soft watercolor illustration. "
        "Organic shapes with color bleeding at the edges. Gentle, artistic feel. "
        "Light watercolor paper texture visible. Colors flow naturally between elements. "
        "Text should remain crisp and legible against the soft background. "
        "The overall feel should be artistic yet informative."
    ),
    "minimal": (
        "Transform this SVG diagram layout into ultra-minimal line art. "
        "Black lines on pure white background. Single consistent line weight throughout. "
        "Maximum whitespace. No fills, no gradients, no shadows — just clean outlines. "
        "Text in a thin, elegant sans-serif style. "
        "The result should feel like a high-end minimalist design poster."
    ),
}

# ─── Model Configuration ─────────────────────────────────────────────────────

# Nano Banana 2 model hierarchy (newest to oldest):
#   gemini-3.1-flash-image-preview  — Latest NB2, fastest
#   gemini-3-pro-image-preview      — Highest quality, 2x cost
#   gemini-2.5-flash-image          — Stable, recommended default
#
# NOTE: Image generation requires billing enabled on Google AI Studio.
# Free tier quota for image models is 0. Enable billing (free tier still applies).
DEFAULT_MODEL = "gemini-2.5-flash-image"


def get_gemini_key() -> str:
    """Get Gemini API key from env or config file."""
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key

    config_path = Path.home() / ".config" / "visual-diagram" / "config.json"
    if config_path.exists():
        config = json.loads(config_path.read_text())
        key = config.get("gemini_api_key")
        if key:
            return key

    print("Error: GEMINI_API_KEY not set and no config file found.", file=sys.stderr)
    print(
        f"Set the env var or create {config_path} with: "
        '{"gemini_api_key": "AIza..."}',
        file=sys.stderr,
    )
    sys.exit(1)


def load_image_as_base64(path: str) -> tuple[str, str]:
    """Load an image file and return (base64_data, mime_type)."""
    path = Path(path)
    ext = path.suffix.lower()
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".gif": "image/gif",
    }
    mime_type = mime_map.get(ext, "image/png")
    data = base64.b64encode(path.read_bytes()).decode("utf-8")
    return data, mime_type


def build_prompt(
    svg_content: str,
    style: str,
    image_mapping: dict | None = None,
) -> list:
    """Build the generation prompt parts for the Gemini API."""
    style_instruction = STYLE_PROMPTS.get(style, STYLE_PROMPTS["handdrawn"])

    parts = []

    # Main instruction
    instruction = (
        f"{style_instruction}\n\n"
        "IMPORTANT RULES:\n"
        "1. Preserve the EXACT layout structure from the SVG — same positions, sizes, and relationships\n"
        "2. ALL text in the SVG must appear in the output, fully legible and correctly positioned\n"
        "3. Arrows and connections must point in the same directions as the SVG\n"
        "4. The output should be a single cohesive illustration, not a rendering of raw SVG\n"
        "5. Do NOT add elements that aren't in the SVG blueprint\n"
        "6. Maintain the visual hierarchy — larger elements should remain prominent\n\n"
        "Here is the SVG blueprint that defines the layout:\n\n"
        f"```svg\n{svg_content}\n```"
    )
    parts.append(types.Part.from_text(text=instruction))

    # Add reference images if available
    if image_mapping:
        ref_descriptions = []
        for pid, info in image_mapping.items():
            img_path = info.get("path")
            desc = info.get("description", pid)
            if img_path and Path(img_path).exists():
                data, mime = load_image_as_base64(img_path)
                parts.append(
                    types.Part.from_bytes(
                        data=base64.b64decode(data),
                        mime_type=mime,
                    )
                )
                ref_descriptions.append(
                    f"The image above is a reference for the '{desc}' placeholder. "
                    f"Incorporate its visual style or content into the corresponding area of the diagram."
                )
                parts.append(types.Part.from_text(text=ref_descriptions[-1]))

    return parts


def generate_diagram(
    svg_path: str,
    style: str = "handdrawn",
    image_mapping_path: str | None = None,
    output_path: str | None = None,
    model_id: str = DEFAULT_MODEL,
) -> str:
    """Generate a diagram image from an SVG blueprint.

    Returns the path to the generated PNG.
    """
    svg_path = Path(svg_path)
    if not svg_path.exists():
        print(f"Error: {svg_path} not found", file=sys.stderr)
        sys.exit(1)

    svg_content = svg_path.read_text()

    # Load image mapping if provided
    image_mapping = None
    if image_mapping_path:
        mapping_path = Path(image_mapping_path)
        if mapping_path.exists():
            image_mapping = json.loads(mapping_path.read_text())

    # Determine output path
    if not output_path:
        output_path = str(svg_path.with_suffix(".png"))

    # Build prompt
    parts = build_prompt(svg_content, style, image_mapping)

    # Initialize Gemini client
    api_key = get_gemini_key()
    client = genai.Client(api_key=api_key)

    print(f"Generating with model: {model_id}")
    print(f"Style: {style}")
    print(f"SVG: {svg_path}")
    if image_mapping:
        found = sum(1 for v in image_mapping.values() if v.get("path"))
        print(f"Reference images: {found}")
    print("Calling Gemini API...")

    # Generate
    response = client.models.generate_content(
        model=model_id,
        contents=types.Content(
            role="user",
            parts=parts,
        ),
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    # Extract image from response
    if not response.candidates:
        print("Error: No candidates in response", file=sys.stderr)
        sys.exit(1)

    image_saved = False
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            # Save the generated image
            image_data = part.inline_data.data
            Path(output_path).write_bytes(image_data)
            image_saved = True
            print(f"Generated: {output_path}")
            break
        elif part.text:
            # The model sometimes returns text feedback
            print(f"Model note: {part.text[:200]}")

    if not image_saved:
        print("Error: No image was generated. The model returned only text.", file=sys.stderr)
        print("Try simplifying the SVG or adjusting the style prompt.", file=sys.stderr)
        sys.exit(1)

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Generate diagram from SVG blueprint using Nano Banana 2"
    )
    parser.add_argument("svg", help="Path to SVG blueprint file")
    parser.add_argument(
        "--images", "-i", help="Path to image mapping JSON (from search_images.py)"
    )
    parser.add_argument(
        "--style",
        "-s",
        default="handdrawn",
        choices=list(STYLE_PROMPTS.keys()),
        help="Generation style (default: handdrawn)",
    )
    parser.add_argument("--output", "-o", help="Output PNG path")
    parser.add_argument(
        "--model",
        "-m",
        default=DEFAULT_MODEL,
        help=f"Gemini model ID (default: {DEFAULT_MODEL})",
    )

    args = parser.parse_args()

    generate_diagram(
        svg_path=args.svg,
        style=args.style,
        image_mapping_path=args.images,
        output_path=args.output,
        model_id=args.model,
    )


if __name__ == "__main__":
    main()
