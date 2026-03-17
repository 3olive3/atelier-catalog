# Color Palette — Visual Diagrams (Nano Banana 2)

> **This file is a quick reference.** The full diagram design system is at:
> `atelier-catalog/references/diagram-design-system.md`
>
> The master brand design system (app colors, typography, surfaces) is at:
> `docs.3olive3.com/atelier/design-system/`

---

## SVG Blueprint Colors

When building SVG blueprints for Nano Banana 2, use these exact colors. NB2 preserves layout and relative color relationships but transforms the aesthetic.

### Pillar Colors

| Pillar | Header Fill | Background Tint | Module Fill | Text on Header |
|--------|------------|-----------------|-------------|----------------|
| **Core** | `#009688` | `#E0F2F1` | `#00897B` | `#ffffff` |
| **Butler** | `#FF8F00` | `#FFF3E0` | `#EF6C00` | `#ffffff` |
| **Bridge** | `#7B1FA2` | `#F3E5F5` | `#6A1B9A` | `#ffffff` |

### Semantic Colors

| Purpose | Fill | Stroke |
|---------|------|--------|
| Auth / Identity | `#1565C0` | `#0D47A1` |
| Cross-Cutting | `#37474F` | `#263238` |
| Cross-Cutting bg | `#ECEFF1` | `#37474F` (dashed) |
| AI / LLM | `#CE93D8` | `#6A1B9A` |

### Text Colors

| Level | Color |
|-------|-------|
| Title | `#111111` (with gold accent line above) |
| Subtitle | `#888888` |
| Pillar label (Core) | `#00695C` |
| Pillar label (Butler) | `#E65100` |
| Pillar label (Bridge) | `#4A148C` |
| Body | `#546E7A` |
| On dark fills | `#ffffff` |
| On light chips | `#CFD8DC` |

### Brand Accents

| Element | Color | Usage |
|---------|-------|-------|
| Gold accent line | `#c9a227` | 4-6px line above title and at bottom |
| Cross-pillar arrows | `#1565C0` | Dashed, bidirectional |
| Structural arrows | `#546E7A` | Solid, single direction |

### Background

| Property | Value |
|----------|-------|
| Canvas | `#f9f9f9` |

---

## NB2 Text Guidelines

1. **Max 3 words per label** — NB2 garbles longer text
2. **Min 9px font size** — smaller gets illegible
3. **Bold labels** — thin text disappears
4. **No paragraphs in shapes** — 2 lines max
5. **Test with `handdrawn` first** — most forgiving style
