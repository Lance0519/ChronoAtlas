# ChronoAtlas Design System Master File

> **LOGIC:** Authoritative design system specification for ChronoAtlas.
> Grounded in `DESIGN.md`, `src/styles/index.css`, `index.html`, and `CHRONOATLAS_BLUEPRINT_V2.md` §3.3.
> If a page-specific override exists in `design-system/chronoatlas/pages/[page-name].md`, apply it on top of these global rules; otherwise strictly follow this document.

---

**Project:** ChronoAtlas  
**Aesthetic:** Paper Archive (Editorial Historical Atlas)  
**Operating Scene:** Long-session reading and cartographic exploration under normal indoor light—warm off-white paper, ink-black typography, 1px hairline rules, and a neutral frame around the interactive map.

---

## 1. Color Tokens

Defined in `src/styles/index.css` via Tailwind v4 `@theme` custom properties and component semantic colors.

### Core Archive Palette

| Role                      | Token / CSS Variable                           | Hex       | Usage                                                                                                                                                          |
| ------------------------- | ---------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paper**                 | `--color-paper` (`bg-paper`)                   | `#f4f1e8` | Application background, `<meta name="theme-color">`, input fields, scrollbar track, selected/hovered row ground                                                |
| **Sheet**                 | `--color-sheet` (`bg-sheet`)                   | `#fbf9f3` | Workspace panes (`DiscoveryFeed`, `ContextDrawer`), bottom tab bar, MapLibre popup & legend surfaces, cluster count text                                       |
| **Ink**                   | `--color-ink` (`text-ink`, `bg-ink`)           | `#1d1c19` | Primary headings, body text, filled place markers, primary button fill (`bg-ink text-sheet`), active tab text                                                  |
| **Secondary Ink (Muted)** | `--color-muted` (`text-muted`)                 | `#55524a` | Metadata, caption labels, citations, coordinate qualifiers, secondary copy, inactive filter text                                                               |
| **Rule**                  | `--color-rule` (`border-rule`)                 | `#d8d2c3` | 1px hairline dividers between panes, list rows, metadata sections, input borders, MapLibre control borders, skeleton loaders                                   |
| **Ochre**                 | `--color-ochre` (`text-ochre`, `border-ochre`) | `#9a5b24` | Active record indicator (2px left rule), keyboard `:focus-visible` outline, active filter underline, active map ring, origin cluster circles, historical links |
| **Harbor / Archive Blue** | `--color-harbor` (`text-harbor`)               | `#35566b` | Current holding-location pins for relocated artifacts, `artifact_relocation` map lines, incoming relationship directional icons                                |

### Functional & Supporting Surfaces

| Role                         | Hex       | Usage                                                                                    |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| **Error Surface Background** | `#f7e9e2` | Alert banners (`ErrorMessage` in `States.tsx`, basemap failure notice in `AtlasMap.tsx`) |
| **Error Surface Text**       | `#7a3720` | Alert banner body and retry button border/text (`>= 7:1` contrast against `#f7e9e2`)     |
| **Error Banner Border**      | `#b8835c` | 1px hairline border on floating map error notices                                        |
| **Error Retry Hover**        | `#efd8cc` | Hover background for retry buttons inside error surfaces                                 |
| **Text Selection**           | `#e5d3b8` | `::selection` highlight background with `#1d1c19` Ink foreground                         |
| **Map Canvas Ground**        | `#e9e4d8` | Underlying map container background while vector tiles load                              |
| **Image Frame Ground**       | `#e5e0d4` | Background behind gallery images before load                                             |
| **Scrollbar Thumb**          | `#c9c1ae` | Thin scrollbar thumb framed by 3px `--color-paper`                                       |

### Color Usage Rules

- **One focal accent (`#9a5b24` Ochre):** Reserve Ochre for the currently active/selected record, active filters, focus outlines, and historical connection indicators. Never scatter bright colors across cards or navigation chrome.
- **No decorative gradients, glassmorphism, or glows:** Every surface is solid (`#f4f1e8`, `#fbf9f3`, `#f7e9e2`). Legend and overlays may use `bg-sheet/95` or `bg-sheet/90` without `backdrop-filter: blur(...)`.
- **Non-color-only encoding:** Map pins, relationship arcs, visited states, and draft/reviewed badges always combine color with shape, stroke style, icon, or explicit text label.

---

## 2. Typography

Loaded in `index.html` from Google Fonts and configured in `src/styles/index.css`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Crimson+Pro:wght@400;600;700&display=swap"
  rel="stylesheet"
