---
name: visual-diagram
description: "Generate beautiful, illustration-quality diagrams using SVG blueprints + Nano Banana 2. Hand-drawn + digital aesthetic for presentations, docs, and explainers."
risk: low
source: casa-lima
date_added: "2026-03-16"
---

# Visual Diagram — Illustration-Quality Diagram Generator

Generate beautiful diagrams that look hand-drawn yet polished, using an **SVG blueprint pipeline** powered by Google's **Nano Banana 2** image model.

**Setup:** See `README.md` for API key setup and dependency installation.

**When to use this skill vs Excalidraw:**

| This skill (visual-diagram) | Excalidraw skill |
|------------------------------|------------------|
| Presentations, YouTube, blog posts | Technical architecture docs |
| Beautiful hand-drawn + digital look | Clean structured wireframes |
| Illustration-quality output | Schematic-quality output |
| Costs ~$0 (Gemini free tier) | Free (local Playwright render) |
| Needs API keys (Gemini + Tavily) | No external deps |

---

## Core Pipeline (8 Steps)

```
1. Understand → 2. SVG Blueprint → 3. Critique → 4. Fix
    → 5. Parse Placeholders → 6. Search Images → 7. Generate → 8. Review
```

### Step 1: Understand the Request

Before generating anything, deeply understand what the user wants to visualize:
- What is the core concept or system?
- Who is the audience? (developers, executives, general public)
- What style? (hand-drawn, polished, whiteboard, infographic)
- What size? (slide 1920x1080, square 1024x1024, portrait 1080x1920)

### Step 2: Generate SVG Blueprint

Create an SVG file that serves as a **structural layout blueprint** — not the final image. The SVG defines:
- **Exact positions and sizes** of all boxes, shapes, and text regions
- **Arrow/connection paths** between elements
- **Text content** at correct positions
- **Image placeholders** using the `{{img:description}}` syntax
- **Color zones** (background regions, section groupings)

The SVG is "image as code" — precise, editable, and machine-readable.

