# Changelog

## 0.3.0 — 2026-11-25

- Ensured all 2,640 records have a non-empty summary and at least one media/evidence item.
- Replaced 877 placeholder Wikidata summaries with sourced Wikipedia extracts, Wikidata descriptions, or country fallbacks (1,208 / 540 / 872 final counts).
- Generated one media item per fetched record from Wikidata P18/Commons: 2,513 Commons images and 107 explicit source-record cards.
- Filled the missing National Museum of Fine Arts image from a verified Commons file.

## 0.2.0 — 2026-11-25

- Fetched 2,620 Wikidata World Heritage Site records with coordinates, descriptions, inception years, and source links into `src/data/unescoSeed.ts`.
- Added `scripts/fetch-unesco.mjs` with paginated SPARQL fetching and offline replay from cached JSON.
- Wired the fetched corpus into the service seam with a 500-result cap.
- Fixed the map container collapse caused by unlayered MapLibre CSS.

## 0.1.0 — 2026-11-25

Initial working vertical slice.

- Scaffolded React, Vite, TypeScript, Tailwind, ESLint, Prettier, and Vitest.
- Added the paper archive design contract, product context, implementation plan, and generated design references.
- Built the three-pane responsive workspace with one canonical selection shared by feed, map, and drawer.
- Implemented typed local seed data, search, filters, viewport bounds filtering, source-backed records, media, relationships, and local private progress.
- Added MapLibre with OpenFreeMap, clustering, origin/current pins, relocation arcs, map error state, and URL-synced filters.
- Added Supabase/PostGIS migration with constraints, indexes, RLS, curator helper, viewport RPC, and draft seed SQL.
- Added 14 unit and component tests.
- Fixed layout overflow, mobile drawer navigation, localStorage test shim, focus styles, safe-area spacing, and missing `robots.txt`.
- Verified typecheck, lint, tests, formatting, production build, manual browser layouts, and Lighthouse accessibility/best-practices/SEO scores of 1/1/1.