/>
```

### Font Families

- **Display Serif (`--font-display`):** `"Crimson Pro", Georgia, serif`
  - Used for `h1`, `h2`, `h3`, entry card titles, drawer entry titles, and panel empty-state headings.
  - Default heading weight: `600`, `text-wrap: balance`.
  - Editorial styling with old-style numeral character for historical headlines; prose retains clear contrast (`#1d1c19` on `#fbf9f3` / `#f4f1e8`).
- **Body & Interface Sans (`--font-sans`):** `"Atkinson Hyperlegible", system-ui, sans-serif`
  - Base document size: `15px`, `line-height: 1.5`, `-webkit-font-smoothing: antialiased`.
  - Chosen specifically for high legibility across character pairs (`I`/`l`/`1`, `0`/`O`) in long reading sessions and metadata tables.
- **Tabular Numerals (`.tabular`):** `font-variant-numeric: tabular-nums`
  - Mandatory for all astronomical/BCE/CE year badges, date range inputs, latitude/longitude coordinates, viewport coordinate readouts, and result counts.

### Type Scale

| Level                    | Class / Spec                | Size                        | Leading / Tracking               | Weight        | Font                  |
| ------------------------ | --------------------------- | --------------------------- | -------------------------------- | ------------- | --------------------- |
| **Caption / Label**      | `.caption-label`            | `11px`                      | `tracking: 0.08em`, uppercase    | `400` / `700` | Atkinson Hyperlegible |
| **Metadata / Controls**  | `text-xs` / `13px`          | `12px–13px`                 | `leading-relaxed`                | `400`         | Atkinson Hyperlegible |
| **Body Default**         | `body` / `text-sm`          | `15px` (`14px` dense prose) | `1.5` (`leading-relaxed`)        | `400`         | Atkinson Hyperlegible |
| **Card Title**           | `font-display text-[19px]`  | `19px`                      | `leading-tight`                  | `600`         | Crimson Pro           |
| **Pane Title**           | `h1` / `h2` (`text-[22px]`) | `22px`                      | `leading-tight` / `leading-none` | `600`         | Crimson Pro           |
| **Entry Title (Drawer)** | `font-display text-[34px]`  | `34px`                      | `leading-[1.05]`                 | `600`         | Crimson Pro           |

---

## 3. Layout, Surfaces & Rules

### Three-Pane Responsive Workspace (`ThreePaneLayout.tsx`)

- **Desktop (`xl`, `>= 1280px`):** `100dvh` locked viewport (`h-dvh flex-col overflow-hidden`), 56px (`h-14`) top header bar separated by `1px solid #d8d2c3`, three coordinated grid columns:
  - Left — Discovery Feed: `340px` (`target 320–360px`)
  - Center — Map Canvas: `minmax(0, 1fr)`
  - Right — Context Drawer: `420px` (`target 400–440px`, collapsible without clearing `activeEntryId`)
- **Tablet (`md`, `>= 768px` to `< 1280px`):** Two visible grid columns (`320px` Feed + `minmax(0, 1fr)` Map) with Context Drawer opening as a right-aligned full-height sheet (`max-w-[440px]`, `border-l border-rule`).
- **Mobile (`< 768px`):** Map-first single active pane with a fixed bottom navigation bar (`Records`, `Map`, `Context`) honoring `env(safe-area-inset-bottom)`. Selection persists across all viewport resizes and pane switches.

### Surface & Border Discipline

- **Square / `0px` Corner Radius:** All panes, cards, inputs, buttons, alert banners, MapLibre controls (`.maplibregl-ctrl-group { border-radius: 0; }`), and MapLibre popups (`.maplibregl-popup-content { border-radius: 0; }`) use crisp `0px` square corners. Do not introduce `rounded-lg`, `rounded-xl`, `rounded-full` pills, or card bubbles.
- **1px Hairline Rules:** Depth and separation come from `1px solid #d8d2c3` borders (`border-rule`, `.hairline`) and spacing—never drop shadows, glows, or blurred overlays (`box-shadow: none`).
  - _Note:_ Desktop `xl` panes have zero shadows (`xl:shadow-none`). Overlay drawer transitions must rely on `1px` `#d8d2c3` rule contrast rather than heavy elevation.

---

## 4. Component Specifications

### Entry Cards (`DiscoveryFeed.tsx`)

- Full-width `<button>` inside `<li>` stacked seamlessly with `border-b border-rule` (no gap/margin cards).
- **Selection state:** `2px` left border (`border-l-2`):
  - Default: `border-l-transparent bg-sheet`, hover `bg-paper`.
  - Selected (`aria-current="true"`): `border-l-ochre bg-paper`.
- Content hierarchy: uppercase scope + type indicator + Lucide icon -> `19px` Crimson Pro title -> tabular date range + era -> location name -> explicit `"Draft · source review pending"` notice when `reviewed === false`.

### Filters (`DiscoveryFeed.tsx`)

