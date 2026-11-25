# ChronoAtlas Security & Privacy Architecture

ChronoAtlas separates public curated historical records from private user progress and enforces access boundaries at the PostgreSQL Row-Level Security (RLS) layer rather than through client UI checks.

---

## 1. Key Handling & Client Trust Model

- **Allowed browser environment variables (`.env.example`):**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` (preferred) or `VITE_SUPABASE_ANON_KEY`
- **Forbidden in browser code & Git:** `SUPABASE_SERVICE_ROLE_KEY`, database passwords, or any secret credential. No privileged secret may ever use a `VITE_` prefix.
- **Not a security boundary:** A Supabase publishable/anon key is shipped to the client bundle intentionally; security relies strictly on RLS policies, `REVOKE`/`GRANT` rules on RPCs, and server/database role enforcement.
- **Offline/local mode:** When `VITE_SUPABASE_URL` and client keys are unconfigured (`authService.ts` returns `mode: "local"`, `role: "local"`), ChronoAtlas runs solely on its local bundled seed dataset and writes user progress (`chronoatlas.progress.v1`) and local curator drafts (`chronoatlas.overlay.v1` in `src/services/localOverlay.ts`) exclusively to the user's browser `localStorage`. In Supabase mode, `authService.ts` reads `public.user_roles` only to reflect UI affordances; all enforcement occurs in PostgreSQL RLS and RPC checks.

---

## 2. Row-Level Security Across All 6 Tables (`supabase/migrations/0001_initial.sql`)

`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` is enabled on every application table:

| Table                        | `SELECT` Policy                            | `INSERT` Policy               | `UPDATE` Policy                                 | `DELETE` Policy               |
| ---------------------------- | ------------------------------------------ | ----------------------------- | ----------------------------------------------- | ----------------------------- |
| `public.entries`             | `true` (`"Public read entries"`)           | `public.is_curator()`         | `public.is_curator()` (`USING` & `WITH CHECK`)  | `public.is_curator()`         |
| `public.entry_media`         | `true` (`"Public read media"`)             | `public.is_curator()`         | `public.is_curator()` (`USING` & `WITH CHECK`)  | `public.is_curator()`         |
| `public.entry_links`         | `true` (`"Public read links"`)             | `public.is_curator()`         | `public.is_curator()` (`USING` & `WITH CHECK`)  | `public.is_curator()`         |
| `public.entry_sources`       | `true` (`"Public read sources"`)           | `public.is_curator()`         | `public.is_curator()` (`USING` & `WITH CHECK`)  | `public.is_curator()`         |
| `public.user_entry_progress` | `auth.uid() = user_id`                     | `auth.uid() = user_id`        | `auth.uid() = user_id` (`USING` & `WITH CHECK`) | `auth.uid() = user_id`        |
| `public.user_roles`          | `auth.uid() = user_id` (`"Read own role"`) | _(No client policy — denied)_ | _(No client policy — denied)_                   | _(No client policy — denied)_ |

### Key Isolation Guarantees

1. **No anonymous or ordinary-user history tampering:** Anonymous visitors and authenticated `viewer` accounts have read-only access to `entries`, `entry_media`, `entry_links`, and `entry_sources`.
2. **Private progress isolation:** A user can read, insert, update, or delete rows in `public.user_entry_progress` only when `auth.uid() = user_id`. Neither `search_viewport` nor public `entries` queries join or expose `user_entry_progress`.
3. **No client self-promotion:** `public.user_roles` exposes only `SELECT` for `auth.uid() = user_id`. Because no `INSERT`, `UPDATE`, or `DELETE` policy exists for client roles, users cannot grant themselves `curator` or `owner` privileges. Role assignment must occur via a trusted administrative SQL path.

---

## 3. `is_curator()` & `SECURITY DEFINER` Pattern

Curator authorization is centralized in `public.is_curator()` (`0001_initial.sql`):

```sql
CREATE OR REPLACE FUNCTION public.is_curator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('owner', 'curator')
  );
$$;

