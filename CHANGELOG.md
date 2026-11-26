# Changelog

## 0.5.0 — 2026-11-26

- **UX audit & seamless interaction enhancements:**
  - Added full URL deep-linking (`?entry=...&role=current&drawer=closed`) and `popstate` browser Back/Forward synchronization while preserving filter URL compatibility.
  - Added search relevance ranking, chronological sort (`Oldest first` / `Newest first`), and one-click `Then & Now` and `Visited` discovery lenses.
  - Added worldwide match detection (`Search the world (N found)`) and inline global-match banners when `Search this map area` narrows out records matching a search query, plus flicker-free list transitions during map panning.
  - Added floating map-canvas spatial toggle (`Area filter: On` / `Worldwide`), active-record reopen pill when the context drawer is collapsed, `View full journey` bounds framing for relocated artifacts, and a mobile-friendly collapsible map legend.
  - Added direct horizontal pointer-capture dragging on the Then-vs-Now comparison viewport, a fullscreen archival media lightbox (`Inspect`), automatic Context Drawer scroll-to-top on record navigation, `Previous`/`Next` record controls, share-link copying, and one-click source citation copying.
  - Added global keyboard shortcuts (`/` to focus search, `[` and `]` to step across records, `Escape` to collapse the drawer), mobile pane synchronization during the first-visit Quick Tour, and zero-flicker synchronous local-mode hook fast paths.
  - Configured Vitest to exclude `tests/e2e/**` cleanly and expanded automated test coverage to **61 Vitest unit/component tests** and **3 comprehensive Playwright E2E suites**.

## 0.4.0 — 2026-11-25

- **Dataset enrichment & multi-source historical corpus:**
  - Enriched all 2,620 UNESCO/Wikidata records (`0` raw `Q-ID` titles remaining, `0` placeholder or generic fallback summaries, `2,620/2,620` `locationName` populated, `603` `era`, `1,757` `significance`, `5,685` multi-source references across UNESCO WHC Open Data, Wikidata, Wikipedia, and official portals, and `2,535` verified Commons images).
  - Expanded curated corpus (`src/data/seed.ts` & idempotent `supabase/seed.sql`) to 55 Philippine and international landmarks and artifacts (`17` artifacts, `14` relocated, `40` typed relationship links, `17` verified archival/modern Then-vs-Now comparison pairs, and `187` multi-source citations across 8 source types).
- **Dual-mode Supabase adapter, Wikipedia Importer & docs/CI:**
  - Added `supabase/migrations/0002_search_and_import.sql` (`search_entries`, `import_historical_entry`, `set_entry_reviewed`), typed `src/lib/supabase.ts`, `authService.ts`, `localOverlay.ts` (JSON export/reset), and dynamic Vite chunk splitting for `unescoSeed` and `unescoMedia`.
  - Implemented all 6 `src/services/import/*` modules and accessible `WikiImportDialog` + `ImportReviewForm` with duplicate detection and validation.
  - Aligned `design-system/chronoatlas/MASTER.md` with `DESIGN.md`, added `docs/{CHRONOATLAS_BLUEPRINT_V2,ARCHITECTURE,DATA_MODEL,SECURITY,TESTING,DEPLOYMENT}.md`, `.github/workflows/ci.yml`, and first-visit `OnboardingTour`.

## 0.3.0 — 2026-11-25

- Ensured all 2,640 records have a non-empty summary and at least one media/evidence item.
- Replaced 877 placeholder Wikidata summaries with sourced Wikipedia extracts, Wikidata descriptions, or country fallbacks.
- Generated one media item per fetched record from Wikidata P18/Commons.
- Filled the missing National Museum of Fine Arts image from a verified Commons file.

## 0.2.0 — 2026-11-25

- Fetched 2,620 Wikidata World Heritage Site records into `src/data/unescoSeed.ts`.
- Added `scripts/fetch-unesco.mjs` with paginated SPARQL fetching and offline replay from cached JSON.
- Wired the fetched corpus into the service seam with a 500-result cap and fixed unlayered MapLibre CSS.

## 0.1.0 — 2026-11-25

- Initial working vertical slice with React, Vite, TypeScript, Tailwind, MapLibre GL JS, PostGIS initial schema (`0001_initial.sql`), and 14 unit/component tests.
