-- ChronoAtlas initial schema. Apply with the Supabase CLI or psql.
create extension if not exists postgis;

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  scope text not null check (scope in ('local', 'international')),
  entry_type text not null check (entry_type in ('place', 'artifact')),
  era text,
  start_year int,
  end_year int,
  date_is_approximate boolean not null default false,
  location_name text,
  summary text not null,
  significance text,
  origin_location geography(point, 4326),
  current_location geography(point, 4326),
  origin_coordinate_precision text not null default 'unknown'
    check (origin_coordinate_precision in ('exact', 'approximate', 'area_centroid', 'unknown')),
  current_coordinate_precision text
    check (current_coordinate_precision is null or
      current_coordinate_precision in ('exact', 'approximate', 'area_centroid', 'unknown')),
  origin_coordinate_source text,
  current_coordinate_source text,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint valid_year_range check (
    (start_year is null or start_year between -500000 and 2100) and
    (end_year is null or end_year between -500000 and 2100) and
    (start_year is null or end_year is null or end_year >= start_year)
  ),
  constraint current_location_is_artifact
    check (current_location is null or entry_type = 'artifact'),
  constraint current_precision_requires_location
    check (current_location is not null or current_coordinate_precision is null)
);

create table public.user_entry_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  visited boolean not null default false,
  personal_notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);
create index idx_user_entry_progress_entry_id on public.user_entry_progress(entry_id);

create table public.entry_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  image_url text not null,
  source_url text,
  caption text,
  photo_year int,
  media_period text not null default 'unknown'
    check (media_period in ('archival', 'modern', 'unknown')),
  creator text,
  attribution_text text,
  license text,
  license_url text,
  comparison_group text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint valid_photo_year check (photo_year is null or photo_year between -500000 and 2100)
);
create index idx_entry_media_entry_id on public.entry_media(entry_id);
create index idx_entry_media_comparison on public.entry_media(entry_id, comparison_group, media_period);

create table public.entry_links (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.entries(id) on delete cascade,
  target_id uuid not null references public.entries(id) on delete cascade,
  relationship_type text not null,
  relationship_label text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint no_self_link check (source_id <> target_id),
  constraint unique_typed_link unique (source_id, target_id, relationship_type)
);
create index idx_entry_links_source_id on public.entry_links(source_id);
create index idx_entry_links_target_id on public.entry_links(target_id);

create table public.entry_sources (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  source_title text not null,
  source_url text not null,
  publisher text,
  author text,
  publication_year int,
  accessed_at timestamptz not null default now(),
  source_type text,
  notes text
);
create index idx_entry_sources_entry_id on public.entry_sources(entry_id);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'curator', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entries_set_updated_at before update on public.entries
  for each row execute function public.set_updated_at();
create trigger progress_set_updated_at before update on public.user_entry_progress
  for each row execute function public.set_updated_at();

alter table public.entries
  add column search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(era, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(location_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
  ) stored;
create index idx_entries_search_document on public.entries using gin(search_document);
create index idx_entries_origin_geometry on public.entries using gist ((origin_location::geometry)) where origin_location is not null;
create index idx_entries_current_geometry on public.entries using gist ((current_location::geometry)) where current_location is not null;
create index idx_entries_scope on public.entries(scope);
create index idx_entries_type on public.entries(entry_type);
create index idx_entries_start_year on public.entries(start_year);

-- Curator check lives in the database; a client-side flag is never trusted.
create or replace function public.is_curator()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('owner', 'curator')
  );
$$;
revoke all on function public.is_curator() from public;
grant execute on function public.is_curator() to anon, authenticated;

alter table public.entries enable row level security;
alter table public.entry_media enable row level security;
alter table public.entry_links enable row level security;
alter table public.entry_sources enable row level security;
alter table public.user_entry_progress enable row level security;
alter table public.user_roles enable row level security;

create policy "Public read entries" on public.entries for select using (true);
create policy "Public read media" on public.entry_media for select using (true);
create policy "Public read links" on public.entry_links for select using (true);
create policy "Public read sources" on public.entry_sources for select using (true);

create policy "Curator insert entries" on public.entries for insert with check (public.is_curator());
create policy "Curator update entries" on public.entries for update using (public.is_curator()) with check (public.is_curator());
create policy "Curator delete entries" on public.entries for delete using (public.is_curator());
create policy "Curator insert media" on public.entry_media for insert with check (public.is_curator());
create policy "Curator update media" on public.entry_media for update using (public.is_curator()) with check (public.is_curator());
create policy "Curator delete media" on public.entry_media for delete using (public.is_curator());
create policy "Curator insert links" on public.entry_links for insert with check (public.is_curator());
create policy "Curator update links" on public.entry_links for update using (public.is_curator()) with check (public.is_curator());
create policy "Curator delete links" on public.entry_links for delete using (public.is_curator());
create policy "Curator insert sources" on public.entry_sources for insert with check (public.is_curator());
create policy "Curator update sources" on public.entry_sources for update using (public.is_curator()) with check (public.is_curator());
create policy "Curator delete sources" on public.entry_sources for delete using (public.is_curator());

