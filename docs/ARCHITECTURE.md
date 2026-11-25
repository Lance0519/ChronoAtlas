# ChronoAtlas Architecture

ChronoAtlas is a map-first historical exploration web application focused on Philippine heritage and international historical landmarks and artifacts. It connects a searchable discovery feed, a MapLibre GL JS map canvas, and a historical context drawer through a single canonical selection state.

---

## 1. Core Architectural Principles

- **Free-tier & open-source stack:** React 19, Vite 6, TypeScript 5.7, Tailwind CSS v4, Lucide React, MapLibre GL JS 5.6, OpenFreeMap vector tiles, and optional Supabase/PostGIS. No Mapbox dependency or paid map API keys.
- **One canonical selection:** Feed, map, and context drawer read and mutate shared state in `src/app/store/atlasStore.ts`; no pane owns independent active-entry state.
- **Service seam isolation:** UI components import data functions from `src/services/` rather than calling `supabase`, `fetch`, or `localStorage` directly.
- **Provenance & honest unknowns:** Unreviewed records display explicit draft status (`reviewed: false`); unknown dates, coordinates, creators, and licenses remain explicitly unknown without `[0, 0]` coordinate fallbacks.
- **Privacy separation:** Public historical records never carry personal visited flags or notes.

---

## 2. Three-Pane Workspace (`ThreePaneLayout.tsx`)

`src/components/layout/ThreePaneLayout.tsx` renders a `100dvh` locked application shell (`h-dvh flex-col overflow-hidden bg-paper`) with a skip-to-content link, a `56px` (`h-14`) archival masthead, and a responsive CSS Grid workspace:

| Breakpoint                      | Layout                                  | Pane Behavior                                                                                                                                  |
| ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop (`xl`, >= 1280px)**   | `grid-cols-[340px_minmax(0,1fr)_420px]` | Discovery Feed (`340px`), Map Canvas (`1fr`), and Context Drawer (`420px`) visible simultaneously; drawer collapses without clearing selection |
| **Tablet (`md`, 768px–1279px)** | `grid-cols-[320px_minmax(0,1fr)]`       | Feed and Map side-by-side; Context Drawer opens as a right-aligned sheet (`max-w-[440px]`) over the map                                        |
| **Mobile (`< 768px`)**          | Single active pane (`1fr`)              | Map-first default with a bottom tab bar (`Records`, `Map`, `Context`) and `env(safe-area-inset-bottom)` clearance                              |

---

## 3. Canonical State & Race Protection

### 3.1 `src/app/store/atlasStore.ts` & `AtlasProvider.tsx`

State is managed via React Context and `useReducer` (`atlasReducer`):

```ts
export interface AtlasState {
  activeEntryId: string | null;
  activeLocationRole: "origin" | "current" | null;
  filters: AtlasFilters;
  isContextDrawerOpen: boolean;
}
```

Key invariants enforced by `atlasReducer`:

- **`selectEntry`:** Sets `activeEntryId`, sets `activeLocationRole` (`"origin"` from feed cards/origin pins, `"current"` from relocated artifact current-location pins), and opens `isContextDrawerOpen = true`.
- **`setRole`:** Switches `activeLocationRole` between `"origin"` and `"current"` for the active entry so the map camera and drawer header track the chosen endpoint.
- **`closeDrawer` / `openDrawer`:** Toggles `isContextDrawerOpen` without clearing `activeEntryId` or `activeLocationRole`.
- **`setFilter`:** Updates `filters` (`query`, `scope`, `entryType`, `minYear`, `maxYear`, `searchThisArea`) while preserving the active selection.
- **`clearSelection`:** Clears both `activeEntryId` and `activeLocationRole` to `null`.
- **URL synchronization:** `AtlasProvider.tsx` hydrates initial filters with `filtersFromUrl(window.location.search)` and syncs changes back via `filtersToSearch` and `window.history.replaceState` (`q`, `scope`, `type`, `from`, `to`, `area`).

### 3.2 Request Generation & Debouncing (`src/hooks/useAtlasEntries.ts`)

`useAtlasEntries` increments a monotonic `generation` ref counter on every `(filters, bounds, retry)` change and debounces execution (`180ms` in the current local hook; `300ms` + `AbortController` recommended for remote RPCs in Blueprint §8.5). Only responses whose `requestId` matches `generation.current` may update React state, guaranteeing stale responses cannot overwrite newer results.

---

## 4. Dual-Mode Data Seam (`src/services/entriesService.ts`)

`src/services/entriesService.ts` decouples the UI from storage details so the application runs offline out-of-the-box and attaches to Supabase/PostGIS when configured.

### 4.1 Local Corpus, Lazy Chunking & Overlay (`src/services/entriesService.ts`, `src/services/localOverlay.ts`)