- Text toggles in a `role="group"` row—**never pill chips**.
- Active filter state uses a `2px` bottom border (`border-b-2 border-ochre text-ink`); inactive filters use `border-transparent text-muted hover:text-ink`.
- Search input and year-range inputs use `bg-paper border border-rule focus:border-ochre` with `0px` radius and `.tabular` on numeric year inputs.

### Buttons & Actions

- **Secondary / Default Button:** `border border-rule bg-transparent px-3 py-1.5 text-xs text-ink hover:border-ink hover:bg-paper`, square corners (`0px`).
- **Primary Action Button:** Square-cornered `border border-ink`, fills with Ink (`bg-ink text-sheet` or `hover:bg-ink hover:text-sheet`), zero shadow, zero vertical lift transform.
- **Active Toggle (e.g., Gallery/Compare, Origin/Current):** `border border-ochre text-ochre` when `aria-pressed="true"`, `border-rule text-muted` when inactive.

### Icons (`lucide-react`)

- Exclusively use **Lucide React** icons at a uniform **`1.5px` stroke weight** (`strokeWidth={1.5}`), sized `12px–16px` alongside metadata and controls, with `aria-hidden="true"` when paired with visible labels or `aria-label` on icon-only buttons.
- **Zero emojis** as interface icons.

### Map Semiotics (`AtlasMap.tsx`, `mapFeatures.ts`)

| Feature                         | Visual Encoding                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Place (Origin)**              | Solid `#1d1c19` circle (`radius: 6`, `stroke-width: 1`)                                                                                                 |
| **Artifact (Origin)**           | Hollow `#1d1c19` ring (`rgba(0,0,0,0)` fill, `stroke-width: 2`)                                                                                         |
| **Artifact Current Location**   | `#35566b` Harbor blue circle (`radius: 7`, `2px` `#fbf9f3` stroke)                                                                                      |
| **Cluster Circle**              | `#9a5b24` Ochre circle (`radius` stepped `14/18/22px`), `#fbf9f3` tabular count                                                                         |
| **Active Entry Ring**           | `13px` hollow `#9a5b24` Ochre ring (`stroke-width: 2`)                                                                                                  |
| **Artifact Relocation Line**    | `#35566b` Harbor blue line, distinct dash pattern                                                                                                       |
| **Historical Relationship Arc** | `#9a5b24` Ochre great-circle arc (`greatCircleSegments`), typed pattern (`historical_influence`, `cultural_exchange`, `political_association`, `other`) |

All map symbols must appear in the non-color-only `MapLegend` describing both shape/line pattern and meaning.

---

## 5. Accessibility, Focus & Motion

- **Focus Ring:** Global `:focus-visible` rule in `src/styles/index.css`:
  ```css
  :focus-visible {
    outline: 2px solid var(--color-ochre);
    outline-offset: 2px;
  }
  ```
- **Touch Targets:** Minimum **`44px × 44px`** effective hit target for mobile navigation tabs (`min-h-12` = `48px`), drawer close buttons, map zoom/reset buttons, and Then-vs-Now comparison controls on touch viewports (`min-h-[44px] min-w-[44px]`).
- **Motion Budget:**
  - Maximum `160ms` transition on color, opacity, or subtle transform (`duration-150` / `160ms`).
  - No continuous pulse/bounce loops beyond quiet skeleton loading bars (`SkeletonRows`).
  - **Reduced Motion Compliance (`@media (prefers-reduced-motion: reduce)`):**
    - CSS globally collapses `animation-duration` and `transition-duration` to `0.01ms !important` and `scroll-behavior: auto !important`.
    - MapLibre `flyTo` / `easeTo` respects reduced motion (`essential: false` and `window.matchMedia("(prefers-reduced-motion: reduce)").matches` duration `0`).
- **Keyboard Operability:**
  - Skip link (`Skip to content`) at top of `ThreePaneLayout`.
  - `PhotoCompare` range input supports Left/Right arrow keys plus a centered reset button (`Centre`).
  - Feed cards, filter groups, relationship links, importer modal, and drawer controls are all semantic `<button>` / `<a>` / `<input>` elements.

---

## 6. Anti-Patterns (Strictly Prohibited)

- **No gradients, glassmorphism, `backdrop-filter: blur()`, neon glows, or decorative box-shadows.**
- **No pill chips or rounded floating cards** (`border-radius` stays `0px`).
- **No emojis** as UI icons; always use Lucide (`1.5px` stroke).
- **No fabricated certainty:** Unreviewed records must visibly read as Drafts; missing dates, coordinates, creators, or licenses must explicitly report unknown/unrecorded states.
- **No raw HTML injection** from external Wikipedia/Wikimedia metadata.
