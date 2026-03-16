---
name: visual-generation
description: "Guide for using visual generation MCP — illustrations, thumbnails, scene images for videos, batch generation, and style selection."
risk: low
source: casa-lima
date_added: "2026-03-16"
---

# Visual Generation

Guide for agents to use the visual generation MCP to create illustrations, thumbnails, scene images for video content, and other visual assets within the Content Factory pipeline and beyond.

## When to Use Visual Generation

Use the visual generation MCP when you need to:

- **Create scene images** for video content (explainer tutorials, social briefs)
- **Generate thumbnails** for YouTube, blog posts, presentations
- **Produce illustrations** for documentation, slides, or social media
- **Batch-generate** multiple visuals from a script's scene descriptions
- **Upscale** existing images for higher resolution output

Do NOT use visual generation for:
- Screenshots of actual software (use screen capture tools)
- Diagrams or flowcharts (use Mermaid or draw.io, then optionally stylize)
- Text-heavy images (AI image generators struggle with text)
- Photo editing or manipulation

## Tool Reference

### visual_gen_generate

Generate a single image from a text prompt.

```json
{
  "prompt": "A clean whiteboard-style illustration showing interconnected nodes in a network topology, with a central coordinator node highlighted in blue, surrounded by 6 smaller agent nodes connected by glowing lines. Minimalist style, white background, technical diagram feel.",
  "model": "flux/dev",
  "width": 1920,
  "height": 1080,
  "style": "whiteboard",
  "negative_prompt": "blurry, text, watermark, low quality, distorted"
}
```

Returns: `{ "imageID": "img_abc123", "imageURL": "<url>", "width": 1920, "height": 1080 }`

### visual_gen_batch_generate

Generate multiple images in a single call. Use for scene-based video content where you need many visuals at once.

```json
{
  "prompts": [
    {
      "id": "scene_1",
      "prompt": "Developer looking at a complex dashboard with agent topology view...",
      "width": 1920,
      "height": 1080
    },
    {
      "id": "scene_2",
      "prompt": "Close-up of a topology node showing health status indicators...",
      "width": 1920,
      "height": 1080
    },
    {
      "id": "scene_3",
      "prompt": "Split screen comparing old terminal output with new visual dashboard...",
      "width": 1920,
      "height": 1080
    }
  ],
  "model": "flux/dev",
  "style": "whiteboard"
}
```

Returns: `{ "images": [{ "id": "scene_1", "imageURL": "...", ... }, ...] }`

Batch generation is more efficient than individual calls — use it whenever you have 3+ images to generate.

### visual_gen_upscale

Upscale an existing image to higher resolution.

```json
{
  "imageURL": "https://storage.example.com/img/scene1.png",
  "scale": 2,
  "model": "real-esrgan"
}
```

Returns: `{ "imageURL": "<upscaled url>", "width": 3840, "height": 2160 }`

Use for thumbnails that need to look sharp at high resolution, or when base generation was done at a smaller size for speed.

## Model Selection Guide

Choose the model based on your quality/speed tradeoff:

| Model | Speed | Quality | Best For |
|-------|-------|---------|----------|
| `flux/schnell` | Fast (5-10s) | Good | Drafts, iteration, testing prompts |
| `flux/dev` | Medium (15-30s) | High | Production scene images, illustrations |
| `flux-pro` | Slow (30-60s) | Best | Hero images, thumbnails, marketing |

**Default recommendation:** Use `flux/dev` for Content Factory scenes. Use `flux/schnell` when iterating on prompts. Use `flux-pro` only for featured thumbnails or hero images.

## Style Guide

Apply a consistent style across all visuals in a content run. Set the `style` parameter to one of:

### whiteboard
Clean, technical illustration style. White or light background, clean lines, minimal color palette (blue, gray, black accents). Best for: technical tutorials, architecture explainers, developer-focused content.

Prompt keywords: *clean lines, whiteboard illustration, technical diagram, minimalist, white background, blueprint feel*

### watercolor
Soft, artistic style with organic shapes and color bleeding. Best for: creative content, artistic features, non-technical overviews.

Prompt keywords: *watercolor painting, soft edges, organic shapes, artistic, hand-painted feel, gentle color palette*

### retro-print
Bold colors, halftone dots, vintage poster aesthetic. Best for: social media content (TikTok, Reels), eye-catching thumbnails, engagement-focused visuals.

Prompt keywords: *retro print, halftone dots, bold colors, vintage poster, screen print, pop art influence*

### anime
Vibrant, dynamic anime/manga-inspired style. Best for: engaging content targeting younger audiences, energetic demos, feature showcases.

Prompt keywords: *anime style, vibrant colors, dynamic composition, manga-inspired, clean cel-shading, expressive*

### photorealistic
Realistic renders that look like photographs or 3D renders. Best for: product demos, mockups, professional presentations.

