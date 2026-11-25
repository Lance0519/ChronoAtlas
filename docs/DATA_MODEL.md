# ChronoAtlas Data Model

ChronoAtlas models historical places, movable artifacts, directional historical relationships, attributed media, bibliographic/web sources, curator roles, and isolated personal user progress. The authoritative schema is defined in `supabase/migrations/0001_initial.sql` and mirrored in TypeScript by `src/types/atlas.ts`.

---

## 1. Astronomical Year Numbering (`CHRONOATLAS_BLUEPRINT_V2.md` §5.1)

To avoid arithmetic discontinuity across the missing historical year zero and allow continuous integer sorting and range filtering, ChronoAtlas stores all years using **astronomical year numbering**:

| Historical Date | Stored Integer (`start_year` / `end_year` / `photo_year`) | Display Output (`formatYear`) |
| --------------- | --------------------------------------------------------- | ----------------------------- |
| 3001 BCE        | `-3000`                                                   | `3001 BCE`                    |
| 500 BCE         | `-499`                                                    | `500 BCE`                     |
| 1 BCE           | `0`                                                       | `1 BCE`                       |
| 1 CE            | `1`                                                       | `1 CE`                        |
| 2026 CE         | `2026`                                                    | `2026 CE`                     |
| Unknown         | `NULL`                                                    | `Date unknown`                |

- **Conversion rule (`src/lib/format.ts`):** `year <= 0 ? "${1 - year} BCE" : "${year} CE"`.
- **Uncertainty:** `date_is_approximate` (`boolean`) prefixes `"c. "` in UI formatting (`formatYearRange`). `NULL` always means unknown—never `0`.
- **Database bounds:** `start_year`, `end_year`, and `photo_year` are constrained to `BETWEEN -500000 AND 2100`, with `end_year >= start_year` enforced when both are present.

---

## 2. Entity-Relationship Overview

```text
auth.users (Supabase Auth)
  ├──< public.user_entry_progress (PK: user_id, entry_id)  [private per user]
  └─── public.user_roles          (PK: user_id)            [owner | curator | viewer]

public.entries (PK: id)
  ├──< public.entry_media         (FK: entry_id -> entries.id CASCADE)
  ├──< public.entry_sources       (FK: entry_id -> entries.id CASCADE)
  ├──< public.entry_links         (FK: source_id -> entries.id CASCADE)
  └──< public.entry_links         (FK: target_id -> entries.id CASCADE)
```

---

## 3. PostgreSQL / PostGIS Tables (`supabase/migrations/0001_initial.sql`)

PostGIS is enabled at the top of the initial migration (`CREATE EXTENSION IF NOT EXISTS postgis;`).

### 3.1 `public.entries` (`HistoricalEntry` in `src/types/atlas.ts`)

| Column                         | SQL Type                 | Constraints / Default                                                             | TypeScript Field                  |
| ------------------------------ | ------------------------ | --------------------------------------------------------------------------------- | --------------------------------- |
| `id`                           | `uuid`                   | `PRIMARY KEY DEFAULT gen_random_uuid()`                                           | `id`                              |
| `title`                        | `text`                   | `NOT NULL`                                                                        | `title`                           |
| `slug`                         | `text`                   | `NOT NULL UNIQUE`, `CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`                    | `slug`                            |
| `scope`                        | `text`                   | `NOT NULL CHECK (scope IN ('local', 'international'))`                            | `scope` (`Scope`)                 |
| `entry_type`                   | `text`                   | `NOT NULL CHECK (entry_type IN ('place', 'artifact'))`                            | `entryType` (`EntryType`)         |
| `era`                          | `text`                   | Nullable                                                                          | `era`                             |
| `start_year`                   | `int`                    | Nullable, `-500000..2100`                                                         | `startYear`                       |
| `end_year`                     | `int`                    | Nullable, `-500000..2100`, `>= start_year`                                        | `endYear`                         |
| `date_is_approximate`          | `boolean`                | `NOT NULL DEFAULT false`                                                          | `dateIsApproximate`               |
| `location_name`                | `text`                   | Nullable                                                                          | `locationName`                    |
| `summary`                      | `text`                   | `NOT NULL`                                                                        | `summary`                         |
| `significance`                 | `text`                   | Nullable                                                                          | `significance`                    |
| `origin_location`              | `geography(point, 4326)` | Nullable                                                                          | `origin` (`Coordinates \| null`)  |
| `current_location`             | `geography(point, 4326)` | Nullable, `CHECK (current_location IS NULL OR entry_type = 'artifact')`           | `current` (`Coordinates \| null`) |
| `origin_coordinate_precision`  | `text`                   | `NOT NULL DEFAULT 'unknown'` (`exact \| approximate \| area_centroid \| unknown`) | `originPrecision`                 |
| `current_coordinate_precision` | `text`                   | Nullable, requires `current_location IS NOT NULL`                                 | `currentPrecision`                |
| `origin_coordinate_source`     | `text`                   | Nullable provenance URL/note                                                      | `originSource`                    |
| `current_coordinate_source`    | `text`                   | Nullable provenance URL/note                                                      | `currentSource`                   |
| `reviewed`                     | `boolean`                | `NOT NULL DEFAULT false`                                                          | `reviewed`                        |
| `search_document`              | `tsvector`               | `GENERATED ALWAYS AS (...) STORED`                                                | _(DB search index)_               |
| `created_at`                   | `timestamptz`            | `NOT NULL DEFAULT now()`                                                          | —                                 |
| `updated_at`                   | `timestamptz`            | `NOT NULL DEFAULT now()` (trigger-maintained)                                     | —                                 |

