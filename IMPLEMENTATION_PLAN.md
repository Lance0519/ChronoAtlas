# Implementation plan

## Current state (audited 2026-11-25)

The repository contains ChronoAtlas v0.3.0, a working local three-pane vertical slice (`src/app`, `src/components/{layout,feed,map,drawer,ui}`, `src/services/entriesService.ts`, `src/data/{seed,unescoSeed,unescoMedia}.ts`, `supabase/migrations/0001_initial.sql`, `supabase/seed.sql`, and 15 Vitest checks).

Audit of the current app and dataset identified the following gaps against `CHRONOATLAS_BLUEPRINT_V2.md` and project goals:

1. **Dataset quality and breadth:**
   - `src/data/unescoSeed.ts` has 2,620 Wikidata World Heritage Site records, of which **803** still have raw `Q...` identifiers as titles, **876** only have generic country/Wikidata fallback summaries, **0** have `locationName`, `era`, or `significance`, and **107** media items fall back to `/evidence-placeholder.svg`.
   - `src/data/seed.ts` has only 10 curated entries, 1 artifact (`Spoliarium`), 4 relationship links, and 0 verified `archival` + `modern` comparison pairs (`comparisonGroup`).
   - `supabase/seed.sql` inserts only 3 rows and omits media/artifacts.
2. **Backend & dual-mode readiness:**
   - No `.env` or live Supabase credentials exist; `src/lib/supabase.ts` does not exist yet.
   - Missing global full-text search RPC and transactional curator import/review RPC (`supabase/migrations/0002_search_and_import.sql`).
   - `src/services/entriesService.ts` hard-caps results at 500 without `hasMore`/pagination metadata, lacks dedicated `entryLinksService`, `mediaService`, `sourcesService`, `authService`, and bundles ~2.5 MB of static dataset TS into the initial chunk.
3. **Wikipedia & Wikimedia Importer (§12):**
   - `src/services/import/*` (`wikiUrlParser`, `wikiValidator`, `wikipediaService`, `wikimediaService`, `duplicateDetection`, `importPayloadBuilder`) and `src/components/importer/{WikiImportDialog,ImportReviewForm}.tsx` are not yet implemented.
4. **Map, Feed & Context Drawer parity (§3, §8–11, §14–15):**
   - Relocated artifacts do not render a direct origin-to-current relocation line unless an explicit `entry_links` row duplicates it.
   - Relationship arcs share one dashed style instead of distinguishing `historical_influence`, `cultural_exchange`, `political_association`, and `artifact_relocation`.
   - Map lacks `getClusterExpansionZoom`, hover/selection preview popup, World/Philippines view reset, and map-to-feed card auto-scroll sync.
   - Notes autosave writes on every keystroke instead of 600ms debounced autosave with `Saving…`/`Saved`/`Failed`/retry and dirty-state guard.
   - Local-mode curator imports and review toggles do not yet persist in a browser overlay with JSON export.
5. **Docs, Design System Alignment, CI & E2E (§0.3, §18–20):**
   - `design-system/chronoatlas/MASTER.md` contains a conflicting generic "Email Client" blue/red spec instead of the "Paper archive" system in `DESIGN.md`.
   - Missing `docs/{CHRONOATLAS_BLUEPRINT_V2,ARCHITECTURE,DATA_MODEL,SECURITY,TESTING,DEPLOYMENT}.md`, `.github/workflows/ci.yml`, and Playwright E2E suite.

## Agreed architecture & decisions

- **Dual-mode data access:** Local-first offline-capable runtime by default (lazy-loading the 2,620+ corpus asynchronously so initial paint stays fast, paired with a persistent `localStorage` curator overlay and JSON export), while automatically activating the real Supabase + PostGIS adapter when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) are configured.
- **Provenance & review policy:** Strict draft-until-human-reviewed (`reviewed: false` by default for all imported and automated Wikidata/Wikipedia records, with explicit Draft vs Reviewed indicators and a curator review checklist/toggle). No fabricated dates, coordinates, creators, or licenses.
- **Visual design:** Deepen the `DESIGN.md` "Paper archive" aesthetic (`#f4f1e8` Paper, `#fbf9f3` Sheet, `#1d1c19` Ink, `#9a5b24` Ochre, `#35566b` Harbor blue, Crimson Pro + Atkinson Hyperlegible, 1px rules) and align `design-system/chronoatlas/MASTER.md`.
- **Dependencies:** Add `@playwright/test` for headless browser E2E verification; retain lightweight custom spherical great-circle utilities (`greatCircleSegments`) documented under §2.3 rather than adding `@turf/turf` bundle weight.

## Multi-agent phases and file ownership

| Phase | Owner                        | Scope & Owned Files                                                                                                                                                                                                                               | Status      |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Coordinator                  | Audit, `IMPLEMENTATION_PLAN.md`, shared contracts in `src/types/atlas.ts`, Playwright install                                                                                                                                                     | IN PROGRESS |
| 1A    | `data-enrichment-specialist` | Repair 803 Q-IDs & 876 generic summaries in `unescoSeed.ts`/`unescoMedia.ts` via live APIs; expand `src/data/seed.ts` (~45–60 entries, relocated artifacts, links, archival/modern pairs); sync `supabase/seed.sql`; `scripts/*`                  | NOT STARTED |
| 1B    | `backend-services-architect` | `supabase/migrations/0002_search_and_import.sql`, `src/types/database.ts`, `src/lib/{supabase,validators}.ts`, `src/services/import/*`, `src/services/{entriesService,entryLinksService,mediaService,sourcesService,authService,localOverlay}.ts` | NOT STARTED |
| 1C    | `docs-ci-specialist`         | Fix `design-system/chronoatlas/MASTER.md`; create `docs/{CHRONOATLAS_BLUEPRINT_V2,ARCHITECTURE,DATA_MODEL,SECURITY,TESTING,DEPLOYMENT}.md`, `.github/workflows/ci.yml`                                                                            | NOT STARTED |
| 2     | `frontend-ui-specialist`     | Upgrade `src/app/*`, `src/hooks/*`, `src/components/{layout,feed,map,drawer,importer,ui}/*`, `vite.config.ts`, `src/styles/index.css`                                                                                                             | NOT STARTED |
| 3     | `qa-e2e-specialist`          | `playwright.config.ts`, `tests/{atlas,feed,importer,drawer,mapFeatures}.test.*`, `tests/e2e/chronoatlas.spec.ts`                                                                                                                                  | NOT STARTED |
| 4     | Coordinator                  | Diff review, integration, full check suite (`format:check`, `lint`, `typecheck`, `test`, `build`, Playwright E2E), update `README.md`, `CHANGELOG.md`, and final status                                                                           | NOT STARTED |

## Risks and mitigations

- **Wikidata/Wikipedia rate limits during enrichment:** Mitigated with paced queues, exponential backoff, and preserving existing sourced fields if any individual lookup fails.
- **Wikimedia image availability:** Only store URLs verified from live Wikidata/Wikimedia Commons API responses; records without images retain `/evidence-placeholder.svg` honestly.
- **Unlayered CSS / MapLibre resize / bundle chunking:** Maintain `.maplibregl-map` specificity fix, `ResizeObserver`, and split the 2,620-entry corpus into an async Vite chunk.
- **Live Supabase verification:** Without active Supabase credentials in `.env`, SQL syntax and client logic will be verified locally while live remote RLS execution remains documented as `BLOCKED` on credentials.
