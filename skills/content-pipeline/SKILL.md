---
name: content-pipeline
description: "End-to-end Content Factory orchestration — 8-step pipeline, DAG structure, inter-step data flow, format selection, monitoring, and quality assurance."
risk: low
source: casa-lima
date_added: "2026-03-16"
---

# Content Pipeline Orchestration

End-to-end guide for orchestrating the Content Factory pipeline — the automated system that takes a feature from code to published, multi-format content (YouTube tutorials, TikTok briefs, podcast episodes, and presentation slides).

## The 8-Step Pipeline

```
Plan → Build → Test → Document → Scripts & Voice → Visuals → Video Assembly → Publish
 (1)    (2)    (3)      (4)          (5)             (6)         (7)           (8)

                  ┌─ Test (3) ─────┐
Plan (1) → Build (2)               ├→ Scripts (5) → Visuals (6) → Video (7) → Publish (8)
                  └─ Document (4) ─┘
```

Steps 3 and 4 run in parallel after Build completes. All other steps are sequential. This DAG structure saves 2-5 minutes per run compared to fully sequential execution.

### Stage 1: Plan

**Purpose:** Analyze the feature request and produce a content plan.

**Input:**
- Feature name (string)
- Content formats requested (array)
- Optional: existing code repository path, PR number, design doc URL

**Output:**
- Content plan document with:
  - Feature summary (2-3 sentences)
  - Target audience
  - Key concepts to cover
  - Proposed scene breakdown (for video formats)
  - Estimated complexity (simple/medium/complex)

**Agent action:** Analyze the feature. If code exists, read key files. If a PR is referenced, read the diff. Produce a structured plan that downstream stages consume.

**Duration:** 30-90 seconds

### Stage 2: Build

**Purpose:** Write or verify the code implementation for the feature.

**Input:**
- Content plan from Stage 1
- Repository context

**Output:**
- Working code implementation
- File manifest (which files were created/modified)
- Build artifacts (compiled binaries, if applicable)

**Skipped when:** `skip_code: true` — the feature already has a working implementation and we are generating content for existing code.

**Duration:** 1-5 minutes (varies significantly by feature complexity)

### Stage 3: Test (parallel with Stage 4)

**Purpose:** Verify the code works correctly.

**Input:**
- Code from Stage 2
- Test expectations from content plan

**Output:**
- Test results (pass/fail count)
- Test coverage summary
- Any test failures with details

**Skipped when:** `skip_code: true`

**Duration:** 1-3 minutes

### Stage 4: Document (parallel with Stage 3)

**Purpose:** Generate documentation for the feature.

**Input:**
- Code from Stage 2
- Content plan from Stage 1

**Output:**
- Feature documentation (markdown)
- API reference (if applicable)
- Usage examples

**Skipped when:** `skip_build: true` and documentation already exists

**Duration:** 1-2 minutes

### Stage 5: Scripts & Voice

**Purpose:** Generate content scripts and audio from the documentation and code.

**Input:**
- Content plan from Stage 1
- Documentation from Stage 4
- Code from Stage 2 (for code-heavy tutorials)
- Requested content formats

**Tools:** NotebookLM MCP (`notebooklm-content` skill)

**Output per format:**
- **explainer**: Structured script with scene markers, narrator text, visual cues, and timing
- **brief**: Short-form script with hook/show/payoff structure
- **audio_overview**: Podcast audio file (URL) + transcript
- **slides**: Structured slide deck with speaker notes

**Process:**
1. Create a NotebookLM notebook for this run
2. Add sources: documentation, key code files, content plan
3. Generate content for each requested format
4. For audio_overview: also generate the audio overview file

**Duration:** 2-5 minutes

### Stage 6: Visuals

**Purpose:** Generate all visual assets needed for video and presentation content.

**Input:**
- Scripts from Stage 5 (scene descriptions become image prompts)
- Visual style parameter (from pipeline trigger)
- Target resolutions (derived from content formats)

**Tools:** Visual generation MCP (`visual-generation` skill)

**Output:**
- Scene images mapped to scene IDs (e.g., `scene_1 → img_url_1`)
- Thumbnail images (for YouTube, social)
- Slide illustrations (for presentation format)

**Process:**
1. Parse scene descriptions from each script
2. Build prompts using the selected visual style
3. Batch-generate all images
4. Map results back to scene IDs
5. Generate thumbnails separately (hero image quality)