#### Coordinate Precision Semantics

- `exact`: Supported by a specific authoritative site coordinate.
- `approximate`: Approximate position supported by a source.
- `area_centroid`: Representative point for a large district, landscape, or archaeological zone (e.g., Intramuros, Banaue Rice Terraces).
- `unknown`: Coordinate precision has not been verified yet (default for bulk Wikidata/Wikipedia imports).
- **Null coordinates:** Records with unknown geography store `NULL` instead of `[0, 0]`; viewport queries match non-null `origin_location` or `current_location` while global text search keeps unlocated records discoverable.

### 3.2 `public.entry_media` (`MediaItem` in `src/types/atlas.ts`)

| Column             | SQL Type      | Notes & Constraints                                                                    |
| ------------------ | ------------- | -------------------------------------------------------------------------------------- |
| `id`               | `uuid`        | `PRIMARY KEY DEFAULT gen_random_uuid()`                                                |
| `entry_id`         | `uuid`        | `NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE`                             |
| `image_url`        | `text`        | `NOT NULL`                                                                             |
| `source_url`       | `text`        | Source page (e.g., Wikimedia Commons `File:` page)                                     |
| `caption`          | `text`        | Descriptive caption / alt text                                                         |
| `photo_year`       | `int`         | `CHECK (photo_year IS NULL OR photo_year BETWEEN -500000 AND 2100)`                    |
| `media_period`     | `text`        | `NOT NULL DEFAULT 'unknown' CHECK (media_period IN ('archival', 'modern', 'unknown'))` |
| `creator`          | `text`        | Photographer or artist name when stated                                                |
| `attribution_text` | `text`        | Required credit line when applicable                                                   |
| `license`          | `text`        | License short name (e.g., `CC BY-SA 4.0`, `CC0`, `Public domain`)                      |
| `license_url`      | `text`        | Direct license deed URL                                                                |
| `comparison_group` | `text`        | Manually curated pairing identifier for Then-vs-Now comparisons                        |
| `display_order`    | `int`         | `NOT NULL DEFAULT 0`                                                                   |
| `created_at`       | `timestamptz` | `NOT NULL DEFAULT now()`                                                               |

**Why `media_period` is three-valued (`archival | modern | unknown`):** A boolean `is_archival` flag cannot distinguish confirmed modern photography from unverified/undated imports. `getComparisonPair` in `src/lib/media.ts` only activates the slider when a single `comparison_group` contains at least one `archival` and one `modern` item; `unknown` never substitutes for `modern`.

### 3.3 `public.entry_links` (`EntryLink` / `DirectedEntryLink`)

| Column               | SQL Type      | Notes & Constraints                                        |
| -------------------- | ------------- | ---------------------------------------------------------- |
| `id`                 | `uuid`        | `PRIMARY KEY DEFAULT gen_random_uuid()`                    |
| `source_id`          | `uuid`        | `NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE` |
| `target_id`          | `uuid`        | `NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE` |
| `relationship_type`  | `text`        | `NOT NULL`                                                 |
| `relationship_label` | `text`        | `NOT NULL`                                                 |
| `description`        | `text`        | Nullable explanatory note                                  |
| `created_at`         | `timestamptz` | `NOT NULL DEFAULT now()`                                   |

- **Constraints:** `no_self_link CHECK (source_id <> target_id)` and `unique_typed_link UNIQUE (source_id, target_id, relationship_type)`. Multiple distinct relationship types may connect the same pair of entries because `id` is a surrogate UUID.
- **Controlled TypeScript `RelationshipType` union (`src/types/atlas.ts`):** `historical_influence`, `cultural_exchange`, `political_association`, `same_event`, `successor`, `predecessor`, `related_site`, `artifact_origin`, `artifact_relocation`, `other`.
- **Directionality:** Links are directional from `source_id` to `target_id`. `getLinks` attaches `direction: "out" | "in"` so the Context Drawer preserves exact historical direction without inverting relationship labels.

### 3.4 `public.entry_sources` (`SourceRef`)

Stores provenance per entry: `id`, `entry_id` (FK cascade), `source_title`, `source_url`, `publisher`, `author`, `publication_year`, `accessed_at`, `source_type`, and `notes`.

