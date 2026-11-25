# ChronoAtlas 2.0
## Complete Technical Blueprint, AI Agent Execution Specification, and GitHub Project Guide

**Version:** 2.0.0  
**Status:** Authoritative implementation specification  
**Project:** Solo-developer, map-centered historical exploration web application  
**Focus:** Philippine heritage and international historical landmarks and artifacts  
**Stack:** React, Vite, TypeScript, Tailwind CSS, Lucide React, MapLibre GL JS, OpenFreeMap, Turf, Supabase, PostgreSQL, PostGIS  
**Cost model:** Designed for free service tiers and open-source tooling. Free-tier quotas, terms, and availability may change.

---

# 0. Instructions for AI Coding Agents

This document is the source of truth for implementation. Read it completely before changing code.

## 0.1 Mandatory workflow

1. Inspect the existing repository, package scripts, source tree, migrations, environment configuration, and current build status.
2. Read this specification completely.
3. Before implementation, create or update `IMPLEMENTATION_PLAN.md` with the current state, gaps, proposed phases, expected files, migrations, risks, and unresolved decisions.
4. Do not begin implementation until the plan is complete. If the environment requires human approval, wait for it.
5. Implement incrementally. Complete and verify one phase before proceeding.
6. Preserve working code unless a change is required by this specification.
7. Do not invent historical facts, credentials, database fields, API responses, test results, or implementation status.
8. Never expose secrets in source code, logs, screenshots, commits, or documentation.
9. Never run destructive operations against a configured remote database without explicit human approval.
10. If blocked by credentials or external services, document the blocker and implement a safe interface where possible.
11. Do not introduce a new framework, ORM, state library, paid service, or backend server without documenting the need and obtaining approval.
12. Do not claim a feature is complete unless it works and its acceptance criteria have been checked.

Use these status labels consistently: `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `IMPLEMENTED`, `VERIFIED`. `IMPLEMENTED` means code exists. `VERIFIED` means tests or documented manual acceptance checks passed.

## 0.2 Parallel agents

If sub-agents are available, use them only after the implementation plan exists. Delegate independent tasks with clear file ownership. Do not allow multiple agents to edit the same schema or files concurrently. One primary agent must own integration, review diffs, resolve conflicts, run all checks, and report the final status. Parallel output is not considered integrated until it passes tests and builds.

## 0.3 Required repository deliverables

The repository must include:

- `README.md`
- `IMPLEMENTATION_PLAN.md`
- `CHANGELOG.md`
- `.gitignore`
- `.env.example`
- `docs/CHRONOATLAS_BLUEPRINT_V2.md` (this document)
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`
- `docs/DEPLOYMENT.md`
- `src/` application source
- `supabase/migrations/` versioned SQL migrations
- a documented seed-data workflow
- automated tests for core behavior and critical workflows

---

# 1. Product Definition

ChronoAtlas is an interactive historical exploration application for discovering Philippine heritage and international historical landmarks and artifacts. Its defining experience connects a searchable discovery feed, a global interactive map, and a historical context drawer.

Users can discover a historical place or artifact, locate its origin, inspect context and media, explore related records, trace an artifact to its current location, compare archival and modern imagery when a reliable pair exists, and privately record visited status and notes.

ChronoAtlas is a geographical exploration tool, not a general-purpose encyclopedia. Its core value is revealing spatial relationships between historical records.

## 1.1 Principles

- Prefer open-source libraries and free service tiers.
- No Mapbox dependency or paid map API key.
- Separate public historical records from private user data.
- Preserve source provenance for imported text, coordinates, and media.
- Imported information is unverified until human review.
- Distinguish exact, approximate, uncertain, and unknown information.
- Support global geography, including the International Date Line.
- Prioritize reliability, accessibility, and maintainability over decorative complexity.
- Do not imply that Wikipedia or Wikimedia content is authoritative merely because it was imported.

## 1.2 Initial release scope

**Required:** historical places and artifacts; Local/International classification; origin and optional current coordinates; typed historical relationships; source references; media gallery and attribution; reviewed Then-vs-Now comparisons; Wikipedia-assisted import; search and filters; viewport discovery; global search; private visited status and notes; responsive three-pane UI; Supabase RLS; reproducible migrations; automated tests.

**Not required:** public submissions, comments, profiles, social feeds, real-time collaboration, paid geocoding, commercial map services, automated fact verification, AI-generated historical claims, full GIS editing, or native mobile applications.

Do not implement excluded features unless the project owner changes scope.

---

# 2. Technology Stack and Constraints

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React + Vite | UI runtime |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Layout and styling |
| Icons | Lucide React | Interface icons |
| Map | MapLibre GL JS | Vector map rendering |
| Map style/tiles | OpenFreeMap | Basemap style and vector tiles |
| Geospatial | `@turf/turf` | Great-circle and geometry utilities |
| Backend/database | Supabase | PostgreSQL hosting, auth, client access |
| Spatial database | PostGIS | Spatial types, indexes, viewport queries |
| Article source | Wikipedia REST API | Article summary and metadata |
| Media source | Wikimedia Commons API | Media metadata, creator, license |
| Unit tests | Vitest | Unit tests |
| Component tests | React Testing Library | UI behavior |
| E2E tests | Playwright | Browser workflows |
| Quality | ESLint + Prettier | Linting and formatting |

## 2.1 Non-negotiable constraints

- Do not use Mapbox GL JS.
- Do not require paid map API keys.
- Never expose Supabase service-role credentials in browser code.
- Never place privileged secrets in `VITE_` variables.
- Enforce access using RLS and trusted server-side operations, not hidden UI controls.
- Do not trust Wikipedia summaries as verified scholarship.
- Do not assume Wikimedia images share one license.
- Do not reconstruct the MapLibre instance on every React render.
- Keep private notes and visited state out of public entry rows and queries.
- Do not fetch the entire global dataset to populate the map.
- Do not inject raw imported HTML.
- Do not present synthetic or fabricated historical data as real.