REVOKE ALL ON FUNCTION public.is_curator() FROM public;
GRANT EXECUTE ON FUNCTION public.is_curator() TO anon, authenticated;
```

### Why `SECURITY DEFINER` Is Used & How It Is Hardened

- `user_roles` itself is RLS-protected; `SECURITY DEFINER` lets RLS policies on historical tables evaluate membership without granting broad read access to other users' role rows.
- **`SET search_path = public, pg_temp`** blocks search-path shadowing / object-hijacking attacks.
- **`REVOKE ALL ... FROM public`** restricts execution explicitly to `anon` and `authenticated` roles.
- **`public.search_viewport(...)` (`0001_initial.sql`):** Pins `SET search_path = public, pg_temp`, revokes `PUBLIC` execute, grants only `anon` and `authenticated`, validates numeric coordinate bounds (rejecting `NULL`, latitudes outside `[-90, 90]`, `min_lat > max_lat`, or longitudes outside `[-180, 180]`), and uses parameterized SQL without dynamic SQL string concatenation.
- **`public.search_entries(...)` (`0002_search_and_import.sql`):** Runs as `SECURITY INVOKER` with `SET search_path = public, pg_temp`, escapes `ILIKE` wildcards (`\`, `%`, `_`), and omits personal progress rows; granted to `anon` and `authenticated`.
- **`public.import_historical_entry(p_payload jsonb)` & `public.set_entry_reviewed(p_entry_id uuid, p_reviewed boolean)` (`0002_search_and_import.sql`):** Run as `SECURITY DEFINER` with `SET search_path = public, pg_temp`, revoke `PUBLIC`, grant `EXECUTE` exclusively to `authenticated`, check `public.is_curator()` (`42501` error if unauthorized), validate all URLs/years/coordinates, and roll back the multi-table transaction atomically if any validation fails.

---

## 4. Wikipedia/Wikimedia Importer: XSS, URL Allowlisting & SSRF Defense

ChronoAtlas treats all external Wikipedia/Wikimedia metadata and imported text as untrusted input:

- **Plain-text rendering (XSS defense):** React JSX escapes all interpolated strings (`summary`, `significance`, `caption`, `creator`, `license`, `relationship_label`). `dangerouslySetInnerHTML` and raw HTML rendering are prohibited across `src/`. `sanitizePlainText` (`src/lib/validators.ts`) strips `<script>`/`<style>` blocks, removes HTML tags, decodes named and numeric HTML entities safely without DOM injection, and drops control characters; offline enrichment scripts (`scripts/enrich-unesco.mjs`) likewise strip tags before writing seed modules.
- **URL scheme validation (`src/lib/validators.ts`):** `isSafeExternalUrl` rejects control characters, parses URLs via `new URL(trimmed)`, and permits only `http:` or `https:` with a non-empty hostname—blocking `javascript:`, `data:`, `vbscript:`, or `file:` payloads before Supabase configuration (`src/lib/supabase.ts`), links, or media URLs are persisted or rendered. External anchor tags use `target="_blank" rel="noreferrer"`.
- **Wikipedia host allowlist (SSRF & arbitrary fetch prevention):** `parseWikipediaUrl` and `isAllowedWikipediaHost` (`src/services/import/wikiUrlParser.ts`) accept only language-edition Wikipedia hosts matching `^([a-z]{2,12}(?:-[a-z]{2,12})*)(?:\.m)?\.wikipedia\.org$` (e.g., `en.wikipedia.org`, `tl.wikipedia.org`), block non-content subdomains (`www`, `commons`, `meta`, `api`, `rest`, etc.) and non-article namespaces (`Special:`, `Talk:`, `User:`, etc.), reject embedded credentials, custom ports, and control characters, and normalize fetches to HTTPS `/wiki/` or `/w/index.php?title=` targets. `validateImportPayload` (`src/services/import/wikiValidator.ts`) re-verifies all entry, media, and source URLs via `isSafeExternalUrl`, preventing arbitrary URL fetches or SSRF if a server-side proxy or Edge Function is added.
- **Error hygiene:** UI error banners (`src/components/ui/States.tsx`, `src/components/map/AtlasMap.tsx`) display human-readable recovery messages and never expose stack traces, tokens, or internal database errors.

---

## 5. Verification Status (Important)

- **Implemented & inspected:** All 6 table definitions, RLS policies, `is_curator()`, `search_viewport`, `search_entries`, `import_historical_entry`, `set_entry_reviewed`, and React/validator XSS & URL protections exist in `supabase/migrations/0001_initial.sql`, `supabase/migrations/0002_search_and_import.sql`, `src/lib/validators.ts`, `src/lib/supabase.ts`, and `src/components/`.
- **Live Supabase RLS verification requires a configured Supabase project:** Because this repository currently has no configured `.env` or live Supabase instance (`VITE_SUPABASE_URL` and keys are unset in `.env.example`), automated RLS integration tests across `anon`, ordinary `authenticated`, and `curator` sessions have **not yet been run against a live PostgreSQL/Supabase database**. Verify every policy with a live or local (`supabase start`) database before deploying publicly with Supabase enabled.
