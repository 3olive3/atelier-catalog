---
name: notebooklm-content
description: "Guide for using NotebookLM MCP to generate content — source ingestion, script generation, podcast audio, and content synthesis."
risk: low
source: casa-lima
date_added: "2026-03-16"
---

# NotebookLM Content Generation

Guide for agents operating within the Content Factory pipeline to use the NotebookLM MCP for source ingestion, script generation, and audio content creation.

## When to Use NotebookLM

NotebookLM is the content synthesis engine. Use it when you need to:

- **Ingest sources** — feed code files, documentation, READMEs, and design docs into a notebook for analysis
- **Generate scripts** — produce structured tutorial scripts, social media briefs, or presentation outlines from ingested sources
- **Create audio overviews** — generate conversational podcast episodes where two AI hosts discuss the material
- **Synthesize knowledge** — combine multiple sources into coherent narratives

Do NOT use NotebookLM for:
- Visual generation (use `visual-generation` MCP)
- Video assembly (use `n8n` workflows)
- Code execution or testing
- Real-time data queries

## Tool Reference

### notebooklm_create_notebook

Create a new notebook for a content generation session.

```json
{
  "title": "Content Factory — Sentinel Topology View",
  "description": "Sources and content for the Sentinel topology feature"
}
```

Returns: `{ "notebookID": "nb_abc123" }`

Always create a dedicated notebook per content run. Do not reuse notebooks across features.

### notebooklm_add_source

Add a source document to the notebook. Call once per source file.

```json
{
  "notebookID": "nb_abc123",
  "source": {
    "type": "text",
    "title": "TopologyView.swift — main view implementation",
    "content": "<file contents here>"
  }
}
```

Supported source types:
- `text` — plain text, code, markdown
- `url` — web page URL (NotebookLM will fetch and parse)
- `pdf` — base64-encoded PDF content

### notebooklm_generate_content

Generate structured content from the notebook's sources.

```json
{
  "notebookID": "nb_abc123",
  "format": "explainer",
  "options": {
    "target_duration": "5-10 min",
    "tone": "educational",
    "audience": "developers"
  }
}
```

Returns: `{ "contentID": "cnt_xyz", "content": "<generated script>" }`

### notebooklm_generate_overview

Generate an audio overview (podcast-style conversation between two hosts).

```json
{
  "notebookID": "nb_abc123",
  "options": {
    "style": "conversational",
    "duration": "5-8 min"
  }
}
```

Returns: `{ "audioID": "aud_xyz", "audioURL": "<url>", "duration": 420, "transcript": "<text>" }`

## Content Format Specifications

### Explainer (5-10 min tutorial)

Purpose: Long-form YouTube-style tutorial video script.

Structure:
1. **Hook** (15-30s) — state the problem or question that draws viewers in
2. **Context** (30-60s) — brief background, why this matters
3. **Walkthrough** (3-7 min) — step-by-step explanation with code highlights and visual cues
4. **Demo** (1-2 min) — show it working, highlight key interactions
5. **Recap** (30s) — summarize key takeaways

Script format:
```
[SCENE 1 — Hook]
NARRATOR: "Ever tried to visualize how 20 agents coordinate in real time?"
VISUAL: Dashboard overview shot
DURATION: 20s

[SCENE 2 — Context]
NARRATOR: "The Sentinel topology view solves this by..."
VISUAL: Animated topology diagram
DURATION: 45s
```

Each scene must include: narrator text, visual description, and target duration. Visual descriptions become prompts for the visual generation stage.

### Brief (30-60 sec social content)

Purpose: TikTok/Reels/Shorts — fast-paced, high-energy, single concept.

Structure:
1. **Hook** (3-5s) — attention-grabbing opening statement or question
2. **Show** (15-30s) — demonstrate the feature with quick cuts
3. **Payoff** (5-10s) — reveal the result, call to action

Script format:
```
[HOOK — 4s]
TEXT ON SCREEN: "This dashboard sees EVERYTHING"
VISUAL: Zoom into topology view

[SHOW — 25s]
NARRATOR: (fast-paced) "Every agent, every connection, every heartbeat..."
VISUAL: Quick cuts between topology nodes, connection lines, status indicators
```