### 3.5 `public.user_entry_progress` (`PersonalProgress`)

| Column           | SQL Type              | Constraints                                                |
| ---------------- | --------------------- | ---------------------------------------------------------- |
| `user_id`        | `uuid`                | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`     |
| `entry_id`       | `uuid`                | `NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE` |
| `visited`        | `boolean`             | `NOT NULL DEFAULT false`                                   |
| `personal_notes` | `text`                | `NOT NULL DEFAULT ''`                                      |
| `updated_at`     | `timestamptz`         | `NOT NULL DEFAULT now()` (trigger-maintained)              |
| **Primary Key**  | `(user_id, entry_id)` | Composite key; strictly private under RLS                  |

### 3.6 `public.user_roles` (`AppRole`)

Maps `user_id` (`uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`) to `role` (`'owner' | 'curator' | 'viewer'`).

---

## 4. Triggers, Search & Spatial Indexes (`0001_initial.sql`)

### 4.1 Triggers

- `public.set_updated_at()` refreshes `NEW.updated_at = NOW()` before every `UPDATE` on `public.entries` (`entries_set_updated_at`) and `public.user_entry_progress` (`progress_set_updated_at`).

### 4.2 Full-Text Search (GIN)

`public.entries.search_document` is a generated stored `tsvector` weighting title (`A`), era (`B`), location name (`B`), and summary (`C`) with the `'simple'` dictionary (avoiding English-only stemming distortions for Tagalog/Filipino and proper place names):

```sql
CREATE INDEX idx_entries_search_document ON public.entries USING gin(search_document);
```

### 4.3 Spatial Indexes (Partial GiST)

Because `entries` uses `geography(point, 4326)` while `search_viewport` evaluates `st_intersects(location::geometry, st_makeenvelope(..., 4326))`, the migration defines partial functional GiST indexes on the exact `::geometry` cast expressions:

```sql
CREATE INDEX idx_entries_origin_geometry
  ON public.entries USING gist ((origin_location::geometry))
  WHERE origin_location IS NOT NULL;

CREATE INDEX idx_entries_current_geometry
  ON public.entries USING gist ((current_location::geometry))
  WHERE current_location IS NOT NULL;
```

### 4.4 Supporting B-Tree Indexes

- `idx_entries_scope` on `entries(scope)`
- `idx_entries_type` on `entries(entry_type)`
- `idx_entries_start_year` on `entries(start_year)`
- `idx_user_entry_progress_entry_id` on `user_entry_progress(entry_id)`
- `idx_entry_media_entry_id` and `idx_entry_media_comparison` on `entry_media`
- `idx_entry_links_source_id` and `idx_entry_links_target_id` on `entry_links`
- `idx_entry_sources_entry_id` on `entry_sources`

---

## 5. Database RPCs & Migrations (`0001_initial.sql` & `0002_search_and_import.sql`)

- **`public.search_viewport(...)` (`0001_initial.sql`):** Accepts bounds, optional `scope`, `entry_type`, `min_year`, `max_year`, `limit` (clamped `1..500`), and `offset`. Validates coordinate bounds, splits wrapped antimeridian longitudes (`min_lon > max_lon`) into two envelopes, matches non-null `origin_location` OR `current_location`, deduplicates, orders deterministically by `(title, id)`, and fetches `limit + 1` rows to return `{ entries, hasMore, nextOffset }` without personal progress fields (`SearchViewportResult` in `src/types/database.ts`).
- **`idx_entries_title` & `public.search_entries(...)` (`0002_search_and_import.sql`):** `SECURITY INVOKER` global search independent of map viewport. Uses `websearch_to_tsquery('simple', v_query)` against `search_document` (GIN) plus escaped `ILIKE` matching on `title`, `slug`, `era`, `location_name`, and `entry_sources.source_title`, sorting by `(search_rank desc, title asc, id asc)` and returning `SearchEntriesResult` (`{ entries, hasMore, nextOffset, totalMatched }`).
- **`public.import_historical_entry(p_payload jsonb)` (`0002_search_and_import.sql`):** Curator-only (`public.is_curator()`) `SECURITY DEFINER` RPC that validates payload constraints (slug, scope, `entryType`, astronomical years, coordinates, `artifact`-only `current` location, HTTP/HTTPS URLs, `archival | modern | unknown` media periods) and atomically inserts `entries`, `entry_media`, and `entry_sources` in a single transaction, returning `RpcHistoricalEntry`.
- **`public.set_entry_reviewed(p_entry_id uuid, p_reviewed boolean)` (`0002_search_and_import.sql`):** Curator-only (`public.is_curator()`) RPC updating `entries.reviewed` and returning `SetEntryReviewedResult` (`{ id, reviewed }`).
- **Query-plan verification note:** `EXPLAIN (ANALYZE, BUFFERS)` verification across dense/sparse/wrapped and full-text queries remains pending until a live PostgreSQL/Supabase environment is provisioned.
