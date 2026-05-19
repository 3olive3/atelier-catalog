# Color Palette — Excalidraw Diagrams

> **This file is a quick reference.** The full diagram design system is at:
> `atelier-catalog/references/diagram-design-system.md`
>
> The master brand design system (app colors, typography, surfaces) is at:
> `docs.3olive3.com/atelier/design-system/`

---

## Shape Colors (Semantic)

Colors encode meaning, not decoration. Each semantic purpose has a fill/stroke pair.

| Semantic Purpose | Fill | Stroke | Usage |
|------------------|------|--------|-------|
| Core Pillar (Primary) | `#009688` | `#00695C` | Atelier Core components (Studio, Backend, CLI, Companion) |
| Core Pillar Light | `#4DB6AC` | `#00796B` | Core modules, secondary Core elements |
| Butler Pillar | `#FF8F00` | `#E65100` | Butler components (Gateway, Console, MCP Servers) |
| Butler Pillar Light | `#FFB74D` | `#FF8F00` | Butler modules, secondary Butler elements |
| Bridge Pillar | `#7B1FA2` | `#4A148C` | Bridge components (Gateway, Bot, CRON, Content Factory) |
| Bridge Pillar Light | `#BA68C8` | `#7B1FA2` | Bridge modules, secondary Bridge elements |
| Auth / Identity | `#1565C0` | `#0D47A1` | OAuth providers, JWT, auth layer |
| Cross-Cutting | `#37474F` | `#263238` | Shared infrastructure, databases, distribution |
| Start/Trigger | `#fed7aa` | `#c2410c` | Entry points, user actions |
| End/Success | `#a7f3d0` | `#047857` | Completion, success states |
| Warning/Reset | `#fee2e2` | `#dc2626` | Warnings, destructive actions |
| Decision | `#fef3c7` | `#b45309` | Decision points, conditionals |
| AI/LLM | `#CE93D8` | `#6A1B9A` | Ollama, cloud LLM providers |
| Inactive/Disabled | `#CFD8DC` | `#546E7A` | Disabled features (use dashed stroke) |
| Error | `#fecaca` | `#b91c1c` | Error states |

**Rule**: Always pair a darker stroke with a lighter fill for contrast.

---

## Text Colors (Hierarchy)

| Level | Color | Use For |
|-------|-------|---------|
| Title | `#c9a227` | Major section headings, platform title (Atelier gold) |
| Subtitle / Core | `#00695C` | Core pillar labels, subheadings |
| Subtitle / Butler | `#E65100` | Butler pillar labels |
| Subtitle / Bridge | `#4A148C` | Bridge pillar labels |
| Body/Detail | `#546E7A` | Descriptions, annotations, metadata |
| On light fills | `#263238` | Text inside light-colored shapes |
| On dark fills | `#ffffff` | Text inside dark-colored shapes |

---

## Evidence Artifact Colors

| Artifact | Background | Text Color |
|----------|-----------|------------|
| Code snippet | `#263238` | Syntax-colored (language-appropriate) |
| JSON/data example | `#263238` | `#4DB6AC` (teal green) |

---

## Default Stroke & Line Colors

| Element | Color |
|---------|-------|
| Arrows (Core context) | `#00695C` |
| Arrows (Butler context) | `#E65100` |
| Arrows (Bridge context) | `#4A148C` |
| Arrows (cross-pillar) | `#1565C0` |
| Structural lines (dividers, trees, timelines) | `#546E7A` |
| Marker dots (fill + stroke) | `#c9a227` (Atelier gold) |

---

## Background

| Property | Value |
|----------|-------|
| Canvas background | `#ffffff` |