- **Curated seed (`src/data/seed.ts`):** Immediately available hand-curated entries, relocated artifacts (`Spoliarium` with origin in Rome and current location in Manila), directional relationships (`seedLinks`), Wikimedia media, and source references (`seedSources`).
- **Lazy-loaded World Heritage corpus (`ensureExtendedCorpusLoaded`):** `src/data/unescoSeed.ts` and `src/data/unescoMedia.ts` (generated from Wikidata/Wikipedia/Wikimedia Commons by `scripts/fetch-unesco.mjs` and `scripts/enrich-unesco.mjs`) load asynchronously via dynamic `import(...)` so the initial bundle stays lightweight. `subscribeCorpusLoaded` and `isExtendedCorpusLoaded` coordinate reactive hydration. Records without Wikimedia P18 images use `/evidence-placeholder.svg` and retain their Wikidata source URL.
- **Local curator overlay (`src/services/localOverlay.ts`):** Persists browser-side imported entries, media, sources, and `reviewedOverrides` under `chronoatlas.overlay.v1` in `localStorage` (`saveLocalImportedEntry`, `setLocalEntryReviewed`, `exportLocalOverlayJson`, `resetLocalOverlay`, `getLocalOverlayStats`), merging transparently on top of `seedEntries` and the lazy UNESCO corpus.
- **Local query & pagination (`listEntries`, `listEntriesPage`):** Filters by `scope`, `entryType`, astronomical year overlap (`minYear`/`maxYear`), case-insensitive match across `title`, `era`, `locationName`, and source titles, and wrapped viewport envelopes (`buildViewportEnvelopes` + `entryInAnyBounds`). Sorts deterministically by `(title, id)` and slices `offset..offset + limit + 1` (capped at `500`) to emit `EntriesPage` (`entries`, `hasMore`, `nextOffset`, `totalMatched`).
- **Personal progress (`getProgress`, `patchProgress`, `getProgressAsync`, `saveProgressAsync`):** In local mode, stored under `chronoatlas.progress.v1` in `localStorage` with non-destructive patch merging.

### 4.2 Dual-Mode Query & Supabase PostGIS Adapter (`src/lib/supabase.ts`, `src/services/authService.ts`)

`queryEntriesPage`, `fetchEntryDetail`, `saveImportedEntry`, `toggleEntryReviewed`, `getProgressAsync`, and `saveProgressAsync` switch automatically based on `isSupabaseConfigured()` and `getSupabaseClient()`:

1. **Configuration check (`src/lib/supabase.ts`):** Activates Supabase mode only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or fallback `VITE_SUPABASE_ANON_KEY`) are present and pass `isSafeExternalUrl`.
2. **Spatial & text RPC dispatch (`src/types/database.ts`):**
   - Viewport discovery without a text query calls `supabase.rpc("search_viewport", ...)` (`0001_initial.sql`).
   - Global search (`searchThisArea === false`) or text-filtered queries call `supabase.rpc("search_entries", ...)` (`0002_search_and_import.sql`), applying `entryInAnyBounds` when area filtering is active.
   - `parsePostgisPoint` decodes PostGIS GeoJSON objects, `POINT(...)` WKT strings, and EWKB hex geometries cleanly.
3. **Curator authorization & atomic mutations (`src/services/authService.ts`):** `getSession()` / `onAuthChange()` resolve `owner | curator | viewer` roles from `public.user_roles`; `saveImportedEntry` calls `import_historical_entry` and `toggleEntryReviewed` calls `set_entry_reviewed`. _Note: Live Supabase credentials are not configured in this workspace; local mode is active by default, and Wave 2 UI wiring will connect `useAtlasEntries` and the importer dialog to `queryEntriesPage` and `saveImportedEntry`._

---

## 5. MapLibre Lifecycle, Clustering & Great-Circle Arcs

### 5.1 Single-Instance Map Lifecycle (`src/components/map/AtlasMap.tsx`)

- **Mount once:** `new maplibregl.Map(...)` is constructed once in `useEffect`, stored in `mapRef`, and destroyed cleanly on unmount (`observer.disconnect()`, `map.remove()`, `mapRef.current = null`). Only an explicit user map retry increments `retry` to reconstruct after a fatal basemap load error.
- **Basemap:** Uses OpenFreeMap Liberty (`https://tiles.openfreemap.org/styles/liberty`) with `attributionControl: { compact: true }`.
- **Idempotent style/layer setup:** `addLayers` runs on `load` and `styledata`, checking `!map.isStyleLoaded() || map.getSource("entries-source")` so sources and layers are never duplicated across style reloads.
- **Pane resize sync:** A `ResizeObserver` on the map container calls `map.resize()` whenever pane widths or mobile tab visibility change.

### 5.2 GeoJSON Sources & Layers

| Source ID                  | Layer IDs                                                          | Purpose                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `entries-source`           | `entries-clusters`, `entries-cluster-count`, `entries-unclustered` | Origin points with native clustering (`clusterMaxZoom: 12`, `clusterRadius: 45`). Solid `#1d1c19` dot for places; hollow ring for artifacts |
| `current-locations-source` | `current-circles`                                                  | Current holding-location pins (`#35566b` Harbor blue) for relocated artifacts                                                               |
| `active-entry-source`      | `active-entry`                                                     | `13px` `#9a5b24` Ochre highlight ring around the selected endpoint                                                                          |
| `historical-arcs-source`   | `historical-arcs`                                                  | Direct relationship lines for the active entry only (`#35566b` for `artifact_relocation`, `#9a5b24` for historical links)                   |

