# ChronoAtlas Testing Strategy

ChronoAtlas combines static analysis, Vitest unit/component tests, Playwright end-to-end browser verification, and PostgreSQL/PostGIS RLS test expectations.

---

## 1. Quality Commands (`package.json`)

| Check                  | Command                 | Tooling                                        |
| ---------------------- | ----------------------- | ---------------------------------------------- |
| Formatting             | `npm run format:check`  | Prettier (`prettier --check .`)                |
| Linting                | `npm run lint`          | ESLint 9 + `typescript-eslint` + `react-hooks` |
| Type Checking          | `npm run typecheck`     | TypeScript (`tsc -b --noEmit`)                 |
| Unit & Component Tests | `npm run test -- --run` | Vitest 3.2 + jsdom + React Testing Library 16  |
| Production Build       | `npm run build`         | `tsc -b && vite build`                         |
| E2E Browser Tests      | `npx playwright test`   | Playwright Test (`@playwright/test`)           |

---

## 2. Vitest Unit & Component Suites

Test configuration lives in `vite.config.ts` / `vitest.config` (`environment: "jsdom"`, `globals: true`, `setupFiles: ["./tests/setup.ts"]`). `tests/setup.ts` installs an in-memory `localStorage` shim and registers `afterEach(cleanup)`.

### 2.1 Baseline Unit & Component Suites (`tests/atlas.test.ts`, `tests/feed.test.tsx`)

- **`tests/atlas.test.ts` (14 unit tests):**
  - **Astronomical date & coordinate formatting:** Verifies `formatYear` (`-499` -> `500 BCE`, `0` -> `1 BCE`, `1` -> `1 CE`, `null` -> `Date unknown`), `formatYearRange` approximate prefix (`c. 3001 BCE – 1501 BCE`), and `formatCoordinate` precision qualifiers.
  - **Viewport envelopes:** Verifies `buildViewportEnvelopes` splits antimeridian-wrapped bounds (`minLon: 170, maxLon: -170`) into `[170, 180]` and `[-180, -170]`, rejects impossible bounds (`minLat > maxLat`), and verifies `entryInAnyBounds` matches an artifact when `current` lies inside bounds even if `origin` does not.
  - **Media comparison eligibility:** Verifies `getComparisonPair` requires both `"archival"` and `"modern"` items in the same `comparisonGroup` (`"unknown"` never qualifies as modern).
  - **Canonical state & URL filters:** Verifies `atlasReducer` preserves `activeEntryId` across filter updates and `filtersFromUrl` parses `q`, `scope`, `type`, `from`, and `area`.
  - **Dataset integrity & services:** Verifies `normalizeSlug`, confirms every record in `seedEntries` and `unescoEntries` has a non-placeholder summary and at least one `MediaItem`, validates the `500`-entry local result cap, verifies composed filters, and tests non-destructive `patchProgress` merging. _(Note: After `entriesService.ts` switched `unescoSeed` / `unescoMedia` to lazy loading via `ensureExtendedCorpusLoaded()`, synchronous UNESCO assertions in `atlas.test.ts` await Wave 3 test alignment.)_
- **`tests/feed.test.tsx` (2 component tests):**
  - Selecting a card updates `AtlasProvider` canonical state (`e-intramuros origin`) without duplicate feed selection state.
  - Empty viewport state displays `"No records in this view"`.

### 2.2 Planned Unit & Component Expansion (`IMPLEMENTATION_PLAN.md` Phase 3)

- Great-circle arc splitting across the antimeridian, antipodal guards, and `artifact_relocation` vs historical arc feature generation (`mapFeatures.ts`).
- Wikipedia URL parser/host allowlist rejection, duplicate candidate detection (`exact_slug`, `normalized_title`, `source_url`, `location_similarity`), and import payload validation.
- `PhotoCompare` slider keyboard arrows, touch/pointer drag, and reset button.
- Debounced personal notes autosave (`Saving…` / `Saved` / `Failed` / retry) and unsaved-edit warning.

---

## 3. Geospatial & Antimeridian Test Matrix (`CHRONOATLAS_BLUEPRINT_V2.md` §19.5)

