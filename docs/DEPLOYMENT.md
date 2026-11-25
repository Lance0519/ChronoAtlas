# ChronoAtlas Deployment & Operations Guide

ChronoAtlas is a static single-page React + Vite application that runs out-of-the-box against a bundled local dataset and optionally connects to a Supabase + PostGIS project.

---

## 1. Operating Modes & Environment Variables

Reference `.env.example` at the repository root:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Prefer the project's current Supabase publishable key if configured.
# VITE_SUPABASE_PUBLISHABLE_KEY=
```

### Mode Selection

- **Local Mode (Default when `.env` is unset):** No backend credentials required. `npm run dev` and `npm run build` serve the curated Philippine/international seed dataset plus the generated Wikidata/Wikimedia UNESCO corpus, persisting private user notes and local draft edits in browser `localStorage`.
- **Supabase + PostGIS Mode:** Activated when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or fallback `VITE_SUPABASE_ANON_KEY`) are supplied at build/runtime. Enables authenticated user sessions, PostgreSQL/PostGIS `search_viewport` and full-text search RPCs, cross-device private progress, and curator-role database writes.

### Credential Rules

- Never place `SUPABASE_SERVICE_ROLE_KEY`, database passwords, or private tokens in any `VITE_` variable, client source file, or Git commit.
- A publishable/anon key is safe for browser exposure **only** when Row-Level Security (RLS) is enabled and tested on all tables (`docs/SECURITY.md`).

---

## 2. Database Setup, Migrations & Seeding

_Note: Live Supabase credentials are not configured in this repository; perform these steps when provisioning a local (`supabase start`) or hosted Supabase project._

### 2.1 Apply Versioned Migrations

Run migrations in order via the Supabase CLI (`supabase db push` / `supabase migration up`) or `psql`:

1. `supabase/migrations/0001_initial.sql`:
   - Enables `postgis`.
   - Creates `entries`, `user_entry_progress`, `entry_media`, `entry_links`, `entry_sources`, and `user_roles`.
   - Adds `updated_at` triggers, `search_document` `tsvector`, GIN/GiST/B-tree indexes, `is_curator()`, RLS policies, and `search_viewport`.
2. `supabase/migrations/0002_search_and_import.sql`:
   - Adds `idx_entries_title`, `public.search_entries(...)`, `public.import_historical_entry(p_payload jsonb)`, and `public.set_entry_reviewed(p_entry_id uuid, p_reviewed boolean)`.

### 2.2 Load Seed Data

Run `supabase/seed.sql` against the migrated database:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

- Uses `ON CONFLICT (slug) DO NOTHING` and `WHERE NOT EXISTS` guards so re-running is safe.
- Every seeded record starts with `reviewed = false` and requires human verification before being treated as reviewed scholarship.

### 2.3 Assign the Initial Owner / Curator

Because RLS blocks client self-promotion in `public.user_roles`, create your initial account via Supabase Auth and assign the `owner` role from the Supabase Dashboard SQL Editor (or privileged `psql` session):

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<auth-user-uuid>', 'owner')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
```

---

## 3. Refreshing the Local Wikidata / Wikimedia Corpus

To regenerate `src/data/unescoSeed.ts`, `src/data/unescoMedia.ts`, and `public/evidence-placeholder.svg` from Wikidata/Wikipedia/Wikimedia Commons:

```bash
node scripts/fetch-unesco.mjs
node scripts/enrich-unesco.mjs
```

Both scripts pace requests, implement retries with backoff, strip HTML tags to plain text, and record `/evidence-placeholder.svg` when no verified Wikimedia P18 image exists.

---

## 4. Production Build & Static Hosting (`dist/`)

### Build & Local Verification

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

`npm run build` (`tsc -b && vite build`) produces a self-contained static bundle in `dist/`, including `public/robots.txt` and `public/evidence-placeholder.svg`. Preview locally with:

```bash
npm run preview
```

### Static Hosting Providers

`dist/` can be deployed to any static host (Cloudflare Pages, GitHub Pages, Netlify, Vercel, or nginx/Caddy):

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** `22`
- **Environment variables:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (only if deploying with a configured Supabase project).
- **CSP / External origins:** Allow tile/glyph requests to `https://tiles.openfreemap.org`, font requests to `https://fonts.googleapis.com` and `https://fonts.gstatic.com`, media loads from `https://upload.wikimedia.org` / `https://thumb.wikimedia.org`, and (when enabled) your `https://*.supabase.co` project host and Wikipedia/Wikimedia APIs for importer workflows.

---

## 5. Free-Tier Operational Caveats (`CHRONOATLAS_BLUEPRINT_V2.md` §23)

ChronoAtlas is designed around free-tier and open-source infrastructure, which carries operational limits and cannot be guaranteed permanently free:

- **OpenFreeMap (`tiles.openfreemap.org`):** Community-hosted vector tiles and fonts. Subject to upstream uptime, rate limits, or style URL changes; `AtlasMap.tsx` displays a retryable alert when tiles fail to load.
- **Wikipedia & Wikimedia Commons:** APIs enforce rate limits (`HTTP 429`) and standard thumbnail widths (`960px`). ChronoAtlas hotlinks thumbnails with lazy loading instead of mirroring gigabytes of media in Supabase Storage.
- **Supabase Free Tier:** Subject to project pausing after inactivity, 500 MB PostgreSQL storage, monthly egress caps, and Auth MAU limits. Schedule periodic `pg_dump` backups before major imports.
- **Font CDN fallback:** `Crimson Pro` and `Atkinson Hyperlegible` load from Google Fonts with graceful fallback to `Georgia, serif` and `system-ui, sans-serif`.

---

## 6. Release Checklist

Before tagging or deploying a production release:

- [ ] `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test -- --run`, and `npm run build` all pass on CI (Node 22).
- [ ] Playwright headless E2E checks (`npx playwright test`) pass cleanly.
- [ ] No `.env`, service-role keys, or private credentials are present in Git or `dist/`.
- [ ] If Supabase is enabled: all migrations applied cleanly, RLS verified across `anon` / `viewer` / `curator` sessions, cross-user progress isolation confirmed, and `EXPLAIN (ANALYZE, BUFFERS)` checked on spatial/search queries.
- [ ] Draft/imported records retain `reviewed: false` and valid source/license attribution until manually reviewed.
- [ ] `CHANGELOG.md` and known limitations are up to date.