Prompt keywords: *photorealistic, 8k, detailed, professional photography, studio lighting, sharp focus*

**Style consistency rule:** Pick one style at the start of a content run and use it for ALL visuals in that run. Mixing styles within a single video or content package looks jarring.

## Prompt Engineering for Images

### Structure Your Prompts

Follow this template for consistent results:

```
[Subject description] + [Style/mood] + [Composition] + [Technical details]
```

Example:
```
A network topology dashboard showing 8 interconnected agent nodes with status indicators,
in a clean whiteboard illustration style,
centered composition with the coordinator node prominent in the middle,
wide angle, 1920x1080, professional, clean lines
```

### Be Specific

Bad: "A dashboard"
Good: "A dark-themed monitoring dashboard showing 4 panels: CPU usage graph (green line), memory bar chart (blue), network throughput (orange), and disk usage (pie chart). Modern flat design, professional."

### Include Context

Bad: "Agents working together"
Good: "Five AI agent icons arranged in a star pattern, each labeled with a role (Scout, Builder, Reviewer, Deployer, Coordinator), connected by glowing data flow lines. Whiteboard style on white background."

### Negative Prompts

Always include a negative prompt to avoid common artifacts:

```
"negative_prompt": "blurry, text, watermark, low quality, distorted, deformed, extra limbs, bad anatomy"
```

For technical illustrations, add: `"cluttered, messy, hand-drawn sketch, rough"`
For clean styles, add: `"noisy, grainy, artifacts, compression"`

## Batch Generation Patterns

### Extract Scenes from Script

When generating visuals for a video script, extract scene descriptions systematically:

```
Input: Explainer script with [SCENE] markers

1. Parse each [SCENE] block
2. Extract the VISUAL description line
3. Combine with the style setting and resolution
4. Build batch_generate payload

Script:
  [SCENE 1 — Hook]
  VISUAL: Dashboard overview with topology view highlighted

  [SCENE 2 — Context]
  VISUAL: Side-by-side comparison of terminal vs visual topology

Output prompts:
  scene_1: "Dashboard overview with topology view highlighted, whiteboard style..."
  scene_2: "Side-by-side comparison of terminal output and visual topology dashboard..."
```

### Scene ID Convention

Use sequential scene IDs that match the script: `scene_1`, `scene_2`, etc. This makes it easy to match generated images back to script scenes during video assembly.

### Parallel Generation

Batch generate fires all prompts in parallel. For a 10-scene explainer:
- Individual calls: ~150-300 seconds (sequential)
- Batch call: ~30-60 seconds (parallel)

Always prefer batch for 3+ images.

## Resolution Guide

Choose resolution based on the output format:

| Use Case | Resolution | Aspect Ratio |
|----------|-----------|--------------|
| YouTube explainer | 1920x1080 | 16:9 |
| TikTok/Reels brief | 1080x1920 | 9:16 (vertical) |
| Square social post | 1024x1024 | 1:1 |
| YouTube thumbnail | 1280x720 | 16:9 |
| Presentation slide | 1920x1080 | 16:9 |
| Blog illustration | 1200x675 | 16:9 |
| Mobile story | 1080x1920 | 9:16 |

**Performance tip:** For drafts and iteration, generate at half resolution (960x540) and upscale the final versions. This cuts generation time significantly.

## Content Factory Integration

Within the Content Factory pipeline, visual generation happens at **Stage 6 (Visuals)** after scripts are complete. The expected flow:

1. Receive the script output from Stage 5 (Scripts & Voice)
2. Parse scene descriptions from the script
3. Determine style from pipeline parameters (`visual_style` field)
4. Build batch generation payload with correct resolution for the target format
5. Execute batch generation
6. Map generated image URLs back to scene IDs
7. Pass scene-to-image mapping to Stage 7 (Video Assembly via n8n)

The output format determines resolution:
- `explainer` → 1920x1080
- `brief` → 1080x1920
- `slides` → 1920x1080

## Error Handling

- **Generation timeout**: Individual images timeout at 120 seconds. Batch jobs timeout at 300 seconds. Retry once on timeout.
- **Model unavailable**: Fall back from `flux-pro` → `flux/dev` → `flux/schnell`. Always prefer a lower-quality result over no result.
- **Invalid prompt**: If the model returns an error about the prompt, simplify it — remove complex descriptions, shorten to under 200 words.
- **NSFW filter**: If a prompt is rejected, rephrase to avoid potentially ambiguous terms. Technical content should not trigger filters, but some edge cases exist.
- **Batch partial failure**: If some images in a batch succeed and others fail, keep the successful ones and retry only the failed prompts individually.
- **Upscale failure**: Usually caused by the source image being too large or corrupted. Verify the source URL is accessible and the image is valid.
