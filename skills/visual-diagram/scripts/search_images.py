#!/usr/bin/env python3
"""
Search for reference images using Tavily API based on parsed placeholders.

Usage:
    uv run python search_images.py <placeholders.json> --output-dir <dir>

Requires TAVILY_API_KEY environment variable or ~/.config/visual-diagram/config.json.
"""

import json
import os
import sys
from pathlib import Path

import httpx


def get_tavily_key() -> str:
    """Get Tavily API key from env or config file."""
    key = os.environ.get("TAVILY_API_KEY")
    if key:
        return key

    config_path = Path.home() / ".config" / "visual-diagram" / "config.json"
    if config_path.exists():
        config = json.loads(config_path.read_text())
        key = config.get("tavily_api_key")
        if key:
            return key

    print("Error: TAVILY_API_KEY not set and no config file found.", file=sys.stderr)
    print(
        f"Set the env var or create {config_path} with: "
        '{"tavily_api_key": "tvly-..."}',
        file=sys.stderr,
    )
    sys.exit(1)


def search_image(query: str, api_key: str) -> dict | None:
    """Search Tavily for an image matching the query.

    Returns the best image result with url and description, or None.
    """
    try:
        response = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": f"{query} icon logo image",
                "search_depth": "basic",
                "include_images": True,
                "max_results": 3,
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

        images = data.get("images", [])
        if images:
            # Return first image result
            img = images[0] if isinstance(images[0], str) else images[0].get("url", "")
            return {"url": img, "source": "tavily"}

        return None
    except Exception as e:
        print(f"  Warning: Tavily search failed for '{query}': {e}", file=sys.stderr)
        return None


def download_image(url: str, output_path: Path) -> bool:
    """Download an image from URL to local path."""
    try:
        response = httpx.get(url, timeout=15.0, follow_redirects=True)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "image" not in content_type and not url.endswith(
            (".png", ".jpg", ".jpeg", ".svg", ".webp")
        ):
            print(
                f"  Warning: URL did not return an image (content-type: {content_type})",
                file=sys.stderr,
            )
            return False

        output_path.write_bytes(response.content)
        return True
    except Exception as e:
        print(f"  Warning: Download failed for {url}: {e}", file=sys.stderr)
        return False


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: uv run python search_images.py <placeholders.json> "
            "[--output-dir <dir>]",
            file=sys.stderr,
        )
        sys.exit(1)

    placeholders_path = Path(sys.argv[1])
    if not placeholders_path.exists():
        print(f"Error: {placeholders_path} not found", file=sys.stderr)
        sys.exit(1)

    # Parse output dir
    output_dir = placeholders_path.parent / "images"
    if "--output-dir" in sys.argv:
        idx = sys.argv.index("--output-dir")
        if idx + 1 < len(sys.argv):
            output_dir = Path(sys.argv[idx + 1])

    output_dir.mkdir(parents=True, exist_ok=True)

    api_key = get_tavily_key()
    placeholders = json.loads(placeholders_path.read_text())

    mapping = {}
    for p in placeholders:
        pid = p["id"]
        query = p["search_query"]
        print(f"Searching: {pid} → \"{query}\"")

        result = search_image(query, api_key)
        if result and result["url"]:
            # Determine extension from URL
            url = result["url"]
            ext = ".png"
            for candidate in [".jpg", ".jpeg", ".png", ".svg", ".webp"]:
                if candidate in url.lower():
                    ext = candidate
                    break

            img_path = output_dir / f"{pid}{ext}"
            if download_image(url, img_path):
                mapping[pid] = {
                    "path": str(img_path),
                    "url": url,
                    "description": p["description"],
                }
                print(f"  Downloaded → {img_path}")
            else:
                mapping[pid] = {
                    "path": None,
                    "url": url,
                    "description": p["description"],
                    "error": "download_failed",
                }
                print(f"  Download failed, will use text description")
        else:
            mapping[pid] = {
                "path": None,
                "description": p["description"],
                "error": "no_results",
            }
            print(f"  No image found, will use text description")

    # Write mapping
    mapping_path = placeholders_path.with_name(
        placeholders_path.stem.replace("_placeholders", "") + "_images.json"
    )
    with open(mapping_path, "w") as f:
        json.dump(mapping, f, indent=2)

    found = sum(1 for v in mapping.values() if v.get("path"))
    print(f"\nResults: {found}/{len(mapping)} images found")
    print(f"Mapping written to: {mapping_path}")


if __name__ == "__main__":
    main()
