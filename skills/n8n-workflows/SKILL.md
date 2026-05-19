---
name: n8n-workflows
description: "Guide for triggering and monitoring n8n workflows — video assembly, publishing, and multi-step external service orchestration."
risk: low
source: casa-lima
date_added: "2026-03-16"
---

# n8n Workflow Orchestration

Guide for agents operating within the Content Factory pipeline (and other automation contexts) to trigger, monitor, and handle n8n workflow executions.

## When to Use n8n

n8n is the external service orchestrator. Use it when you need to:

- **Assemble videos** — combine audio, visuals, and overlays into final video files
- **Publish content** — upload to YouTube, TikTok, podcast platforms
- **Chain external services** — any multi-step process involving third-party APIs (email, Slack, Google Drive, etc.)
- **Run scheduled automations** — recurring tasks that involve external service calls

Do NOT use n8n for:
- Content generation (use NotebookLM)
- Image generation (use visual-generation MCP)
- Home automation (use Butler MCPs)
- Code operations (use Atelier agents directly)

## Tool Reference

### n8n_list_workflows

List all available workflows or filter by tag/name.

```json
{
  "active": true,
  "tags": "content-factory"
}
```

Returns a list of workflows with IDs, names, and active status. Use this to discover available workflows and their IDs before triggering.

### n8n_execute_workflow

Trigger a workflow execution with input parameters.

```json
{
  "workflowId": "wf_video_assembly",
  "data": {
    "feature": "Sentinel topology view",
    "script": "<narrator script text>",
    "audioURL": "https://storage.example.com/audio/aud_xyz.mp3",
    "visuals": [
      { "scene": 1, "imageURL": "https://storage.example.com/img/scene1.png", "duration": 20 },
      { "scene": 2, "imageURL": "https://storage.example.com/img/scene2.png", "duration": 45 }
    ],
    "outputFormat": "explainer",
    "resolution": "1920x1080"
  }
}
```

Returns: `{ "executionId": "exec_123", "status": "running" }`

Always validate that required input parameters are present before triggering. Missing parameters cause silent failures in n8n.

### n8n_get_execution

Check the status of a running or completed execution.

```json
{
  "executionId": "exec_123"
}
```

Returns:

```json
{
  "executionId": "exec_123",
  "workflowId": "wf_video_assembly",
  "status": "success",
  "startedAt": "2026-03-16T10:15:00Z",
  "finishedAt": "2026-03-16T10:18:42Z",
  "data": {
    "outputURL": "https://storage.example.com/video/sentinel-topology-explainer.mp4",
    "duration": 342,
    "fileSize": "245MB"
  }
}
```

Possible statuses: `running`, `success`, `error`, `waiting`.

### n8n_list_executions

List recent executions for a workflow.

```json
{
  "workflowId": "wf_video_assembly",
  "limit": 10,
  "status": "error"
}
```

Use with `status: "error"` to find failed executions that may need retry.

## Content Factory Workflows

These are the n8n workflows used by the Content Factory pipeline:

### video-assembly (Long-form Explainer)

**Workflow ID:** Look up via `n8n_list_workflows({ tags: "content-factory" })`

**Purpose:** Combine narrator audio, scene visuals, text overlays, and transitions into a YouTube-ready video.

**Input parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `feature` | string | yes | Feature name (used in title card) |
| `script` | string | yes | Full narrator script with scene markers |
| `audioURL` | string | yes | URL to narrator audio file |
| `visuals` | array | yes | Array of `{ scene, imageURL, duration }` objects |
| `outputFormat` | string | yes | `"explainer"` |
| `resolution` | string | no | Default `"1920x1080"` |
| `transitions` | string | no | `"crossfade"` (default), `"cut"`, `"slide"` |
| `bgMusic` | string | no | `"none"`, `"subtle"` (default), `"upbeat"` |

**Output:** `{ "outputURL": "<video URL>", "duration": <seconds>, "fileSize": "<size>" }`

### brief-assembly (Short-form Social)

**Purpose:** Combine visuals and text overlays into a vertical TikTok/Reels video.

**Input parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `feature` | string | yes | Feature name |
| `script` | string | yes | Brief script with timing markers |
| `visuals` | array | yes | Array of `{ scene, imageURL, duration }` objects |
| `outputFormat` | string | yes | `"brief"` |
| `resolution` | string | no | Default `"1080x1920"` (vertical) |
| `textOverlays` | array | no | `[{ text, startTime, endTime, position }]` |
| `bgMusic` | string | no | `"upbeat"` (default), `"none"`, `"chill"` |