Clicking `entries-unclustered` dispatches `{ type: "selectEntry", id, role: "origin" }`; clicking `current-circles` dispatches `{ type: "selectEntry", id, role: "current" }`. Selecting an entry flies the camera to the chosen role's coordinates (`duration: 900`, `essential: false` to respect `prefers-reduced-motion`). Missing coordinates keep the entry selected and display an accessible status notice instead of falling back to `[0, 0]`.

### 5.3 Antimeridian Bounds & Spherical Great-Circle Arcs (`src/lib/geo.ts`, `src/components/map/mapFeatures.ts`)

- **Wrapped viewports:** `buildViewportEnvelopes(bounds)` detects `minLon > maxLon` (crossing the International Date Line) and splits the query into two envelopes: `[minLon, 180]` and `[-180, maxLon]`. `entryInAnyBounds` returns true if either `entry.origin` or `entry.current` intersects any envelope.
- **Great-circle paths:** `greatCircleSegments(from, to, steps = 48)` computes spherical linear interpolation in pure TypeScript without adding `@turf/turf` bundle weight (`IMPLEMENTATION_PLAN.md`). Wherever consecutive sample points cross the antimeridian (`|lon - prevLon| > 180`), the segment array splits cleanly into separate `LineString` geometries so MapLibre never draws horizontal lines across the entire map. Degenerate coincident (`delta < 1e-9`) and antipodal (`|π - delta| < 1e-6`) cases are safely guarded.
- **Scoped rendering:** `buildArcCollection` computes lines solely for the active entry and its direct incoming/outgoing `EntryLink` targets, skipping missing endpoints.

---

## 6. Context Drawer, Media Gallery & Comparison (`src/components/drawer/`)

- **`ContextDrawer.tsx`:** Renders active role (`origin` vs `current`), astronomical date range (`formatYearRange`), coordinate precision & provenance (`formatCoordinate`), summary/significance, explicit draft disclaimer (`reviewed === false`), directional relationships (`ArrowUpRight` outgoing / `ArrowDownLeft` incoming), sourced citations, and private progress controls.
- **`PhotoGallery.tsx` & `src/lib/media.ts`:** Lazy-loads non-active images (`loading="lazy"`), tracks broken image loads per item, renders explicit creator/license/year/source provenance, and delegates comparison eligibility to `getComparisonPair`. A pair is eligible **only** when a manually curated `comparisonGroup` includes both an `"archival"` and a `"modern"` image (`"unknown"` never qualifies).
- **`PhotoCompare.tsx`:** Renders a `4:3` stacked viewport with CSS `clipPath`, an accessible `<input type="range" min={0} max={100}>` supporting pointer/touch/keyboard arrow keys, Archival/Modern badges, and a `Centre` reset button.

---

## 7. Wikipedia & Wikimedia Importer Pipeline (`src/services/import/`)

The importer pipeline implements modular separation (`src/services/import/`) backed by shared contracts in `src/types/atlas.ts` (`ImportDraftPayload`, `ImportMediaDraft`, `ImportSourceDraft`, `DuplicateCandidate`) and Wave 2 UI forms (`WikiImportDialog`, `ImportReviewForm`):

1. **URL parsing & validation (`wikiUrlParser.ts`, `wikiValidator.ts`):** `parseWikipediaUrl` and `isAllowedWikipediaHost` permit only language-edition hosts matching `^([a-z]{2,12}(?:-[a-z]{2,12})*)(?:\.m)?\.wikipedia\.org$` (excluding non-content subdomains and non-article namespaces), reject credentials, custom ports, and control characters, decode article titles, and normalize URLs to `https://<lang>.wikipedia.org/wiki/<Title>`. `validateImportPayload` validates all editable fields, year bounds, coordinates, artifact-only current locations, and HTTP/HTTPS URLs.
2. **Metadata fetch (`wikipediaService.ts`, `wikimediaService.ts`):** Fetch Wikipedia REST summary/coordinates and Wikimedia Commons `imageinfo`/`extmetadata` (creator, license, license URL), gracefully handling redirects, missing pages, disambiguation pages, and rate limits.
3. **Human review & duplicate checks (`duplicateDetection.ts`, `importPayloadBuilder.ts`):** `buildImportDraftPayload` prefills an editable `ImportDraftPayload` with `reviewed: false`, inferring `local` vs `international` scope (`isPhilippineCoordinates`) while keeping unverified precision explicit. `findDuplicateCandidates` checks `exact_slug`, `normalized_title`, `source_url`, and `location_similarity` (within 2 km with overlapping title terms) before confirmation.
4. **Atomic persistence:** Save entry, media, and source records transactionally—via `public.import_historical_entry(p_payload jsonb)` in Supabase mode (`supabase/migrations/0002_search_and_import.sql`) or atomically into `localOverlay` in local mode.