create policy "Read own progress" on public.user_entry_progress for select using (auth.uid() = user_id);
create policy "Insert own progress" on public.user_entry_progress for insert with check (auth.uid() = user_id);
create policy "Update own progress" on public.user_entry_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own progress" on public.user_entry_progress for delete using (auth.uid() = user_id);
create policy "Read own role" on public.user_roles for select using (auth.uid() = user_id);

-- Wrapped-bounds viewport search. Returns one extra row so the client can report hasMore.
create or replace function public.search_viewport(
  p_min_lat double precision,
  p_min_lon double precision,
  p_max_lat double precision,
  p_max_lon double precision,
  p_scope text default null,
  p_entry_type text default null,
  p_min_year int default null,
  p_max_year int default null,
  p_limit int default 500,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_envelopes jsonb;
  v_rows jsonb;
  v_count int;
begin
  if p_min_lat is null or p_max_lat is null or p_min_lon is null or p_max_lon is null
     or p_min_lat < -90 or p_max_lat > 90 or p_min_lat > p_max_lat
     or p_min_lon < -180 or p_max_lon > 180 then
    raise exception 'Invalid viewport bounds';
  end if;

  if p_min_lon <= p_max_lon then
    v_envelopes := jsonb_build_array(jsonb_build_object(
      'minLon', p_min_lon, 'maxLon', p_max_lon, 'minLat', p_min_lat, 'maxLat', p_max_lat));
  else
    v_envelopes := jsonb_build_array(
      jsonb_build_object('minLon', p_min_lon, 'maxLon', 180, 'minLat', p_min_lat, 'maxLat', p_max_lat),
      jsonb_build_object('minLon', -180, 'maxLon', p_max_lon, 'minLat', p_min_lat, 'maxLat', p_max_lat));
  end if;

  with matched as (
    select distinct e.*
    from public.entries e
    where (p_scope is null or e.scope = p_scope)
      and (p_entry_type is null or e.entry_type = p_entry_type)
      and (p_min_year is null or coalesce(e.end_year, e.start_year, 2100) >= p_min_year)
      and (p_max_year is null or coalesce(e.start_year, -500000) <= p_max_year)
      and (
        exists (
          select 1 from jsonb_array_elements(v_envelopes) env
          where e.origin_location is not null
            and st_intersects(
              e.origin_location::geometry,
              st_makeenvelope((env->>'minLon')::float8, (env->>'minLat')::float8,
                (env->>'maxLon')::float8, (env->>'maxLat')::float8, 4326))
        )
        or exists (
          select 1 from jsonb_array_elements(v_envelopes) env
          where e.current_location is not null
            and st_intersects(
              e.current_location::geometry,
              st_makeenvelope((env->>'minLon')::float8, (env->>'minLat')::float8,
                (env->>'maxLon')::float8, (env->>'maxLat')::float8, 4326))
        )
      )
    order by e.title, e.id
    limit v_limit + 1 offset v_offset
  ), page as (
    select * from matched order by title, id limit v_limit
  )
  select jsonb_agg(
    jsonb_build_object(
      'id', p.id, 'title', p.title, 'slug', p.slug, 'scope', p.scope,
      'entryType', p.entry_type, 'era', p.era, 'startYear', p.start_year,
      'endYear', p.end_year, 'dateIsApproximate', p.date_is_approximate,
      'locationName', p.location_name, 'summary', p.summary, 'significance', p.significance,
      'origin', case when p.origin_location is null then null else jsonb_build_object(
        'latitude', st_y(p.origin_location::geometry), 'longitude', st_x(p.origin_location::geometry)) end,
      'current', case when p.current_location is null then null else jsonb_build_object(
        'latitude', st_y(p.current_location::geometry), 'longitude', st_x(p.current_location::geometry)) end,
      'originPrecision', p.origin_coordinate_precision,
      'currentPrecision', p.current_coordinate_precision,
      'originSource', p.origin_coordinate_source,
      'currentSource', p.current_coordinate_source,
      'reviewed', p.reviewed
    ) order by p.title, p.id
  ) into v_rows from page p;

  select count(*) into v_count from matched;
  v_rows := coalesce(v_rows, '[]'::jsonb);

  return jsonb_build_object(
    'entries', v_rows,
    'hasMore', v_count > v_limit,
    'nextOffset', case when v_count > v_limit then v_offset + v_limit else null end
  );
end;
$$;

revoke all on function public.search_viewport(
  double precision, double precision, double precision, double precision,
  text, text, int, int, int, int) from public;
grant execute on function public.search_viewport(
  double precision, double precision, double precision, double precision,
  text, text, int, int, int, int) to anon, authenticated;