Keep language punchy. No jargon. Assume the viewer has zero context.

### Audio Overview (conversational podcast)

Purpose: A 5-8 minute podcast episode where two AI hosts discuss the feature in a natural, conversational style.

This is generated directly by `notebooklm_generate_overview` — you do not write a script for this format. Instead, ensure the notebook has rich, well-organized sources so the generated conversation is accurate and engaging.

Best practices for audio overview sources:
- Include a high-level summary document as the first source
- Add technical details as separate sources (code, architecture docs)
- Include a "what's interesting about this" note to guide the conversation toward compelling angles

### Slides (presentation deck)

Purpose: Key points, diagrams, and talking points for presentations.

Structure:
1. **Title slide** — feature name, one-line description
2. **Problem slide** — what challenge does this solve?
3. **Solution slides** (3-5) — one concept per slide, with diagram descriptions
4. **Demo slide** — screenshot or screen recording reference
5. **Summary slide** — key takeaways

Output format: structured markdown with slide separators and speaker notes.

## Best Practices

### Source Ingestion Order

Add sources in this order for best results:

1. **README / overview doc** — gives NotebookLM the big picture first
2. **Architecture / design doc** — how things fit together
3. **Key source files** — the most important implementation files (3-5 max)
4. **Test files** — show expected behavior and edge cases
5. **CHANGELOG or PR description** — what changed and why

Do NOT add every file in the project. Select the 5-10 most relevant sources. Too many sources dilute the content quality.

### Source Quality Tips

- **Trim boilerplate** — remove license headers, import blocks, and generated code before adding as sources
- **Add context headers** — prefix each source with a brief description of what it is and why it matters
- **Group related code** — if two small files work together, combine them into one source with a separator
- **Include comments** — well-commented code produces better content than raw implementations

### Generation Tips

- **Explainer**: Set `audience: "developers"` for technical content, `audience: "general"` for feature showcases
- **Brief**: Always set `tone: "energetic"` and `target_duration: "30-60s"`
- **Audio overview**: Add a "conversation guide" source that lists 3-5 interesting angles to discuss
- **Slides**: Set `tone: "professional"` and keep to 8-10 slides max

## Example Workflow

Full explainer generation for a new feature:

```
1. Create notebook
   notebooklm_create_notebook({ title: "Content Factory — Sentinel Topology" })
   → nb_abc123

2. Add sources (5 files)
   notebooklm_add_source({ notebookID: "nb_abc123", source: { type: "text", title: "README", content: "..." } })
   notebooklm_add_source({ notebookID: "nb_abc123", source: { type: "text", title: "TopologyView.swift", content: "..." } })
   notebooklm_add_source({ notebookID: "nb_abc123", source: { type: "text", title: "TopologyAssembler.swift", content: "..." } })
   notebooklm_add_source({ notebookID: "nb_abc123", source: { type: "text", title: "Architecture Doc", content: "..." } })
   notebooklm_add_source({ notebookID: "nb_abc123", source: { type: "text", title: "PR Description", content: "..." } })

3. Generate explainer script
   notebooklm_generate_content({
     notebookID: "nb_abc123",
     format: "explainer",
     options: { target_duration: "5-10 min", tone: "educational", audience: "developers" }
   })
   → Structured script with scenes, narrator text, visual cues

4. Generate audio overview
   notebooklm_generate_overview({
     notebookID: "nb_abc123",
     options: { style: "conversational", duration: "5-8 min" }
   })
   → Audio file URL + transcript
```

## Error Handling

- **Notebook creation fails**: Retry once. If it fails again, report the error and skip content generation stages.
- **Source too large**: Split into multiple sources. Individual sources should be under 50,000 characters.
- **Generation timeout**: NotebookLM generation can take 2-5 minutes. Set a 10-minute timeout. If it times out, retry once.
- **Low quality output**: If the generated content is too shallow, add more specific sources (architecture docs, design rationale) and regenerate.
- **Audio generation fails**: Audio overview is the most resource-intensive format. If it fails, retry with `duration: "3-5 min"` for a shorter episode.