**Output:** `{ "outputURL": "<video URL>", "duration": <seconds>, "fileSize": "<size>" }`

### publish-all

**Purpose:** Upload finished content to target platforms.

**Input parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `feature` | string | yes | Feature name (used in titles/descriptions) |
| `explainerURL` | string | no | URL to explainer video for YouTube upload |
| `briefURL` | string | no | URL to brief video for TikTok/Reels upload |
| `audioURL` | string | no | URL to podcast audio for podcast platform upload |
| `slidesURL` | string | no | URL to slides PDF for Google Drive upload |
| `description` | string | yes | Content description (used across platforms) |
| `tags` | array | no | Tags for discoverability |

**Output:** `{ "published": [{ "platform": "youtube", "url": "..." }, ...] }`

## Workflow Execution Patterns

### Trigger and Poll

The standard pattern for running n8n workflows:

```
1. Trigger the workflow
   n8n_execute_workflow({ workflowId: "wf_video_assembly", data: { ... } })
   → exec_123

2. Poll for completion (every 30 seconds, max 15 minutes)
   n8n_get_execution({ executionId: "exec_123" })
   → status: "running" ... keep polling
   → status: "success" ... extract output
   → status: "error" ... handle failure

3. Extract result
   result.data.outputURL → pass to next pipeline stage
```

Set a maximum poll duration based on the workflow:
- **video-assembly**: max 15 minutes
- **brief-assembly**: max 10 minutes
- **publish-all**: max 5 minutes

### Chained Workflows

When one workflow's output feeds another:

```
1. Run video-assembly → get outputURL
2. Run brief-assembly → get outputURL
3. Run publish-all with both URLs
```

Always wait for each workflow to complete before starting the dependent one. Never assume a workflow succeeded without checking the execution status.

## Parameter Passing

### Structuring Input Data

n8n workflows expect a flat JSON object in the `data` field. Follow these rules:

- **Strings**: pass directly — `"feature": "Sentinel topology"`
- **Arrays**: pass as JSON arrays — `"visuals": [{ ... }, { ... }]`
- **URLs**: must be absolute, accessible URLs — n8n nodes fetch resources by URL
- **File content**: never pass raw file content. Upload to storage first, then pass the URL.
- **Nested objects**: flatten when possible. n8n expressions work better with flat structures.

### Common Mistakes

- Passing relative file paths instead of URLs (n8n runs on UNRAID, not locally)
- Missing required parameters (n8n fails silently on some nodes)
- Passing audio without matching visuals (video assembly needs both)
- Using local storage paths instead of accessible URLs

## Error Handling

### Execution Failures

When `n8n_get_execution` returns `status: "error"`:

1. **Check the error message** in `data.error` or `data.lastNode` to identify which n8n node failed
2. **Common node failures:**
   - HTTP Request node: target service down, auth expired, rate limited
   - FFmpeg node: invalid input file, codec error, out of disk space
   - Upload node: platform API error, file too large, auth expired
3. **Retry strategy:**
   - Transient errors (timeout, rate limit): retry once after 60 seconds
   - Input errors (bad URL, missing param): fix the input and retry
   - Auth errors: report to user — credentials may need refresh
   - Persistent errors: report to user with the error message and failed node name

### Workflow Not Found

If `n8n_execute_workflow` returns a "workflow not found" error:
1. Run `n8n_list_workflows({ tags: "content-factory" })` to check available workflows
2. The workflow may be inactive — check the `active` field
3. Report the missing workflow to the user

### n8n Unreachable

If all n8n calls fail with connection errors:
1. Report: "n8n is temporarily unreachable. Video assembly and publishing stages cannot proceed."
2. The content generation stages (scripts, audio, visuals) can still run independently
3. Suggest retrying the video/publish stages later when n8n is back

## Monitoring Tips

- Use `n8n_list_executions({ status: "error" })` to find recent failures across all workflows
- Check execution duration against expected times — unusually long runs may be stuck
- If an execution is in `"waiting"` status for more than 5 minutes, it may be waiting for a webhook that never arrived — investigate the upstream trigger