## 2.2 Environment variables

`.env.example`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Prefer the project's current Supabase publishable key if configured.
# VITE_SUPABASE_PUBLISHABLE_KEY=
```

A public/publishable client key is not a security boundary; RLS is mandatory. Any service-role key must remain server-side, must not use a `VITE_` prefix, and must never be committed.

## 2.3 Dependency policy

Before adding a dependency, confirm the current stack cannot reasonably provide the feature, check for an existing equivalent, prefer maintained packages, and document the reason. Do not add Redux by default. React Context or Zustand is sufficient; retain an existing working state approach where practical.

---

# 3. Product Experience and Layout

## 3.1 Desktop workspace

The desktop workspace fills the viewport height and contains three coordinated panes.

### Left pane: Discovery Feed (target 320–360 px)

Responsibilities:

- Search title, era, location name, and optionally source title.
- Scope filters: All, Local, International.
- Type filters: All, Places, Artifacts.
- Historical year range filter.
- Toggle Search this map area / Search entire world.
- Display entry cards and loading/empty/error/capped states.
- Open the Wikipedia importer.
- Reflect the canonical selected entry.

Cards show title, era, year/date when known, scope, type, visited indicator when available, and selected state. The feed must not own a separate active-selection state.

### Center pane: Map Canvas

Responsibilities:

- Render OpenFreeMap style through MapLibre.
- Display origin markers and current-location markers for relocated artifacts.
- Cluster markers at low zoom.
- Fly to selected locations.
- Display direct historical relationship arcs and artifact relocation lines.
- Support viewport discovery and map controls (zoom, reset, search-area toggle).
- Display a legend and recoverable loading/error states.

Use GeoJSON sources and MapLibre layers for large point collections. Avoid one React DOM marker per record unless justified.

### Right pane: Context Drawer (target 400–440 px)

Responsibilities:

- Display selected entry details.
- Display gallery or Then-vs-Now comparison.
- Show title, era, date range, coordinates, summary, and significance.
- Provide origin/current-location navigation for artifacts.
- Display incoming and outgoing relationships.
- Display source references and media attribution/license.
- Provide private visited status and notes.
- Collapse/reopen without losing selection.

Show a clear empty state when no entry is selected.

## 3.2 Responsive behavior

- Large screens: all three panes visible.
- Medium screens: feed and map usable; drawer collapsible or overlay.
- Small screens: map-first view with feed and context in drawers or tabs.
- Preserve selection across layout changes.
- Do not squeeze three desktop panes into a narrow viewport.
- Ensure touch targets, keyboard focus, and comparison controls work on mobile.

## 3.3 Visual direction

Use a restrained archival/editorial interface. Use high-contrast typography, solid surfaces, clear borders, consistent spacing, and a clear hierarchy for titles, dates, metadata, and citations. Avoid excessive gradients, glassmorphism, glowing cards, oversized rounded panels, and decorative animation. Use Lucide icons, not emoji as the default icon system. Respect reduced-motion preferences.

---

# 4. Application State and TypeScript Contracts

Use one canonical source of truth for cross-pane state. React Context or Zustand is acceptable.

```ts
export type Scope = "local" | "international";
export type EntryType = "place" | "artifact";
export type ScopeFilter = "all" | Scope;
export type EntryTypeFilter = "all" | EntryType;
export type LocationRole = "origin" | "current";
export type MediaPeriod = "archival" | "modern" | "unknown";
export type CoordinatePrecision =
  | "exact" | "approximate" | "area_centroid" | "unknown";

export interface AtlasFilters {
  query: string;
  scope: ScopeFilter;
  entryType: EntryTypeFilter;
  minYear: number | null;
  maxYear: number | null;
  searchThisArea: boolean;
}

