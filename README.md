# ChronoAtlas

ChronoAtlas is a map-first historical exploration web application for Philippine heritage and international historical landmarks and artifacts. It connects a searchable discovery feed, an interactive MapLibre vector map, and a sourced historical context drawer around one canonical selection state.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. No `.env` file or API keys are required for local mode.

## Quality & verification commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npx playwright test
```

## Features

- **Coordinated three-pane workspace:** Discovery feed, MapLibre GL JS canvas (`OpenFreeMap` Liberty style), and Context Drawer share a single canonical `activeEntryId` and `activeLocationRole` (`origin` | `current`), with full URL deep-linking (`?entry=...&role=current`) and browser Back/Forward synchronization.
- **Smooth discovery & search:** Relevance-ranked search, chronological sorting (`Oldest first` / `Newest first`), Era presets, `Then & Now` and `Visited` quick lenses, smooth in-place list transitions without flicker on map pan, and automatic worldwide match hints (`Search the world (N found)`) whenever a searched record lies outside the active map area.
- **Dual-pin relocated artifacts & typed relationship arcs:** Origin pins, ringed harbor-blue current-holding pins, antimeridian-safe great-circle transfer lines, typed historical relationship arcs (solid ochre for influence/succession, dashed ochre for exchange/association, dashed blue for relocation), `View full journey` bounds framing, hover popups, cluster expansion zoom, and a collapsible non-color-only legend.
- **Archival media & Then-vs-Now comparison:** Full-resolution archival plate lightbox (`Inspect`), pointer-drag and keyboard-operable Then-vs-Now comparison slider across verified archival/modern image pairs, and explicit source/creator/license attribution.
- **Wikipedia & Wikimedia Importer:** Allowlisted `*.wikipedia.org` URL parser, REST + Action API summary/coordinate retrieval, Commons `extmetadata` attribution lookup, duplicate detection (`exact_slug`, `normalized_title`, `source_url`, `location_similarity`), and editable curator review form.
- **Dual-mode persistence:** Offline-capable local mode with a persistent browser curator overlay (`Export JSON` / `Reset`) and 600ms debounced private notes autosave, automatically switching to Supabase Auth + PostGIS RPCs when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) are configured.
- **Keyboard & responsive ergonomics:** `/` focuses search, `[` and `]` step across records, `Escape` collapses the drawer while leaving a map reopen pill, and responsive breakpoints adapt cleanly across desktop (`xl` 3-pane), tablet (`md` 2-pane + overlay), and phone (`375px` bottom tab bar + interactive guided tour).

## Datasets & provenance

Every historical entry remains marked `reviewed: false` (`Draft · unreviewed`) by default until human curation:

- **Curated Philippine & international corpus (`src/data/seed.ts` & `supabase/seed.sql`):** 55 entries (34 Philippine heritage places and artifacts, 21 international landmarks and relocated artifacts; 17 total artifacts, 14 relocated with verified origin and current holding coordinates), 72 verified Wikimedia Commons media items, **17 reviewed archival-vs-modern comparison pairs**, **40 typed historical relationship links**, and **187 multi-source references** across UNESCO World Heritage Open Data, the National Museum of the Philippines, Musée du Louvre, Wikidata, Wikivoyage, Wikipedia, and official heritage/library archives.
- **Global UNESCO / Wikidata corpus (`src/data/unescoSeed.ts` & `src/data/unescoMedia.ts`):** 2,620 World Heritage records lazy-loaded via dynamic Vite code-splitting, with **0** raw `Q-ID` titles, **0** generic/placeholder summaries, **2,620/2,620** resolved `locationName` values, **5,685** multi-source citations (UNESCO WHC, Wikidata, Wikipedia, official portals), and **2,535** verified Wikimedia Commons images (`85` honest `/evidence-placeholder.svg` source cards where no Commons photo exists).

Regenerate or refresh the corpus from live APIs with:

```bash
node scripts/fetch-unesco.mjs
node scripts/enrich-unesco.mjs
node scripts/build-curated-corpus.mjs
```

## Documentation

- [Technical Blueprint (`docs/CHRONOATLAS_BLUEPRINT_V2.md`)](docs/CHRONOATLAS_BLUEPRINT_V2.md)
- [Architecture (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)
- [Data Model (`docs/DATA_MODEL.md`)](docs/DATA_MODEL.md)
- [Security & RLS (`docs/SECURITY.md`)](docs/SECURITY.md)
- [Testing (`docs/TESTING.md`)](docs/TESTING.md)
- [Deployment (`docs/DEPLOYMENT.md`)](docs/DEPLOYMENT.md)
- [Design Contract (`DESIGN.md`)](DESIGN.md)

## Known limitations

- Map vector tiles and web fonts load from public CDNs (`OpenFreeMap`, `Google Fonts`); if offline, the map displays a recoverable retry banner while search, feed, and context drawer remain usable in local mode.
- Live Supabase RLS and PostGIS `EXPLAIN ANALYZE` execution require a provisioned Supabase project configured via `.env` (`VITE_SUPABASE_URL` and publishable/anon key). Never place a Supabase `service_role` key in browser environment variables.