**Skipped when:** `visual_only: false` is not set and no video/slides formats are requested

**Duration:** 3-8 minutes

### Stage 7: Video Assembly

**Purpose:** Combine audio, visuals, and overlays into final video files.

**Input:**
- Scripts from Stage 5 (timing information)
- Audio files from Stage 5 (narrator voice, podcast audio)
- Visual assets from Stage 6 (scene images, thumbnails)
- Content format specifications

**Tools:** n8n workflows (`n8n-workflows` skill)

**Output:**
- Assembled video files (one per video format: explainer MP4, brief MP4)
- Video metadata (duration, resolution, file size)

**Process:**
1. For explainer format: trigger `video-assembly` n8n workflow with script + audio + visuals
2. For brief format: trigger `brief-assembly` n8n workflow with script + visuals + overlays
3. Poll for completion
4. Collect output URLs

**Skipped when:** Only audio_overview or slides formats are requested (no video needed)

**Duration:** 3-8 minutes

### Stage 8: Publish

**Purpose:** Upload finished content to target platforms.

**Input:**
- Video files from Stage 7
- Audio files from Stage 5
- Slides from Stage 5
- Thumbnails from Stage 6
- Feature metadata (name, description, tags)

**Tools:** n8n workflows (`n8n-workflows` skill)

**Output:**
- Published URLs for each platform
- Publication confirmation

**Process:**
1. Trigger `publish-all` n8n workflow with all content URLs and metadata
2. Poll for completion
3. Collect published URLs

**Duration:** 1-3 minutes

## Inter-Step Data Flow

Each step produces output that the next step consumes. Here is the complete data dependency map:

```
Stage 1 (Plan)
  ↓ content_plan
Stage 2 (Build)
  ↓ code_files, build_artifacts
  ├→ Stage 3 (Test)     → test_results
  └→ Stage 4 (Document) → documentation
       ↓ content_plan + documentation + code_files
Stage 5 (Scripts)
  ↓ scripts (per format), audio_files
Stage 6 (Visuals)
  ↓ scene_images, thumbnails
Stage 7 (Video Assembly)
  ↓ video_files
Stage 8 (Publish)
  → published_urls
```

**Critical data handoffs:**
- Stage 5 needs Stage 4's documentation AND Stage 2's code (for source ingestion into NotebookLM)
- Stage 6 needs Stage 5's scripts (scene descriptions become image prompts)
- Stage 7 needs BOTH Stage 5's audio AND Stage 6's visuals
- Stage 8 needs outputs from Stages 5 (audio), 6 (thumbnails), and 7 (videos)

## Content Formats

| Format | Output | Platform | Resolution | Duration |
|--------|--------|----------|------------|----------|
| `explainer` | MP4 video | YouTube | 1920x1080 | 5-10 min |
| `brief` | MP4 video | TikTok, Reels | 1080x1920 | 30-60 sec |
| `audio_overview` | MP3 audio | Podcast platforms | N/A | 5-8 min |
| `slides` | PDF/Markdown | Google Slides, presentations | 1920x1080 | 8-12 slides |

All formats can be generated in a single pipeline run. Specify which ones via the `content_formats` array in the trigger payload.

## How to Trigger

### Via Bridge (Telegram)

Use natural language through the `content-factory` Bridge skill:

```
"Build Sentinel topology and make a content package"
→ Full pipeline, all formats

"Create a tutorial video for the new auth flow"
→ Explainer only, skip_code=true

"Make a TikTok about agent worktrees"
→ Brief only
```

### Via API (Direct)

```
POST /api/v1/pipelines/content-factory/trigger
{
  "feature": "Sentinel topology view",
  "content_formats": ["explainer", "brief", "audio_overview", "slides"],
  "skip_code": false,
  "skip_build": false,
  "visual_only": false,
  "visual_style": "whiteboard"
}
```

## Monitoring

### Check Run Status

```
GET /api/v1/pipelines/runs/{runID}
```

Returns the run with all stage statuses, durations, and outputs.

### Stage Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for upstream stages to complete |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Failed with error |
| `skipped` | Skipped due to pipeline configuration (e.g., skip_code) |

### Watching for Failures

Monitor the run status. If a stage fails:

1. Check `errorMessage` on the failed stage
2. Determine if it is retryable (transient error) or requires intervention (input error)
3. Retry the failed stage if transient: `POST /api/v1/pipelines/runs/{runID}/stages/{stageName}/retry`
4. If the error requires input changes, the run must be re-triggered with corrected parameters