export interface AtlasState {
  activeEntryId: string | null;
  activeLocationRole: LocationRole | null;
  filters: AtlasFilters;
  isContextDrawerOpen: boolean;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface HistoricalEntry {
  id: string;
  title: string;
  slug: string;
  scope: Scope;
  entryType: EntryType;
  era: string | null;
  startYear: number | null;
  endYear: number | null;
  dateIsApproximate: boolean;
  locationName: string | null;
  summary: string;
  significance: string | null;
  origin: Coordinates | null;
  current: Coordinates | null;
  originPrecision: CoordinatePrecision;
  currentPrecision: CoordinatePrecision | null;
}
```

The TypeScript contract must match the SQL schema. A field change must update migrations, generated database types, services, and tests together.

## 4.1 State rules

1. `activeEntryId` is the canonical selected-entry identifier.
2. `activeLocationRole` is `origin`, `current`, or `null`.
3. Feed, map, and drawer derive selection from shared state.
4. Card selection sets the ID, sets role to `origin`, opens the drawer, and requests a camera transition.
5. Origin pin selection sets the ID and role to `origin`.
6. Current pin selection sets the same ID and role to `current`.
7. Drawer content always belongs to the canonical entry.
8. Closing the drawer does not automatically clear selection.
9. Clearing selection sets both ID and role to `null`.
10. A filter change must not silently erase selection; retain detail state or clear with an explicit UI transition.
11. A selected entry outside the viewport remains accessible.
12. Do not duplicate active-entry state in individual panes.

Camera target: card/origin selection flies to origin; current-pin selection flies to current coordinates. If a coordinate is missing, keep the entry selected and show a message. Never use `[0, 0]` as fallback.

---

# 5. Database Model

Enable PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Use versioned migrations in `supabase/migrations/`. Do not make undocumented manual database changes.

## 5.1 Date convention

Use astronomical year numbering:

- 500 BCE = `-499`
- 1 BCE = `0`
- 1 CE = `1`
- 2026 CE = `2026`

This avoids the missing year zero in arithmetic. UI formatting must consistently convert values to BCE/CE. Use `start_year`, optional `end_year`, and `date_is_approximate`. `NULL` means unknown, not zero.

## 5.2 Historical entries

```sql
CREATE TABLE public.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN ('local', 'international')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('place', 'artifact')),
  era TEXT,
  start_year INT,
  end_year INT,
  date_is_approximate BOOLEAN NOT NULL DEFAULT FALSE,
  location_name TEXT,
  summary TEXT NOT NULL,
  significance TEXT,
  origin_location GEOGRAPHY(Point, 4326),
  current_location GEOGRAPHY(Point, 4326),
  origin_coordinate_precision TEXT NOT NULL DEFAULT 'unknown'
    CHECK (origin_coordinate_precision IN
      ('exact', 'approximate', 'area_centroid', 'unknown')),
  current_coordinate_precision TEXT
    CHECK (current_coordinate_precision IS NULL OR
      current_coordinate_precision IN
      ('exact', 'approximate', 'area_centroid', 'unknown')),
  origin_coordinate_source TEXT,
  current_coordinate_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT valid_year_range CHECK (
    (start_year IS NULL OR start_year BETWEEN -500000 AND 2100) AND
    (end_year IS NULL OR end_year BETWEEN -500000 AND 2100) AND
    (start_year IS NULL OR end_year IS NULL OR end_year >= start_year)
  ),
  CONSTRAINT current_location_is_artifact
    CHECK (current_location IS NULL OR entry_type = 'artifact'),
  CONSTRAINT current_precision_requires_location
    CHECK (current_location IS NOT NULL OR current_coordinate_precision IS NULL)
);
```

Coordinate policy:

- Do not require a fabricated point to make a record mappable.
- Allow unknown origin by leaving `origin_location` null and represent unlocated records in the UI.
- `exact` means a well-supported specific location.
- `approximate` means an approximate position supported by a source.
- `area_centroid` means a representative point for a larger area/site.
- `unknown` means precision is not established.
- Store coordinate provenance. Do not present a centroid as an exact site coordinate.
- Viewport queries must handle nullable coordinates.

## 5.3 Personal progress

```sql
CREATE TABLE public.user_entry_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  visited BOOLEAN NOT NULL DEFAULT FALSE,
  personal_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, entry_id)
);
CREATE INDEX idx_user_entry_progress_entry_id
  ON public.user_entry_progress(entry_id);
```

Personal progress must never be returned by public entry queries.

## 5.4 Entry media

Do not use a boolean archival flag: it cannot distinguish confirmed modern media from unknown classification.

```sql
CREATE TABLE public.entry_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  source_url TEXT,
  caption TEXT,
  photo_year INT,
  media_period TEXT NOT NULL DEFAULT 'unknown'
    CHECK (media_period IN ('archival', 'modern', 'unknown')),
  creator TEXT,
  attribution_text TEXT,
  license TEXT,
  license_url TEXT,
  comparison_group TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_photo_year
    CHECK (photo_year IS NULL OR photo_year BETWEEN -500000 AND 2100)
);
CREATE INDEX idx_entry_media_entry_id ON public.entry_media(entry_id);
CREATE INDEX idx_entry_media_comparison
  ON public.entry_media(entry_id, comparison_group, media_period);
