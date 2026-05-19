# Atelier Diagram Design System

**The single source of truth for all diagram creation across the Atelier Platform.** Both the `excalidraw-diagram` and `visual-diagram` skills MUST follow this design system.

> **Parent design system:** `docs.3olive3.com/atelier/design-system/` — app colors, typography, surfaces, logo
> **Source of truth:** `AtelierCore/Sources/AtelierCore/Models/AtelierBrand.swift`
>
> **Skills that consume this:**
> - `excalidraw-diagram` — Excalidraw JSON diagrams (rendered via Python/HTML)
> - `visual-diagram` — SVG blueprints → Nano Banana 2 image generation

---

## 1. Brand Identity

Inherited from the [Atelier Design System](https://docs.3olive3.com/atelier/design-system/).

| Element | Value |
|---------|-------|
| **Platform name** | Atelier |
| **Tagline** | *Your AI workshop. Code is the craft.* |
| **Brand accent** | Gold `#c9a227` — used for titles, marker dots, accent lines |
| **Default background** | Light `#f9f9f9` (Excalidraw: `#ffffff`) |
| **Logo mark** | Gold rounded rectangle + diamond wireframe + center dot |

### App Accents vs Diagram Pillar Colors

The **app accent colors** (from the design system) and the **diagram pillar colors** are intentionally different. App accents are for UI theming. Diagram pillar colors are for visual distinction in architecture diagrams where all 3 pillars appear together.

| Pillar | App Accent | Diagram Color | Why different |
|--------|-----------|---------------|---------------|
| Core | Gold `#c9a227` | Teal `#009688` | Gold is reserved for brand, teal distinguishes Core in diagrams |
| Butler | Teal `#4ab1af` | Amber `#FF8F00` | Core already uses teal in diagrams, amber gives Butler visual weight |
| Bridge | — | Purple `#7B1FA2` | Consistent across both systems |

---

## 2. Color Palette

### 2.1 Pillar Colors (Primary)

Each pillar has a **primary** (components) and **light** (modules, sub-elements) variant.

| Pillar | Fill | Stroke | Light Fill | Light Stroke |
|--------|------|--------|------------|--------------|
| **Core** | `#009688` | `#00695C` | `#4DB6AC` | `#00796B` |
| **Butler** | `#FF8F00` | `#E65100` | `#FFB74D` | `#FF8F00` |
| **Bridge** | `#7B1FA2` | `#4A148C` | `#BA68C8` | `#7B1FA2` |

**Pillar background tints** (for containing regions):

| Pillar | Tint | Opacity |
|--------|------|---------|
| Core | `#E0F2F1` | 35-40% when overlaid |
| Butler | `#FFF3E0` | 35-40% when overlaid |
| Bridge | `#F3E5F5` | 35-40% when overlaid |

### 2.2 Semantic Colors

| Purpose | Fill | Stroke | When to use |
|---------|------|--------|-------------|
| Auth / Identity | `#1565C0` | `#0D47A1` | OAuth, JWT, auth layer |
| Cross-Cutting | `#37474F` | `#263238` | Shared infra, databases |
| Start / Trigger | `#fed7aa` | `#c2410c` | Entry points, user actions |
| End / Success | `#a7f3d0` | `#047857` | Completion states |
| Warning / Reset | `#fee2e2` | `#dc2626` | Destructive actions |
| Decision | `#fef3c7` | `#b45309` | Conditionals, branching |
| AI / LLM | `#CE93D8` | `#6A1B9A` | Ollama, LLM providers |
| Inactive | `#CFD8DC` | `#546E7A` | Disabled (use dashed stroke) |
| Error | `#fecaca` | `#b91c1c` | Error states |

**Rule:** Always pair a darker stroke with a lighter fill for contrast.

### 2.3 Text Colors

| Level | Color | Use for |
|-------|-------|---------|
| Title / Brand | `#c9a227` | Platform title, major headings |
| Subtitle / Core | `#00695C` | Core pillar labels |
| Subtitle / Butler | `#E65100` | Butler pillar labels |
| Subtitle / Bridge | `#4A148C` | Bridge pillar labels |
| Body / Detail | `#546E7A` | Descriptions, annotations |
| On light fills | `#263238` | Text inside light shapes |
| On dark fills | `#ffffff` | Text inside dark shapes |
| Primary (light bg) | `#111111` | Main body text |
| Muted | `#888888` | Secondary, subdued text |

### 2.4 Arrow & Line Colors

| Context | Color |
|---------|-------|
| Core arrows | `#00695C` |
| Butler arrows | `#E65100` |
| Bridge arrows | `#4A148C` |
| Cross-pillar | `#1565C0` (dashed) |
| Structural lines | `#546E7A` |
| Marker dots | `#c9a227` |

---

## 3. Typography

### 3.1 Hierarchy

| Level | Size (SVG) | Size (Excalidraw) | Weight | Font |
|-------|------------|-------------------|--------|------|
| Diagram title | 26-32px | 28px | Bold | sans-serif |
| Subtitle | 12-14px | 16px | Regular | sans-serif |
| Component header | 12-14px | 16px | Bold | sans-serif |
| Module label | 9-10px | 12px | Bold | sans-serif |
| Detail text | 9-11px | 12px | Regular | sans-serif |
| Annotation | 8-9px | 10px | Regular | sans-serif |

### 3.2 Text Rules for Nano Banana 2 (visual-diagram)

NB2 often garbles or drops text. Follow these rules to maximize readability:

1. **Keep labels SHORT** — 1-3 words per label (e.g., "Guardian" not "Guardian Pre-Query Evaluation Engine")
2. **No paragraphs inside shapes** — use single lines or 2-line max
3. **Minimum font size: 9px** — anything smaller will be illegible after generation
4. **Prefer bold for labels** — thin text at small sizes gets lost
5. **Avoid overlapping text** — leave generous padding inside shapes
6. **Use numbers/stats sparingly** — "407+ Tools" works, long numbers don't
7. **Test with `handdrawn` style first** — it's the most forgiving for text

### 3.3 Text Rules for Excalidraw

1. Use `fontFamily: 3` (monospace) for code/technical labels
2. Use `fontFamily: 1` (hand-drawn) for natural text
3. Always set both `text` and `originalText` to the same value
4. Center text in containers with `textAlign: "center"` and `verticalAlign: "middle"`

---

## 4. Layout Principles

### 4.1 Spacing

| Element | Minimum gap |
|---------|------------|
| Between pillar regions | 20-40px |
| Between components within a pillar | 15-20px |
| Module padding inside component | 10-15px |
| Between module blocks | 8-10px |
| Text padding inside shapes | 8-12px |
| Arrow clearance from shapes | 5px |

### 4.2 Shape Sizing

| Element | Width | Height | Corner radius |
|---------|-------|--------|---------------|
| Pillar region | 280-340px | fit content | 14-20px |
| Component card | 200-320px | fit content | 10-12px |
| Component header bar | full width | 30-36px | match card |
| Module block | 100-140px | 30-50px | 6-8px |
| Stat badge | 100-130px | 30-40px | 8px |
| Channel/tag chip | 55-88px | 24-30px | 5-6px |
| Cross-cutting bar | 80-90% of canvas | 100-120px | 14px (dashed stroke) |

### 4.3 Composition Patterns

**Pillar Overview** (high-level, 3-pillar view):
```
┌─────────┐  ┌─────────┐  ┌─────────┐
│  CORE   │←→│ BUTLER  │←→│ BRIDGE  │
│         │  │         │  │         │
│ icon    │  │ icon    │  │ icon    │
│ title   │  │ title   │  │ title   │
│ stats   │  │ stats   │  │ stats   │
└─────────┘  └─────────┘  └─────────┘
       ↕ composition arrows ↕
┌─────────────────────────────────────┐
│         CROSS-CUTTING (dashed)      │
│  [item] [item] [item] [item]        │
└─────────────────────────────────────┘
```

**Component Detail** (zoomed into a pillar):
```
┌── PILLAR REGION (tinted background) ──────┐
│                                            │
│  ┌── Component Card ──────────────────┐    │
│  │ [Header Bar — pillar color]        │    │
│  │  subtitle text                     │    │
│  │  ┌─Module─┐  ┌─Module─┐           │    │
│  │  │        │  │        │           │    │
│  │  └────────┘  └────────┘           │    │
│  │  ┌─Module─┐  ┌─Module─┐           │    │
│  │  │        │  │        │           │    │
│  │  └────────┘  └────────┘           │    │
│  └────────────────────────────────────┘    │
│                                            │
└────────────────────────────────────────────┘
```

**Data Flow** (sequence/process diagrams):
```
[Trigger] → [Step 1] → [Decision] → [Step 2] → [End]
  orange      teal        amber       teal      green
```

### 4.4 Arrow Conventions

| Type | Style | When to use |
|------|-------|-------------|
| Direct dependency | Solid, single arrow | A calls B |
| Bidirectional | Solid, double arrow | A ↔ B communication |
| Cross-pillar | Dashed, double arrow | P5/P6/P7 channels |
| Optional/async | Dashed, single arrow | Background tasks |
| Data flow | Solid, labeled | Show what moves (HTTP, SSE, etc.) |

---

## 5. Visual Style Guide (Nano Banana 2)

When using the `visual-diagram` skill, the SVG blueprint is transformed into an illustration. Choose the style based on the audience:

| Style | Best for | Key traits |
|-------|----------|-----------|
| `handdrawn` | Presentations, blogs | Sketchy lines, warm paper, organic feel |
| `polished` | Documentation, reports | Crisp edges, flat design, infographic quality |
| `blueprint` | Engineering deep-dives | Dark navy, white lines, technical feel |
| `watercolor` | Creative content | Soft colors, artistic, color bleeding |
| `minimal` | Executive slides | Black lines, white bg, ultra-clean |

**Recommended defaults:**
- Architecture overviews → `handdrawn`
- Component details → `polished`
- Data flows → `polished` or `handdrawn`
- Presentations → `handdrawn`

---

## 6. Accent & Branding Elements

Every Atelier diagram should include subtle brand touches:

1. **Gold accent line** — thin `#c9a227` horizontal line near the title (4-6px height, centered)
2. **Gold accent line** — matching line at the bottom of the diagram
3. **Title uses brand gold** or dark text with gold line above
4. **Pillar headers** — always use the pillar's primary color as header bar fill with white text
5. **Cross-cutting section** — always dashed border, `#37474F` stroke, `#ECEFF1` fill

---

## 7. Quality Checklist

Before finalizing any diagram:

- [ ] Pillar colors are correct (Core=teal, Butler=amber, Bridge=purple)
- [ ] Text hierarchy is clear (title > subtitle > body > annotation)
- [ ] All labels are SHORT (1-3 words for NB2 compatibility)
- [ ] Gold accent lines present (top and bottom)
- [ ] Arrows use correct context colors
- [ ] Cross-pillar connections are dashed blue `#1565C0`
- [ ] Cross-cutting section uses dashed border
- [ ] No orphaned elements (everything connected or in a region)
- [ ] Consistent spacing between elements
- [ ] Dark fills have white text, light fills have dark text