**SVG Blueprint Rules:**
1. Use a viewBox matching the target resolution (e.g., `viewBox="0 0 1920 1080"`)
2. Keep shapes simple — rectangles, rounded rects, circles, lines, arrows
3. Use the Atelier color palette from `references/color-palette.md`
4. Place `{{img:google logo}}` or `{{img:network topology icon}}` where reference images should go
5. Include ALL text content — the model reads text from the SVG
6. Use clear visual hierarchy — larger shapes for important concepts
7. Leave breathing room (don't cram) — whitespace is part of the design

**SVG Blueprint Template:**
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <!-- Background -->
  <rect width="1920" height="1080" fill="#fafafa"/>

  <!-- Title -->
  <text x="960" y="80" text-anchor="middle" font-size="48" font-weight="bold"
        fill="#263238" font-family="sans-serif">How the System Works</text>

  <!-- Section: Input -->
  <rect x="100" y="200" width="400" height="300" rx="20" fill="#E8F5E9" stroke="#2E7D32" stroke-width="2"/>
  <text x="300" y="260" text-anchor="middle" font-size="28" font-weight="bold" fill="#1B5E20">Input</text>
  <text x="300" y="310" text-anchor="middle" font-size="18" fill="#546E7A">User sends a request</text>

  <!-- Image placeholder -->
  <rect x="200" y="340" width="200" height="120" rx="10" fill="#E0E0E0" stroke="#9E9E9E"/>
  <text x="300" y="410" text-anchor="middle" font-size="14" fill="#757575">{{img:chat interface icon}}</text>

  <!-- Arrow: Input → Processing -->
  <line x1="500" y1="350" x2="700" y2="350" stroke="#546E7A" stroke-width="3"
        marker-end="url(#arrowhead)"/>

  <!-- Arrowhead marker definition -->
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#546E7A"/>
    </marker>
  </defs>
</svg>
```

### Step 3: Critique the SVG (Self-Review)

Before proceeding, review the SVG as a sub-task. Check for:

**Layout issues:**
- [ ] Are any boxes overlapping?
- [ ] Is text readable (font size >= 14 for body, >= 24 for titles)?
- [ ] Do arrows point to the correct targets?
- [ ] Is there sufficient whitespace between elements?
- [ ] Is the composition balanced (not lopsided)?

**Content issues:**
- [ ] Does every concept have a visual representation?
- [ ] Are relationships shown with arrows/connections?
- [ ] Is the visual hierarchy clear (most important = largest)?
- [ ] Would the structure alone communicate the concept without text?

**Placeholder issues:**
- [ ] Are `{{img:...}}` descriptions specific enough to find good images?
- [ ] Are placeholder boxes large enough to fit an image (min 100x100)?
- [ ] Would the diagram work even if image search returns nothing?

Fix everything you find before moving to Step 5.

### Step 4: Fix the SVG

Apply all fixes from the critique. Then re-read the SVG one more time for any remaining issues. The SVG must be solid before image search begins.

### Step 5: Parse Placeholders

Run the placeholder parser to extract all `{{img:description}}` markers:

```bash
cd <skill-dir>/scripts && uv run python parse_placeholders.py <path-to-blueprint.svg>
```

This outputs a JSON file listing each placeholder with its description and position.

### Step 6: Search for Reference Images

Run the image search script to find reference images for each placeholder:

```bash
cd <skill-dir>/scripts && uv run python search_images.py <path-to-placeholders.json> --output-dir <output-dir>
```

This uses the **Tavily API** to search the web for each placeholder description, downloads the best match, and saves it locally. The script outputs a mapping file: `placeholder_id → local_image_path`.

If Tavily returns no good results for a placeholder, the script marks it as "no image" — the final generation will use the text description instead.

### Step 7: Generate with Nano Banana 2

Run the generation script:

```bash
cd <skill-dir>/scripts && uv run python generate.py <path-to-blueprint.svg> \
  --images <path-to-image-mapping.json> \
  --style handdrawn \
  --output <path-to-output.png>
```

**Generation styles:**

| Style Flag | Nano Banana 2 Prompt Modifier | Best For |
|------------|-------------------------------|----------|
| `handdrawn` | "Hand-drawn illustration style, sketchy lines, warm paper texture, like a talented designer's whiteboard" | Presentations, explainers |
| `polished` | "Clean digital illustration, crisp edges, modern flat design, professional infographic" | Blog posts, documentation |
| `blueprint` | "Technical blueprint style, dark blue background, white line art, engineering diagram feel" | Technical deep-dives |
| `watercolor` | "Soft watercolor illustration, organic shapes, gentle color blending, artistic" | Creative content |
| `minimal` | "Ultra-minimal line art, black on white, single weight lines, maximum whitespace" | Elegant slides |

The script:
1. Reads the SVG blueprint
2. Injects reference images at placeholder positions (as base64 in the prompt)
3. Constructs the generation prompt: SVG structure + style + reference images
4. Calls the Gemini API with Nano Banana 2 model
5. Saves the output PNG

### Step 8: Review the Output

**MANDATORY**: View the generated PNG using the Read tool and evaluate:

1. **Structure preserved?** — Does the output match the SVG blueprint's layout?
2. **Text readable?** — Can you read all labels and descriptions?
3. **Style consistent?** — Does the whole image feel cohesive?
4. **Placeholders resolved?** — Are reference images or their concepts visible?
5. **Aesthetic quality?** — Would you put this in a presentation?

If issues are found:
- **Layout wrong**: Fix the SVG blueprint, re-generate
- **Text garbled**: Simplify text in SVG, use fewer words, re-generate
- **Style inconsistent**: Adjust the style prompt, re-generate
- **Missing elements**: Check SVG has all elements, re-generate

Typically takes 1-2 iterations to get a good result.

---

## Customization

### Color Palette

The SVG blueprint uses colors from `references/color-palette.md` — the same Atelier brand palette used by the Excalidraw skill. Edit that file to change the brand colors used in blueprints.

### Style Presets

Edit `references/style-presets.md` to modify or add Nano Banana 2 prompt modifiers for each style.

---

## Size Presets

| Use Case | viewBox | Output Size |
|----------|---------|-------------|
| Presentation slide | `0 0 1920 1080` | 1920x1080 |
| YouTube thumbnail | `0 0 1280 720` | 1280x720 |
| Square social post | `0 0 1024 1024` | 1024x1024 |
| Portrait (mobile) | `0 0 1080 1920` | 1080x1920 |
| Blog hero image | `0 0 1200 675` | 1200x675 |
| Wide banner | `0 0 2560 720` | 2560x720 |

---

## Complex Diagram Strategy

For diagrams with many elements (>15 shapes), build the SVG in sections:

1. **Skeleton first**: Place all major boxes and connections. No detail text.
2. **Add detail**: Fill in text content, sub-elements within boxes.
3. **Add placeholders**: Insert `{{img:...}}` markers where images help.
4. **Critique and fix**: Full review pass.
5. **Generate**: Run the pipeline.

This avoids the SVG becoming unwieldy in a single pass.

---

## Script Reference

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `parse_placeholders.py` | Extract `{{img:...}}` from SVG | `.svg` file | `.json` placeholder list |
| `search_images.py` | Tavily image search + download | `.json` placeholders | Image files + mapping `.json` |
| `generate.py` | Nano Banana 2 diagram generation | `.svg` + images + style | `.png` output |
| `generate_illustration.py` | Illustration-focused variant | `.svg` + images | `.png` (illustration style) |
| `generate_handdrawn.py` | Hand-drawn slide variant | `.svg` + images | `.png` (hand-drawn style) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key for Nano Banana 2 |
| `TAVILY_API_KEY` | Yes | Tavily API key for image search |

Keys are stored in Vaultwarden. The scripts read them from environment or from `~/.config/visual-diagram/config.json`.

---

## Quality Checklist

### Blueprint Quality
1. [ ] SVG viewBox matches target resolution
2. [ ] All concepts have visual representation
3. [ ] Relationships shown with arrows/lines
4. [ ] Text is readable (font sizes appropriate)
5. [ ] No overlapping elements
6. [ ] Balanced composition with whitespace
7. [ ] Placeholders have specific descriptions

### Generation Quality
8. [ ] Output matches blueprint structure
9. [ ] Text is legible in output
10. [ ] Style is consistent throughout
11. [ ] Reference images are incorporated naturally
12. [ ] Image looks professional and presentation-ready
13. [ ] No artifacts, distortion, or garbled elements