```

`archival`, `modern`, and `unknown` are explicit classifications. Unknown is never treated as modern. Preserve creator, attribution, license, license URL, and source URL when available. Never invent license terms. Follow the source's license and usage conditions.

## 5.5 Historical relationships

A pair of entries can have multiple relationship types. Do not use `(source_id, target_id)` as the only primary key.

```sql
CREATE TABLE public.entry_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  relationship_label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_link CHECK (source_id <> target_id),
  CONSTRAINT unique_typed_link UNIQUE (source_id, target_id, relationship_type)
);
CREATE INDEX idx_entry_links_source_id ON public.entry_links(source_id);
CREATE INDEX idx_entry_links_target_id ON public.entry_links(target_id);
```

Suggested controlled types: `historical_influence`, `cultural_exchange`, `political_association`, `same_event`, `successor`, `predecessor`, `related_site`, `artifact_origin`, `artifact_relocation`, `other`. `other` requires a meaningful label. Relationships are directional; the UI shows both incoming and outgoing links without reversing their meaning.

## 5.6 Source references

```sql
CREATE TABLE public.entry_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  publisher TEXT,
  author TEXT,
  publication_year INT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT,
  notes TEXT
);
CREATE INDEX idx_entry_sources_entry_id ON public.entry_sources(entry_id);
```

Sources may include Wikipedia pages, museum catalogues, government heritage pages, scholarly publications, and other references. A source type is descriptive metadata, not a quality guarantee.

## 5.7 Updated-at triggers

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER entries_set_updated_at
BEFORE UPDATE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER progress_set_updated_at
BEFORE UPDATE ON public.user_entry_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Add equivalent triggers to any future mutable table that has `updated_at`.

## 5.8 Search and spatial indexes

For growing datasets, add a generated search vector:

```sql
ALTER TABLE public.entries
ADD COLUMN search_document tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(era, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(location_name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
) STORED;
CREATE INDEX idx_entries_search_document
  ON public.entries USING GIN(search_document);
```

Evaluate tokenization for Filipino, English, and proper names. `simple` avoids stemming assumptions but is not a complete multilingual search solution. Document title/slug fallback behavior.

```sql
CREATE INDEX idx_entries_origin_geometry
  ON public.entries USING GIST ((origin_location::geometry))
  WHERE origin_location IS NOT NULL;
CREATE INDEX idx_entries_current_geometry
  ON public.entries USING GIST ((current_location::geometry))
  WHERE current_location IS NOT NULL;
CREATE INDEX idx_entries_scope ON public.entries(scope);
CREATE INDEX idx_entries_type ON public.entries(entry_type);
CREATE INDEX idx_entries_start_year ON public.entries(start_year);
```

Verify that spatial query expressions match indexed expressions. Run `EXPLAIN (ANALYZE, BUFFERS)` on representative data. An index definition alone does not prove index usage.

---

# 6. Authentication, Authorization, and RLS

## 6.1 Access model

| Actor | Read public history | Save own progress | Edit historical records | Manage roles |
|---|---:|---:|---:|---:|
| Anonymous visitor | Yes, if public deployment | No | No | No |
| Authenticated user | Yes | Own rows only | No | No |
| Curator/owner | Yes | Own rows only | Yes | Owner-only |

A private single-user deployment may restrict access further. Do not weaken RLS for convenience.

## 6.2 Curator role

Do not trust a client-side boolean, local storage value, or hidden button to grant curator access. Use a server-controlled role claim or a protected role table whose writes are restricted to a trusted administrative operation.

```sql
CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'curator', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

Users must not be able to promote themselves. Role assignment is performed through a trusted owner/admin path. Never expose service-role credentials to the frontend.

## 6.3 RLS requirements

Enable RLS on `entries`, `entry_media`, `entry_links`, `entry_sources`, `user_entry_progress`, and `user_roles`.

Example owner-only progress policies:

```sql
ALTER TABLE public.user_entry_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own progress"
ON public.user_entry_progress FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Insert own progress"
ON public.user_entry_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own progress"
ON public.user_entry_progress FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Delete own progress"
ON public.user_entry_progress FOR DELETE
USING (auth.uid() = user_id);
```

Historical-content policies must allow public or authenticated reads according to deployment choice and restrict writes to curator/owner. Implement and test policies for anonymous, ordinary authenticated, and curator sessions. If using `SECURITY DEFINER`, set a safe `search_path`, restrict execute grants, validate the caller, and document the need.

## 6.4 Security checklist

- RLS enabled on every application table.
- Anonymous users cannot write historical records.
- Ordinary users cannot write historical records.
- Curator writes are database-enforced.
- Users cannot read or update another user's notes.
- Users cannot assign themselves roles.
- Service-role key absent from client code and Git.
- RPC grants explicitly configured.
- External URLs validated.
- Imported content rendered safely as text.
- Errors do not leak credentials or internal secrets.

---

# 7. PostGIS Viewport Search

## 7.1 Requirements

The viewport query must accept bounds; validate coordinate ranges; support normal and antimeridian-wrapped bounds; match origin OR current location; return both coordinate sets; handle nulls; apply scope/type/year filters; use spatial indexes where practical; return deterministic ordering; cap or paginate results; report whether more records exist; respect RLS; and never leak personal progress.

## 7.2 Antimeridian behavior

Normal bounds satisfy `min_lon <= max_lon`. A viewport crossing the International Date Line may have `min_lon > max_lon`. Query two envelopes:

1. `min_lon` through `180`;
2. `-180` through `max_lon`.

Combine results without duplicates. Do not reject wrapped bounds as invalid.

## 7.3 RPC contract

```ts
export interface ViewportQuery {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  scope?: Scope | null;
  entryType?: EntryType | null;
  minYear?: number | null;
  maxYear?: number | null;
  limit?: number;
  offset?: number;
}

export interface ViewportResult {
  entries: HistoricalEntry[];
  hasMore: boolean;
  nextOffset: number | null;
}
```

Implement a complete wrapped-bounds RPC. It must reject invalid latitude/longitude values, permit `min_lon > max_lon`, build one or two envelopes as appropriate, match origin/current coordinates, deduplicate entries, apply filters consistently, sort deterministically, fetch `limit + 1`, and return a stable schema with `hasMore`.

If the display cap is 500, request up to 501 and return no more than 500. Do not infer `hasMore` merely because exactly 500 rows were returned. For offset pagination, maintain deterministic ordering; consider keyset pagination if data volume warrants it.

Do not use dynamic SQL built from user-controlled fragments.

## 7.4 Query-plan verification

Run `EXPLAIN (ANALYZE, BUFFERS)` for origin-only, current-only, both endpoints, normal bounds, wrapped bounds, dense urban bounds, sparse global bounds, and common filter combinations. If an `OR` prevents effective index plans, compare a `UNION` strategy with deduplication. Keep the simplest adequate plan and document measured results.

## 7.5 Personal progress

Keep progress separate from public viewport results. Fetch progress for visible entry IDs using the authenticated session. Never return another user's visited state or notes through a public RPC.

---

# 8. MapLibre Implementation

## 8.1 Lifecycle

- Initialize MapLibre once when the map component mounts.
- Store the map instance in a ref.
- Use OpenFreeMap Liberty or Positron style subject to current availability and terms.
- Register handlers once; remove them and call `map.remove()` on unmount.
- Update GeoJSON sources when data changes.
- Do not recreate the map on ordinary React state updates.
- Call `map.resize()` after pane visibility/width changes.
- Wait for style load before adding custom sources/layers.
- Re-add required sources/layers after style reload, exactly once.
- Check for existing sources/layers before adding them.
- Avoid duplicate listeners.
- Show recoverable style/tile errors.

## 8.2 Suggested source/layer IDs

| Source/layer | Purpose |
|---|---|
| `entries-source` | Origin features |
| `entries-clusters` | Low-zoom cluster circles |
| `entries-cluster-count` | Cluster labels |
| `entries-unclustered` | Individual origin markers |
| `current-locations-source` | Current-location markers |
| `artifact-transfer-source` | Origin-to-current dashed lines |
| `historical-arcs-source` | Active entry's direct connections |
| `active-entry-source` | Selected-entry emphasis |

Feature properties include `entryId`, `locationRole`, `entryType`, and any display metadata required by the layer. Click handlers resolve the canonical ID and location role.

## 8.3 Clustering and marker semantics

Document cluster radius, minimum cluster zoom, maximum cluster zoom, cluster click behavior, overlapping endpoint behavior, current-location distinction, and selected styling. Markers communicate place/artifact, origin/current, and selected/unselected. Do not rely only on color; provide shape/icon distinction and a legend.

## 8.4 Synchronization

**Card selection:** set ID, set role `origin`, open drawer, resolve origin coordinate, fly if valid, highlight card.

**Map selection:** read ID and role, update shared state, open drawer, scroll feed if the card exists, fetch/retain the selected entry if viewport filtering excluded it, highlight card.

**Current pin:** same entry ID, role `current`, fly to current coordinate, drawer remains tied to the entry and labels the current coordinate.

## 8.5 Request race protection

Debouncing alone does not prevent out-of-order responses. Use a 300 ms debounce, monotonically increasing request ID/query generation, AbortController where supported, stale-response checks, latest-request loading state, and cleanup of pending timers/listeners. Only the newest request may replace visible results.

## 8.6 Search-area behavior

- **Search this map area:** results restricted to map bounds.
- **Search entire world:** results independent of viewport.

When global search is active, panning must not issue viewport queries. Global search uses indexed text search and pagination.

## 8.7 Camera/layout

Preserve useful camera position when panes open/close. Resize map after layout changes. Do not zoom to approximate coordinates as if exact. Never use `[0,0]` fallback. Provide reset view and respect reduced motion.

---

# 9. Historical Connections and Geometry

Use `@turf/turf` `greatCircle` when appropriate.

- Render only the active entry and its direct linked records.
- Retrieve incoming and outgoing links.
- Resolve both endpoints.
- Ordinary historical relationships generally connect origin-to-origin.
- Artifact relocation connects origin-to-current.
- Skip missing/invalid coordinates.
- Avoid duplicate rendered lines.
- Replace previous connection data when selection changes.
- Do not render every relationship in the dataset.

Great-circle geometry can cross the International Date Line. Normalize or split geometry before MapLibre rendering so the map does not draw a misleading line across the world. Test short routes, long routes, antimeridian crossings, near-antipodal points, missing coordinates, duplicate rows, and multiple relationship types.

Suggested styles: historical influence (solid curved line), cultural exchange (dashed curved line), political/historical association (separate configurable style), artifact relocation (straight dashed line). Provide a legend and accessible labels; do not communicate meaning by color alone.

---

# 10. Dual-Pin Artifact Tracking

When `entry_type = 'artifact'` and `current_location` is not null, render an origin pin, current holding-location pin, and dashed relocation line.

- Both pins resolve to the same entry ID.
- Preserve `locationRole` on each feature.
- If either endpoint is in the viewport, the entry is eligible for the feed.
- Once eligible, the frontend may render both endpoints even if only one is in bounds.
- Drawer provides Origin Site and Current Location navigation.
- Label which coordinate is selected.
- Do not assume current location means museum.
- Use generic Current Location when institution is unknown.
- Do not draw a transfer line if an endpoint is missing.
- Do not infer relocation date without a source.

---

# 11. Media Gallery and Then-vs-Now Comparator

## 11.1 Gallery

Display active image, thumbnail navigation, caption/year when available, source/creator/license/attribution, lazy-load non-active images, descriptive alt text, and broken-image states. Do not claim an image depicts an exact event unless supported by its source.

## 11.2 Comparison eligibility

Comparison is available only when an entry has at least one `archival` and one `modern` media record and a defensible pair. `unknown` is never treated as modern.

## 11.3 Pairing

Use `comparison_group` to associate images intended to be compared. A curator manually reviews pairings. Do not compare the first archival image with the first modern image by default. A group must contain at least one archival and one modern image. Incomplete groups show Gallery View only.

## 11.4 Slider

Use one shared comparison viewport and a draggable vertical divider. Support pointer, touch, keyboard, reset-to-center, clear Archival/Modern labels, aligned display, attribution for both images, and an accessible control with a clear label/value. Do not imply exact photographic alignment when viewpoints differ.

## 11.5 Media states

Handle loading, unavailable image, incomplete attribution, unknown license, no valid pair, manually selected pair, and differing dimensions. Never invent creator, license, or photo year.

---

# 12. Wikipedia and Wikimedia Importer

## 12.1 Workflow

1. User pastes a supported Wikipedia article URL.
2. Validate URL, protocol, and hostname.
3. Extract language subdomain and article title.
4. Decode URL-encoded titles and normalize underscores/spaces.
5. Request Wikipedia REST page summary.
6. Handle redirects, missing pages, and disambiguation.
7. Retrieve available metadata and coordinates.
8. Retrieve Wikimedia Commons media metadata where applicable.
9. Retrieve creator, attribution, license, and license URL where available.
10. Prefill an editable form.
11. Require human review of classification and historical claims.
12. Check duplicates.
13. Validate all fields.
14. Save entry, media, and source references transactionally.
15. Report success only after the full transaction succeeds.

## 12.2 URL handling

Support configured Wikipedia language subdomains such as `en.wikipedia.org` and `tl.wikipedia.org` where the API supports them. Reject unrelated hosts. Handle encoded titles, underscores, spaces, fragments, redirects, and disambiguation pages. Do not fetch arbitrary user-provided URLs. If a server-side fetch endpoint is introduced, prevent SSRF with strict protocol and hostname allowlists.

## 12.3 Service modules

```text
src/services/import/
  wikipediaService.ts
  wikimediaService.ts
  wikiUrlParser.ts
  wikiValidator.ts
  duplicateDetection.ts
  importPayloadBuilder.ts
```

The modules separate article retrieval, Commons metadata, URL parsing, validation, duplicate checks, and database payload construction.

## 12.4 Editable review fields

The curator can edit title, slug, scope, type, era, start/end year, approximate date, location name, origin coordinates, coordinate precision/source, current artifact location, summary, significance, media period, caption, photo year, source URL, creator/attribution, license/license URL, and historical references. Clearly mark imported suggestions until reviewed.

## 12.5 Duplicate detection

Check exact slug, normalized title, article URL, and optionally title/location similarity. Do not silently overwrite. Show candidates and allow cancellation or continuation with a documented reason.

## 12.6 External content safety

Treat all article text/metadata as untrusted. Render text safely; never inject raw HTML. Validate URLs and supported HTTP/HTTPS image sources. Preserve provenance. Handle rate limits, redirects, missing metadata, network failure, timeouts, and retries with backoff.

## 12.7 Transactional save

Use a trusted server-side operation or carefully secured PostgreSQL RPC that validates caller authorization and payload, inserts entry/media/source records atomically, rolls back on failure, and returns created entry ID/status. Do not perform unrelated frontend inserts and report success after partial failure.

---

# 13. Search and Filtering

Search title, era, location name, and optionally source title. Debounce text input; compose scope/type/year filters; handle null years; avoid loading the entire dataset; paginate or cap results; use indexed backend search as data grows; preserve selected detail state; distinguish empty results from request failure; keep global search independent of viewport; and use deterministic sorting.

Client-side filtering is acceptable only for a small bounded dataset. Do not implement an unbounded all-record fetch and call it scalable.

---

# 14. Personal Notes and Visited Status

Visited status is authenticated-only, upserted by `(user_id, entry_id)`, displays saving/saved/error states, and is private under RLS.

Personal notes use 500–800 ms debounced autosave initially, display Saving/Saved/Failed, avoid writing on every keystroke, preserve unsaved text after transient failure, provide retry, warn before discarding unsaved edits, and remain private. Do not include progress in public entry queries.

---

# 15. Loading, Empty, and Error States

Every data-dependent panel needs explicit states.

**Feed:** initial skeleton, no matching entries, empty viewport, search loading, result cap, pagination, database failure, retry.

**Map:** initializing, style failure, no visible records, selected entry without coordinates, viewport failure, capped results, current location unavailable, style reload.

**Drawer:** no selection, details loading, not found, media unavailable, relationships unavailable, progress unavailable, no sources, coordinate provenance missing.

**Importer:** invalid URL, unsupported host, fetching, not found, redirect, disambiguation, missing metadata, duplicate candidate, validation error, saving, success, failure, rate limit.

Never leave a blank panel that looks broken. Do not expose secrets or internal stack traces in user-facing errors.

---

# 16. Performance and Reliability

| Area | Requirement |
|---|---|
| Map lifecycle | Initialize once and clean up |
| Viewport query | 300 ms debounce and stale-response protection |
| Markers | Native clustering where appropriate |
| Historical arcs | Active entry and direct links only |
| Images | Lazy-load non-active images |
| Search | Debounced indexed backend search as data grows |
| Notes | Debounced autosave |
| Database | Spatial and relational indexes |
| Results | Bounded responses and pagination |
| React | Avoid unnecessary whole-map rerenders |
| Responsive layout | Resize map after pane changes |
| External APIs | Timeouts, rate-limit handling, retry policy |

Proposed test volumes (targets to validate, not guarantees): 1,000 entries for functional tests; 10,000 for performance tests; 100 rapid viewport changes for stale-response stress testing. No stale response may replace newer results. No duplicate MapLibre sources/layers after style reload. No cross-user progress leakage. No partial importer writes after failed transaction. Measure and document actual performance.

---

# 17. Recommended Repository Structure

```text
chronaatlas/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/ci.yml
├── docs/
│   ├── CHRONOATLAS_BLUEPRINT_V2.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   └── DEPLOYMENT.md
├── public/assets/
├── src/
│   ├── app/App.tsx
│   ├── app/providers/
│   ├── app/store/atlasStore.ts
│   ├── components/layout/ThreePaneLayout.tsx
│   ├── components/feed/{DiscoveryFeed,FilterBar,EntryCard,FeedStates}.tsx
│   ├── components/map/{AtlasMap,MapControls,MapLegend}.tsx
│   ├── components/map/{mapLayers,mapFeatures}.ts
│   ├── components/drawer/{ContextDrawer,PhotoGallery,PhotoCompareSlider,LinkedSitesList}.tsx
│   ├── components/importer/{WikiImportDialog,ImportReviewForm}.tsx
│   ├── components/ui/
│   ├── hooks/{useAtlasEntries,useActiveEntry,useMapViewport,useDebounce,usePersonalProgress}.ts
│   ├── services/{entriesService,entryLinksService,mediaService,sourcesService}.ts
│   ├── services/import/
│   ├── lib/{supabase,geoUtils,mapUtils,validators}.ts
│   ├── types/{database,atlas}.ts
│   ├── styles/
│   └── main.tsx
├── supabase/migrations/
├── supabase/seed.sql
├── tests/{unit,components,e2e}/
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── IMPLEMENTATION_PLAN.md
├── README.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Adapt to an existing repository when sensible, but retain clear separation between UI, data access, geospatial utilities, and import services.

---

# 18. Implementation Phases

Do not build the entire application in one unreviewed code-generation pass.

## Phase 0 — Repository audit and plan

Inspect files, scripts, framework, build status, Supabase configuration, migrations, screens, and workflows. Identify missing credentials without printing values. Compare repository with this blueprint and write `IMPLEMENTATION_PLAN.md`.

**Acceptance:** plan records current state, gaps, phases, expected files, migration impact, blockers, and risks. No implementation begins before the plan is complete.

## Phase 1 — Project foundation

Configure React/Vite/TypeScript, Tailwind, Lucide, ESLint, Prettier, environment validation, application shell, responsive layout, and shared loading/error/empty primitives.

**Acceptance:** dev server starts; production build and type check pass; responsive layout works; no secrets committed.

## Phase 2 — Database and security

Create migrations, enable PostGIS, create all tables, constraints, indexes, triggers, RLS, curator authorization, database types, and seed workflow.

**Acceptance:** clean migration and repeatable seed; RLS tests pass for anonymous/user/curator; user A cannot read user B progress; ordinary users cannot edit history; curator writes work.

## Phase 3 — Data services and feed

Implement typed Supabase client, entry list/detail, global indexed search and pagination, filters, cards, feed states, and canonical selection.

**Acceptance:** filters compose; null/approximate dates work; global search independent of viewport; selection retained after filter changes; no unbounded fetch.

## Phase 4 — Map and viewport discovery

Initialize MapLibre once; configure OpenFreeMap; add sources/layers/clusters; add origin/current pins; implement wrapped viewport RPC, race protection, map/feed sync, resize, and cleanup.

**Acceptance:** map works without paid key; origin/current matching and wrapped bounds work; correct role selected; stale requests ignored; no duplicate layers after style reload.

## Phase 5 — Relationships and artifact tracking

Implement incoming/outgoing links, relationship geometry, transfer lines, antimeridian-safe arcs, and legend.

**Acceptance:** directional meaning preserved; multiple types per pair work; no duplicate lines; both artifact pins share ID; missing coordinates do not create misleading lines.

## Phase 6 — Context drawer and media

Implement entry drawer, gallery, attribution, comparison pairing, accessible slider, source references, and private progress.

**Acceptance:** unknown media is not modern; only valid reviewed pairs enable compare; attribution visible; keyboard/touch controls work; progress remains private.

## Phase 7 — Importer

Implement URL parser/allowlist, Wikipedia retrieval, Commons metadata, editable review, duplicate checks, transactional save, and errors/retry.

**Acceptance:** invalid hosts rejected; redirects/disambiguation handled; data editable; source metadata stored; failed writes roll back; imports not treated as verified.

## Phase 8 — Quality

Add unit, component, SQL/RLS, and Playwright tests; responsive/keyboard checks; query-plan review; error/recovery tests; accessibility review.

**Acceptance:** required tests pass; no known critical privacy defect; core workflows work at desktop/mobile sizes; query plans and results documented.

## Phase 9 — Deployment and handoff

Document Supabase setup, environment variables, migrations, seed, GitHub Actions, hosting, free-tier limitations, and release checklist.

**Acceptance:** new developer can run project from README; CI build passes; no secrets exposed; database reproducible; limitations documented.

---

# 19. Testing Strategy

## 19.1 Unit tests

Test slug normalization, Wikipedia URL parsing, BCE/CE formatting, date range validation, coordinate validation, wrapped viewport bounds, location-role camera target, relationship deduplication, media eligibility, duplicate detection, and import payload validation.

## 19.2 Component tests

Test feed filtering, selected card, drawer open/close, gallery navigation, comparison pointer/keyboard behavior, visited toggle, note save states, importer validation, and loading/empty/error states.

## 19.3 Database integration tests

Test clean migrations, constraints, FK cascades, typed relationship duplicates, self-link rejection, progress RLS, curator-only writes, configured public read access, viewport validation, antimeridian results, result cap/`hasMore`, and transactional rollback.

## 19.4 End-to-end critical journey

1. Open ChronoAtlas.
2. Search a seeded entry.
3. Select card and verify map flies to origin.
4. Select map marker and verify drawer/feed sync.
5. Select artifact current pin and verify role is current.
6. Inspect gallery and attribution.
7. Open a related entry.
8. Sign in, mark visited, save a note, reload, and verify persistence.
9. Verify a second test user cannot access the first user's progress.
10. Import a valid Wikipedia article as curator.
11. Verify source/media metadata.
12. Simulate failed import and verify rollback.

## 19.5 Geospatial edge cases

| Case | Expected result |
|---|---|
| Normal viewport | One envelope |
| Wrapped viewport | Two envelopes |
| Origin in bounds | Entry returned |
| Current location in bounds | Entry returned |
| Both endpoints in bounds | Entry returned once |
| Both outside | Entry omitted |
| Both coordinates null | Not mapped |
| Invalid latitude/longitude | Rejected |
| Result cap exceeded | `hasMore = true` |
| Old request returns late | Ignored |
| Current pin selected | Same ID, role current |

## 19.6 Accessibility

Use semantic headings/buttons, visible keyboard focus, keyboard feed/drawer navigation, accessible map controls, non-color-only marker distinctions, keyboard comparison slider, sufficient contrast, reduced-motion support, image alt text, and announcements for important async failures.

---

# 20. GitHub Workflow and Standards

## 20.1 Branches

- `main`: stable verified code.
- `feature/<short-name>`: feature work.
- `fix/<short-name>`: bug fixes.
- `docs/<short-name>`: documentation changes.

Do not commit unfinished experiments directly to `main`.

## 20.2 Commit messages

Use clear conventional commit messages:

```text
feat(map): add antimeridian-aware viewport queries
fix(auth): prevent users from editing curator records
docs: add deployment instructions
test(db): cover progress row-level security
refactor(map): separate GeoJSON feature generation
chore: configure CI workflow
```

Avoid vague messages such as `update`, `changes`, or `final`.

## 20.3 Pull request checklist

Every PR records purpose, requirements addressed, files changed, migration impact, security impact, tests run, screenshots for UI changes, known limitations, and rollback considerations.

## 20.4 GitHub Actions

CI runs on pushes to `main` and pull requests. It installs from the lockfile, checks formatting, lints, type-checks, runs tests, and builds.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --run
      - run: npm run build
```

Adapt Node version and script names to the actual repository and lockfile. Do not reference scripts that have not been added to `package.json`. Database integration tests may run in a separate job using a local Supabase stack. Never print production secrets in CI logs.

## 20.5 `.gitignore`

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode/*
!.vscode/extensions.json
playwright-report/
test-results/
coverage/
```

Do not ignore migrations, seed scripts, docs, or lockfiles.

---

# 21. README and Developer Handoff

Root `README.md` explains what ChronoAtlas is, features, stack, prerequisites, installation, environment setup, local development, tests, migration workflow, seed workflow, build, deployment, security, free-tier caveats, known limitations, and future work. Do not claim deployment or production readiness unless verified.

---

# 22. Data Quality and Historical Integrity

Imported data is a draft until reviewed. Preserve source URLs and access dates. Never invent dates, locations, creators, licenses, or significance. Distinguish approximate/exact dates and coordinates. Allow unknown fields. Show source references in the drawer. Make corrections possible and preserve provenance.

Before publishing, review title, scope, entry type, era, date range and precision, summary, significance, origin coordinate and precision/source, current location if applicable, media classification and pairing, attribution/license, source references, and relationship direction/type.

No false precision: broad archaeological sites may use area centroids; current artifact location may be unknown; photo year may be unknown; historical periods may span years; uncertain relationships must be described as uncertain.

---

# 23. Free-Tier and Operational Limitations

The application is designed to operate without paid APIs for intended personal usage. Free tiers have quotas, storage/bandwidth limits, terms, and possible changes. Do not promise permanent zero cost. Document current relevant limits at deployment time. Debounce requests, lazy-load media, avoid duplicate large image storage, and document backup/export limitations. Do not silently switch to a paid provider if a free provider becomes unavailable; report the issue and request approval for alternatives.

---

# 24. Definition of Done

All applicable criteria must be verified before an initial release.

## Product

- [ ] Three-pane desktop experience works.
- [ ] Tablet/mobile layouts work.
- [ ] Feed/map/drawer share canonical selection state.
- [ ] Places and artifacts are distinguishable.
- [ ] Search and filters compose correctly.
- [ ] Global search is independent of viewport.
- [ ] Viewport query matches origin and current locations.
- [ ] Antimeridian bounds work.
- [ ] Result caps are visible and honest.
- [ ] Incoming/outgoing relationships work.
- [ ] Artifact dual pins and relocation line work.
- [ ] Gallery shows source and attribution.
- [ ] Then-vs-Now uses reviewed pairs only.
- [ ] Importer is editable and transactional.
- [ ] Visited status and notes persist privately.

## Data and security

- [ ] Migrations reproduce database.
- [ ] RLS enabled on all application tables.
- [ ] Ordinary users cannot edit historical content.
- [ ] Curator permissions enforced by database/server.
- [ ] Users cannot access another user's progress.
- [ ] No service-role secret in client code or Git.
- [ ] Source/license metadata preserved.
- [ ] Unknown dates, coordinates, and media periods represented honestly.

## Engineering

- [ ] TypeScript check passes.
- [ ] Lint and formatting pass.
- [ ] Unit/component tests pass.
- [ ] Critical database/RLS tests pass.
- [ ] Critical Playwright workflows pass.
- [ ] Production build passes.
- [ ] Map lifecycle/cleanup verified.
- [ ] Spatial query plans inspected.
- [ ] Loading/error/empty states implemented.
- [ ] README and deployment docs complete.
- [ ] Known limitations documented.

A checkbox may be marked only when evidence exists.

---

# 25. Final Agent Instructions

The implementation agent must:

1. inspect the repository;
2. read this specification completely;
3. write `IMPLEMENTATION_PLAN.md`;
4. identify missing credentials/decisions without exposing secrets;
5. propose the smallest safe implementation sequence;
6. wait for required approval before code or destructive actions;
7. implement phase by phase;
8. add migrations rather than undocumented database edits;
9. add tests with each feature;
10. run format, lint, typecheck, tests, and production build;
11. review security and privacy;
12. update README, CHANGELOG, and status;
13. report `IMPLEMENTED`, `VERIFIED`, `BLOCKED`, and `NOT STARTED` accurately.

Do not claim the project is complete merely because files were generated. Completion requires working workflows and verified Definition of Done criteria.

---

# Appendix A — Agent Completion Report

```text
PHASE:
STATUS: NOT STARTED | IN PROGRESS | BLOCKED | IMPLEMENTED | VERIFIED

COMPLETED:
- ...

FILES CREATED/UPDATED:
- ...

DATABASE MIGRATIONS:
- ...

TESTS RUN:
- ...

TEST RESULTS:
- ...

SECURITY REVIEW:
- ...

KNOWN LIMITATIONS:
- ...

BLOCKERS / REQUIRED DECISIONS:
- ...

NEXT PHASE:
- ...
```

# Appendix B — Human Approval Gates

Request approval before changing the technology stack, introducing a paid provider, making destructive schema changes, deleting user data, running destructive commands against a remote database, changing public/private deployment assumptions, changing curator authorization, publishing imported records without review, or changing product scope.

# Appendix C — Key Engineering Decisions

| Concern | Required decision |
|---|---|
| Selected pin | Track `activeEntryId` and `activeLocationRole` |
| Media classification | `archival`, `modern`, `unknown`, not boolean |
| Media comparison | Explicit manually reviewed `comparison_group` |
| Relationship identity | UUID and unique source/target/type |
| Wrapped viewport | Two-envelope antimeridian-aware query |
| Result cap | Fetch one extra row for `hasMore` |
| Global search | Indexed backend search, independent of viewport |
| User progress | Separate table with owner-only RLS |
| Curator access | Database/server enforced, never frontend-only |
| Dates | Astronomical year numbering, consistently formatted |
| Coordinates | Precision and provenance fields |
| Import writes | Transactional trusted operation or secured RPC |
| Map lifecycle | One instance, explicit cleanup/style reload handling |
| Spatial indexes | Verify with real query plans |
| Cost statement | Free-tier-oriented, not guaranteed permanently free |

**End of ChronoAtlas 2.0 specification.**
