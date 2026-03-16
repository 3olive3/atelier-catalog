---
name: incidents-methodology
description: "Incident management methodology — severity levels, post-mortem format, post-incident protocol, and troubleshooting workflow."
---

# Incidents — Methodology & Post-Incident Protocol

A structured approach to incident management: documenting, learning from, and preventing infrastructure and application failures.

## When to Use This Skill

- When investigating or troubleshooting an active issue
- When documenting a new incident after resolution
- When establishing incident management practices for a team
- When reviewing past incidents for pattern matching

**Self-trigger rule**: If during any troubleshooting session you identify and resolve a significant failure — regardless of whether this skill was explicitly loaded — execute the Post-Incident Protocol before ending the session.

---

## Incident Format

Each incident should be documented as a standalone file. Use this format:

```markdown
# [Title]

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Severity** | Critical / High / Medium / Low |
| **Duration** | ~X hours |
| **Systems affected** | List of affected systems |
| **Root cause** | One-line summary |
| **Resolution** | One-line summary |

## Timeline

| Time | Event |
|------|-------|
| T+0 | First symptom observed |
| T+Xmin | Investigation step |
| T+Xmin | Resolution applied |

## Symptoms
What was observed that indicated a problem.

## Diagnosis
How the root cause was identified.

## Root Cause
Detailed explanation of what actually caused the issue.

## Resolution
Step-by-step what was done to fix it.

## Lessons Learned
What changes were made or should be made to prevent recurrence.

## Prevention
- [x] Completed prevention items
- [ ] Open prevention items
```

## Severity Levels

| Level | Definition | Examples |
|-------|-----------|----------|
| **P1 — Critical** | Multiple services down, user-facing impact, immediate action required | DNS failure, firewall down, server crash |
| **P2 — High** | Single critical service down or degraded, moderate user impact | Primary app down, database outage, backup failure |
| **P3 — Medium** | Non-critical service affected, workaround available | One container crashed, slow performance |
| **P4 — Low** | Minor issue, no user impact | Stale config found, cosmetic bug |

---

## Post-Incident Protocol

After resolving any incident, execute these steps **before ending the session**:

### Step 1: Write the Full Post-Mortem

Create an incident document following the format above. Include:
- Metadata table (date, severity, duration, systems, root cause summary, resolution summary)
- Timeline with timestamps
- Symptoms, Diagnosis, Root Cause, Resolution sections
- Lessons Learned with actionable items
- Prevention checklist (completed and open items)

**Naming convention**: `YYYY-MM-<2-3-word-slug>.md` (e.g., `2026-02-dns-record-deletion.md`)

### Step 2: Update the Incidents Index

Maintain an index file listing all incidents:

```markdown
| Date | Incident | Severity | Duration | Systems |
|------|----------|----------|----------|---------|
| YYYY-MM-DD | [Title](YYYY-MM-slug.md) | P1 | ~2 hours | DNS, Proxy |
```

### Step 3: Create a Quick-Lookup Summary

For each incident, maintain a condensed summary that agents can quickly scan for pattern matching:

```markdown
### INC-XXX: Title (Month Year)

**Severity**: PX — Level | **Systems**: affected systems
**Symptoms**: What was observed.
**Root Cause**: What actually caused it.
**Resolution**: What fixed it.
**Key Lesson**: The most important takeaway.
**Full post-mortem**: path to full document
```

### Step 4: Cross-Reference

If the incident revealed issues that affect other areas, update relevant documentation:
- Configuration issues — update deployment docs
- Networking issues — update network docs
- Security issues — update security procedures

---

## Troubleshooting Workflow — Mandatory Agent Behavior

**Rule: Before any troubleshooting, debugging, or alert response, agents MUST check the incident history for known solutions.** Do not skip this step — past incidents contain verified root causes and resolutions that can save hours of investigation.

### Step 1: Consult Incident History (MANDATORY)

Search for matching symptoms across these locations, in order:

1. **Incident index** — `~/Developer/home-docs/docs/incidents/index.md` (quick-lookup summaries)
2. **Full post-mortems** — `~/Developer/home-docs/docs/incidents/` (detailed RCA and resolution steps)
3. **Runbooks** — `~/Developer/home-docs/docs/runbooks/` (pre-written recovery procedures)

Search by: error message, affected service name, symptom description, system component.

### Step 2: Apply or Escalate

- **Match found** — follow the documented resolution. If the same fix applies, execute it. If the context differs, adapt the resolution and note the variation.
- **Partial match** — a similar incident exists but the symptoms differ. Use the prior RCA as a starting hypothesis and investigate from there.
- **No match** — investigate systematically: gather evidence, form hypotheses, test each. Use the `systematic-debugging` skill if needed.

### Step 3: Document (always)

After resolution — whether it was a known issue or a new one:

- **Known recurrence** — update the existing incident with a recurrence note, timestamp, and any new details
- **New incident** — execute the full Post-Incident Protocol (Steps 1-4 above)

This creates the feedback loop: every resolution feeds back into the incident history, making future troubleshooting faster.

## Best Practices

- **Blameless post-mortems** — focus on systems and processes, not individuals
- **Timely documentation** — write the post-mortem while details are fresh
- **Actionable prevention items** — each lesson should have a concrete follow-up
- **Regular reviews** — periodically review open prevention items from past incidents
- **Pattern recognition** — look for recurring themes across incidents (e.g., same system, same type of failure)
