# ChronoAtlas

A map-first historical atlas vertical slice. It runs entirely on a bounded local seed dataset, with a typed service seam and SQL migration ready for Supabase/PostGIS later.

## Run it

```bash
npm install
npm run dev
```

Open the URL printed by Vite. No `.env` file or credentials are needed.

Quality commands:

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run format:check
npm run build
```

## What works

- Three-pane workspace: discovery feed, MapLibre canvas, and context drawer share one selected record.
- Search, scope/type filters, year range, and "Search this map area" sync to the URL.
- Clustered origin pins, blue current-location pins, origin/current switching for relocated artifacts, and dashed relationship arcs.
- Drawer shows sourced summary, media with provenance, relationships, source links, and private local progress.
- Responsive layout: three panes at `xl`, two panes with overlay drawer at `md`, and one pane with bottom navigation on phones.
- Unknown dates, coordinates, media years, creators, and licences stay labelled as unknown.

## Data and provenance

`src/data/seed.ts` holds 10 curated draft entries, 9 media items, 4 relationships, and source references. `src/data/unescoSeed.ts` adds 2,620 Wikidata World Heritage Site records with coordinates, descriptions, inception years, and source links. The generated file is ignored by Prettier; regenerate it with `node scripts/fetch-unesco.mjs` (network) or pass cached SPARQL JSON files as arguments. Every record is marked "Draft · source review pending"; nothing is presented as verified scholarship.

Every entry now has a non-empty summary and at least one media/evidence item. Of the 2,620 fetched records, 1,208 summaries come from Wikipedia extracts, 540 from Wikidata descriptions, and 872 from sourced country fallbacks. Images come from Wikidata P18 via Wikimedia Commons with creator and licence where stated: 2,513 records have a Commons image, and 107 show an explicit source-record card instead of a fabricated image.

The service caps world results at 500 so the local slice stays responsive. The map's "Search this map area" filter narrows the corpus before that cap.

Regenerate the fetched corpus and its evidence with:

```bash
node scripts/fetch-unesco.mjs
node scripts/enrich-unesco.mjs
```

`src/services/entriesService.ts` is the only data access seam. `listEntries`, `getEntry`, `getMedia`, `getSources`, `getLinks`, `getProgress`, and `patchProgress` are the functions a future Supabase adapter must implement. UI components do not call `fetch`, Supabase, or `localStorage` directly.

Private progress is stored only in the browser under `chronoatlas.progress.v1` and is labelled as local. It is not part of the public dataset.

## Supabase readiness

`supabase/migrations/0001_initial.sql` defines:

- PostGIS geography columns with coordinate precision and source fields.
- Check constraints for slugs, year ranges, precision, and artifact-only current locations.
- GIN full-text search and GiST spatial indexes.
- RLS on every table: public read for curated records, curator-only writes checked by `public.is_curator()`, and per-user progress isolation.
- A bounded, wrapped-bounds `search_viewport` RPC with cursor-style offsets.

`supabase/seed.sql` inserts a small draft dataset. No live database, credentials, or RLS integration tests were available in this pass. `.env.example` lists the reserved Vite variable names; the client does not read them yet.

## Visual direction

The paper archive contract lives in `DESIGN.md`. Generated references are in `design-system/chronoatlas/MASTER.md`. Tokens are warm paper, sheet, ink, rule, ochre, and archive blue in `src/styles/index.css`. No gradients, glass, glow, or decorative motion.

## Known limits

- Map tiles and fonts come from public CDNs; the map shows a retryable error when the basemap fails.
- Supabase runtime integration, the Wikipedia importer UI, Playwright journeys, and query-plan measurement are out of scope for this vertical slice.
- Vite reports a >500 kB chunk warning because MapLibre GL JS and the fetched corpus are bundled into the initial chunk. The build still succeeds.

## Verification

See `IMPLEMENTATION_PLAN.md` for the phase-by-phase log.