| Scenario                                        | Expected Behavior                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Normal bounds (`minLon <= maxLon`)              | Single bounding envelope                                                                   |
| Wrapped antimeridian bounds (`minLon > maxLon`) | Two envelopes (`[minLon, 180]` and `[-180, maxLon]`)                                       |
| Origin inside bounds                            | Entry included                                                                             |
| Current artifact location inside bounds         | Entry included                                                                             |
| Both endpoints inside bounds                    | Entry returned **once** (deduplicated)                                                     |
| Both endpoints outside bounds                   | Entry omitted                                                                              |
| Both coordinates `null`                         | Excluded from map bounds; discoverable in global search; no `[0, 0]` fallback              |
| Invalid latitude/longitude or `minLat > maxLat` | Rejected (`[]` in `lib/geo.ts`, exception in `search_viewport`)                            |
| Result cap exceeded                             | `limit + 1` query returns capped `entries` and `hasMore = true`                            |
| Out-of-order async responses                    | Older request ignored via monotonic `generation` counter                                   |
| Current pin clicked                             | `activeEntryId` unchanged/set, `activeLocationRole = "current"`, camera flies to `current` |
| Antimeridian great-circle arc                   | `greatCircleSegments` splits `LineString` whenever `\|Δlon\| > 180°`                       |
| Degenerate coincident / antipodal endpoints     | Handled safely without `NaN` or broken geometry                                            |

---

## 4. Playwright End-to-End Suite

`@playwright/test` is configured as a dev dependency (`^1.65.1`) and wired into `.github/workflows/ci.yml` (`npx playwright install --with-deps chromium` + `npx playwright test`). Wave 3 (`IMPLEMENTATION_PLAN.md`) introduces `playwright.config.ts` and `tests/e2e/chronoatlas.spec.ts` covering:

1. **Core workspace & responsive viewports:** Desktop three-pane (`1440px`), tablet overlay drawer (`768px`), and mobile map-first bottom navigation (`375px`) with selection persistence across resizes.
2. **Discovery & filtering:** Text search, Scope (`Local` / `International`), Type (`Places` / `Artifacts`), year range, `Search this map area` toggle, and URL query sync.
3. **Artifact dual-pin tracking:** Selecting a relocated artifact (`Spoliarium`), toggling `Go to origin` and `Go to current location`, and verifying role updates.
4. **Media & Then-vs-Now comparison:** Gallery thumbnail switching, attribution rendering, and slider keyboard/pointer interaction for entries with valid archival/modern pairs.
5. **Relationships & private progress:** Navigating linked entries via `ContextDrawer`, toggling `Marked as visited`, editing notes, and verifying reload persistence.
6. **Importer validation & review:** Rejecting disallowed non-Wikipedia hosts, previewing/editing mocked Wikipedia import drafts, and verifying non-destructive local/rollback behavior.

_CI resilience note:_ E2E specs should stub external OpenFreeMap tile/style and Wikipedia/Wikimedia network requests so headless Chromium tests remain deterministic offline and in GitHub Actions.

---

## 5. SQL, RLS & Query-Plan Test Expectations (Supabase / PostgreSQL)

Live database tests require a configured local (`supabase start`) or staging Supabase PostgreSQL instance with `supabase/migrations/` and `supabase/seed.sql` applied. **No live Supabase credentials exist in this repository yet, so these checks are not currently executed in CI.** When a database instance is provisioned, verify:

1. **Clean migration & idempotent seed:** Apply `0001_initial.sql` (and `0002_search_and_import.sql` when present) followed by `supabase/seed.sql` twice without error.
2. **Constraint enforcement:** Confirm rejection of uppercase/invalid slugs, `end_year < start_year`, `current_location` on `entry_type = 'place'`, `current_coordinate_precision` without `current_location`, self-links (`source_id = target_id`), and duplicate `(source_id, target_id, relationship_type)`.
3. **RLS matrix across 3 actors (`anon`, ordinary `authenticated`, `curator`/`owner`):**
   - `anon` and ordinary authenticated users can `SELECT` public historical tables (`entries`, `entry_media`, `entry_links`, `entry_sources`) and are denied (`42501` / 0 affected rows) on `INSERT`, `UPDATE`, and `DELETE`.
   - User A can `INSERT`/`SELECT`/`UPDATE`/`DELETE` their own `user_entry_progress` rows and receives zero rows / error when attempting to read or mutate User B's rows.
   - Ordinary users and curators cannot `INSERT`/`UPDATE` `user_roles` to escalate privileges.
   - Curator users succeed on historical record writes and transactional import RPCs.
4. **`search_viewport` & query-plan checks:**
   - Test normal bounds, wrapped antimeridian bounds, origin-only/current-only/both matches, invalid bounds error, and `limit + 1` `hasMore` reporting.
   - Run `EXPLAIN (ANALYZE, BUFFERS)` on representative spatial (`idx_entries_origin_geometry`, `idx_entries_current_geometry`) and full-text (`idx_entries_search_document`) queries to confirm index usage.
