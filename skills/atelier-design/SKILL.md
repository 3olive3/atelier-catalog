---
name: atelier-design
description: "MANDATORY before any UI, icon, logo, favicon, splash or naming work on the Atelier Platform (Console, SSO/Authentik, Guest portal, Bridge, Models/LiteLLM, Guardian, Companion apps, Docs, Telegram bots, the platform page) and for any new Atelier component. The Atelier brand system — gold mark + per-component glyph, 'Atelier' + coloured name wordmark, brand-* tokens, the animated Platform loader — and how to use the shared design system so every Atelier surface looks like one family."
---

# Atelier design

Every Atelier surface is built from **one design system** and **one brand**. Nothing
is drawn or coloured by hand in an app. Decided by Filipe on 2026-10-12. Record:
home-docs ADR-0022 (design system) and `projects/atelier-brand`.

Not for Torneva, moviai, HomeColor or other non-Atelier apps. They use the same
design system with their own theme, but not the Atelier brand.

## Where things live

| What | Where |
|---|---|
| Components, tokens, themes | `~/Developer/design-system` (`packages/ui`, `packages/tokens`) |
| The brand definition | `design-system/packages/brand/brand.json` |
| Brand colours | `brand-<key>` tokens in `packages/tokens/tokens/themes/atelier-control.json` |
| Generated assets | `design-system/packages/brand/dist/` (marks, wordmarks, PNGs, `loader.svg`, `brand.ts`) |
| Atelier theme | `atelier-control`; set `data-ds-theme="atelier-control"`, never `data-theme` |

Apps **copy in** (shadcn registry for components, `dist/` files for brand). They never
import from the design-system repo at build time. The Console builds in Docker on UNRAID.

## The brand rule

1. **The mark.**
   - A gold square: `#c9a227`, 72-unit grid, radius 16. It is the same everywhere, and it means *Atelier*.
   - Inside it, the component's **glyph**, in dark ink `rgba(0,0,0,0.85)`, stroke 2.5 (2 for detail).
   - The square never changes colour per component or per theme. Only the glyph changes.
2. **The wordmark.**
   - "**Atelier**" (weight 600, foreground colour), then the **component name** (weight 500) in its `brand-<key>` colour.
   - Underneath, a short subtitle in spaced capitals.
   - The component's colour is used for the name and for the app's accents, never for the square.
3. **One name per thing the person sees.** The name describes what someone sees or uses, not how it is built.

| Key | Name | Subtitle | Glyph | Used on |
|---|---|---|---|---|
| `platform` | Platform | Home Platform | Oficina (wire diamond, dot) | the loader of every service, `atelier.3olive3.com`, shared docs |
| `butler` | Butler | Home Intelligence | Laço (bow tie) | Telegram bots and approvals, and the Console's chat with Butler |
| `console` | Console | Control Centre | Mosaico (2×2 tiles) | `console.3olive3.com` |
| `sso` | SSO | Home Authentication | Impressão (fingerprint) | `auth.3olive3.com` (Authentik brand) |
| `guest` | Guest | Welcome | Porta aberta (open door) | guest portal, guest Wi-Fi |
| `bridge` | Bridge | Home Agents | Ponte (arch bridge) | the agents (OpenClaw) |
| `models` | Models | Model Routing | Encaminhamento (one line in, three out) | LiteLLM: `models.3olive3.com` (its own UI) and the Console's Models section |
| `companion` | Companion | iOS · iPadOS · tvOS | Telefone + tablet | app icons, launch screens |
| `docs` | Docs | Home Knowledge | Livro aberto (open book) | `docs.3olive3.com`, and the Console's Docs menu (embedded) |
| `catalog` | Catalog | Skills & Tools | Camadas (layers) | the Console's Catalog menu (MCP servers + skills) |
| `guardian` | Guardian | Policy & Access | Escudo e fechadura (shield + keyhole), orchid | the Console's Guardian group (people, guests, service access, permissions, advanced rules) — no own UI, opens its Console section |

## The Platform loader and the platform page

- **Loader:**
  - `dist/loader.svg` (or `ATELIER_LOADER` in `brand.ts`): the Platform glyph draws itself and the centre dot lights and pulses.
  - Show it on every Atelier service while something is loading. **At most about 1 s, and only while really loading:** never add a delay to show it.
  - With `prefers-reduced-motion` it is a still mark. This is already in the CSS; keep it.
- **Platform page:**
  - Clicking any component's logo goes to the platform page, `atelier.3olive3.com`. It shows the big animated mark and the high-level design of the platform.
  - It is open to the whole house without sign-in, so it holds **no IPs, ports, secrets or firewall rules**.

## Using it

- **A new surface** for an existing component:
  - copy `dist/mark/<key>.svg` as the favicon, `dist/wordmark/<key>-{light,dark}.svg` for headers and `dist/png/<key>-<size>.png` for app icons;
  - or, in React, draw from `brand.ts` (`ATELIER[key].glyph` on the gold square).
  - Use the colour token `--brand-<key>`; never type the hex.
- **A new component:**
  1. Add it to `brand.json` (key, name, subtitle, glyph on the 72 grid, the same stroke rules, and `use`).
  2. Add `brand-<key>` to `atelier-control.json` for light and dark, and build the tokens. **The contrast check must pass, at 4.5:1 on background and card.**
  3. Build the brand (`npm run build -w @workspace/brand`), and look at the light and dark wordmarks.
  4. Ask Filipe to choose the glyph: offer 2–3 options on a brand board, like the 2026-10-12 one. Then update the table here and in home-docs.
- **Changing a colour or a glyph:** edit the token or `brand.json`, rebuild, and copy `dist` again into every app that uses it. Never patch a copy in an app.

## Standards every Atelier UI keeps (design system)

- **Tokens only**, never colour literals. Dark mode via `.dark`. WCAG AA is enforced by the token build.
- **Components come from the design-system registry** (shadcn on Base UI). Do not add a new component library or palette.
- **Portuguese and English:** every visible string goes through the app's i18n. The Console's pattern is `src/i18n` with `defineMessages({pt, en})`; English must carry every Portuguese key. Portuguese is pt-PT, never pt-BR.
- **Labelled controls, a visible focus ring, no horizontal scroll at 390 px.** Prove a page by rendering it headless in both languages, not by reading the code.