## Partial Pipelines

Not every run needs all 8 stages. Use these options to customize:

### skip_code (Stages 2+3 skipped)

Use when the feature already has working code. The pipeline starts at Stage 4 (Document) using existing code from the repository.

```json
{ "feature": "Sentinel topology", "skip_code": true, "content_formats": ["explainer"] }
```

Pipeline: Plan → Document → Scripts → Visuals → Video → Publish

### skip_build (Stage 2 skipped)

Use when code exists but tests should still run.

```json
{ "feature": "Sentinel topology", "skip_build": true }
```

Pipeline: Plan → Test → Document → Scripts → Visuals → Video → Publish

### visual_only (Stages 1-5, 7-8 skipped)

Use to regenerate visuals for an existing run. Requires a reference run ID to pull scripts from.

```json
{ "feature": "Sentinel topology", "visual_only": true, "reference_run": "run_abc123", "visual_style": "retro-print" }
```

Pipeline: Visuals only

### content_formats filter

Only generates the specified formats. Stages are skipped if no format needs them:
- No video formats → Stage 7 skipped
- No formats at all → error

```json
{ "feature": "Sentinel topology", "content_formats": ["audio_overview"] }
```

Pipeline: Plan → Build → Test → Document → Scripts (audio only) → Publish

## Quality Checklist

Before marking a pipeline run as complete, verify:

### Code Quality (Stages 2-3)
- [ ] Code compiles without warnings
- [ ] All tests pass (zero failures)
- [ ] No regressions in existing tests

### Documentation Quality (Stage 4)
- [ ] Documentation renders correctly in markdown
- [ ] Code examples are accurate and runnable
- [ ] No placeholder text or TODOs remain

### Script Quality (Stage 5)
- [ ] Script covers all key concepts from the content plan
- [ ] Timing markers are realistic (scenes sum to target duration)
- [ ] Narrator text reads naturally when spoken aloud
- [ ] Visual cue descriptions are specific enough for image generation

### Audio Quality (Stage 5)
- [ ] Audio overview sounds natural and conversational
- [ ] No awkward pauses or cut-offs
- [ ] Both hosts contribute meaningfully (not one-sided)
- [ ] Duration is within target range

### Visual Quality (Stage 6)
- [ ] All scene images match the selected style consistently
- [ ] No artifacts, distortions, or unwanted text in images
- [ ] Resolution matches the target format (16:9 for explainer, 9:16 for brief)
- [ ] Thumbnail is compelling and readable at small sizes

### Video Quality (Stage 7)
- [ ] Audio and visuals are synchronized
- [ ] Transitions are smooth (no jarring cuts)
- [ ] Total duration matches the target range
- [ ] Text overlays are readable
- [ ] Opening and closing cards are present

### Publishing Quality (Stage 8)
- [ ] Title and description are accurate
- [ ] Tags are relevant
- [ ] Thumbnail is set correctly
- [ ] Content is published to the correct platform

## Typical Run Durations

| Pipeline Configuration | Estimated Duration |
|----------------------|-------------------|
| Full pipeline, all formats | 25-40 min |
| Full pipeline, explainer only | 15-25 min |
| Full pipeline, brief only | 12-18 min |
| skip_code, all formats | 15-25 min |
| skip_code, explainer only | 10-18 min |
| visual_only | 5-10 min |
| audio_overview only | 8-12 min |
| slides only | 5-8 min |

Durations scale with feature complexity. Simple features (single view, few files) are at the low end. Complex features (multi-component, many files) are at the high end.

## Failure Recovery

### Stage Retry

Retry a single failed stage without re-running the entire pipeline:

```
POST /api/v1/pipelines/runs/{runID}/stages/{stageName}/retry
```

The retry uses the same inputs from upstream stages. Only the failed stage re-executes.

### Full Pipeline Retry

Re-trigger the entire pipeline with the same parameters:

```
POST /api/v1/pipelines/runs/{runID}/retry
```

This creates a new run ID. The old run remains in history for reference.

### Manual Intervention

Some failures require manual fixes:
- **Build failure**: Fix the code, commit, then retry from Stage 2
- **Test failure**: Fix the failing tests or code, then retry from Stage 3
- **Script quality issue**: Adjust NotebookLM sources or options, retry from Stage 5
- **Visual quality issue**: Adjust prompts or style, retry from Stage 6 (or use `visual_only`)
