-- ChronoAtlas incremental migration: global full-text search, transactional curator import,
-- and review-status mutation RPCs. Apply after 0001_initial.sql.

create index if not exists idx_entries_title on public.entries (title, id);

-- Global indexed search across title, era, location_name, summary (GIN tsvector),
-- plus ILIKE fallback for partial matches, proper names, Filipino terms, slug, and source titles.
-- Never touches or returns user_entry_progress.
create or replace function public.search_entries(
  p_query text default null,
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
security invoker
set search_path = public, pg_temp
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_scope text := case
    when p_scope is null or trim(p_scope) = '' or p_scope = 'all' then null
    else trim(p_scope)
  end;
  v_entry_type text := case
    when p_entry_type is null or trim(p_entry_type) = '' or p_entry_type = 'all' then null
    else trim(p_entry_type)
  end;
  v_like text;
  v_tsquery tsquery;
  v_rows jsonb;
  v_window_count int;
  v_total_matched int;
begin
  if v_query is not null then
    v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_tsquery := websearch_to_tsquery('simple', v_query);
  end if;

  with filtered as (
    select
      e.*,
      case
        when v_query is null then 0.0::real
        else (
          case when e.title ilike v_like escape '\' then 2.0 else 0.0 end
          + coalesce(ts_rank(e.search_document, v_tsquery), 0.0)
        )::real
      end as search_rank
    from public.entries e
    where (v_scope is null or e.scope = v_scope)
      and (v_entry_type is null or e.entry_type = v_entry_type)
      and (p_min_year is null or coalesce(e.end_year, e.start_year, 2100) >= p_min_year)
      and (p_max_year is null or coalesce(e.start_year, -500000) <= p_max_year)
      and (
        v_query is null
        or (v_tsquery is not null and e.search_document @@ v_tsquery)
        or e.title ilike v_like escape '\'
        or e.slug ilike v_like escape '\'
        or coalesce(e.era, '') ilike v_like escape '\'
        or coalesce(e.location_name, '') ilike v_like escape '\'
        or exists (
          select 1
          from public.entry_sources s
          where s.entry_id = e.id
            and s.source_title ilike v_like escape '\'
        )
      )
  ),
  counted as (
    select count(*)::int as total_matched from filtered
  ),
  windowed as (
    select *
    from filtered
    order by search_rank desc, title asc, id asc
    limit v_limit + 1 offset v_offset
  ),
  page as (
    select *
    from windowed
    order by search_rank desc, title asc, id asc
    limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'slug', p.slug,
          'scope', p.scope,
          'entryType', p.entry_type,
          'era', p.era,
          'startYear', p.start_year,
          'endYear', p.end_year,
          'dateIsApproximate', p.date_is_approximate,
          'locationName', p.location_name,
          'summary', p.summary,
          'significance', p.significance,
          'origin', case
            when p.origin_location is null then null
            else jsonb_build_object(
              'latitude', st_y(p.origin_location::geometry),
              'longitude', st_x(p.origin_location::geometry)
            )
          end,
          'current', case
            when p.current_location is null then null
            else jsonb_build_object(
              'latitude', st_y(p.current_location::geometry),
              'longitude', st_x(p.current_location::geometry)
            )
          end,
          'originPrecision', p.origin_coordinate_precision,
          'currentPrecision', p.current_coordinate_precision,
          'originSource', p.origin_coordinate_source,
          'currentSource', p.current_coordinate_source,
          'reviewed', p.reviewed
        )
        order by p.search_rank desc, p.title asc, p.id asc
      )
      from page p
    ), '[]'::jsonb),
    (select count(*)::int from windowed),
    (select total_matched from counted)
  into v_rows, v_window_count, v_total_matched;

  return jsonb_build_object(
    'entries', v_rows,
    'hasMore', v_window_count > v_limit,
    'nextOffset', case when v_window_count > v_limit then v_offset + v_limit else null end,
    'totalMatched', coalesce(v_total_matched, 0)
  );
end;
$$;

revoke all on function public.search_entries(text, text, text, int, int, int, int) from public;
grant execute on function public.search_entries(text, text, text, int, int, int, int) to anon, authenticated;

-- Atomic curator-only import of an entry plus its media and source records in a single transaction.
-- SECURITY DEFINER is required to validate all fields and perform multi-table writes atomically;
-- authorization is explicitly enforced via public.is_curator() and restricted to authenticated callers.
create or replace function public.import_historical_entry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_slug text;
  v_scope text;
  v_entry_type text;
  v_era text;
  v_start_year int;
  v_end_year int;
  v_date_is_approximate boolean;
  v_location_name text;
  v_summary text;
  v_significance text;
  v_origin_lat double precision;
  v_origin_lon double precision;
  v_origin_geog geography(point, 4326);
  v_current_lat double precision;
  v_current_lon double precision;
  v_current_geog geography(point, 4326);
  v_origin_precision text;
  v_current_precision text;
  v_origin_source text;
  v_current_source text;
  v_reviewed boolean;
  v_entry public.entries%rowtype;
  v_media_item jsonb;
  v_media_idx int;
  v_media_url text;
  v_media_source_url text;
  v_media_license_url text;
  v_media_period text;
  v_media_year int;
  v_source_item jsonb;
  v_source_title text;
  v_source_url text;
begin
  if not public.is_curator() then
    raise exception 'Curator privileges are required to import entries' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Import payload must be a JSON object';
  end if;

  v_title := nullif(trim(coalesce(p_payload->>'title', '')), '');
  if v_title is null or char_length(v_title) > 300 then
    raise exception 'A valid title (1-300 characters) is required';
  end if;

  v_slug := nullif(trim(coalesce(p_payload->>'slug', '')), '');
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid slug format';
  end if;

  if exists (select 1 from public.entries e where e.slug = v_slug) then
    raise exception 'An entry with slug "%" already exists', v_slug using errcode = '23505';
  end if;

  v_scope := trim(coalesce(p_payload->>'scope', ''));
  if v_scope not in ('local', 'international') then
    raise exception 'Invalid scope: must be local or international';
  end if;

  v_entry_type := trim(coalesce(p_payload->>'entryType', ''));
  if v_entry_type not in ('place', 'artifact') then
    raise exception 'Invalid entryType: must be place or artifact';
  end if;

  v_summary := nullif(trim(coalesce(p_payload->>'summary', '')), '');
  if v_summary is null then
    raise exception 'Summary is required';
  end if;

  v_era := nullif(trim(coalesce(p_payload->>'era', '')), '');
  v_location_name := nullif(trim(coalesce(p_payload->>'locationName', '')), '');
  v_significance := nullif(trim(coalesce(p_payload->>'significance', '')), '');
  v_date_is_approximate := coalesce((p_payload->>'dateIsApproximate')::boolean, false);
  v_reviewed := coalesce((p_payload->>'reviewed')::boolean, false);

  if (p_payload->'startYear') is not null
     and jsonb_typeof(p_payload->'startYear') <> 'null'
     and nullif(trim(coalesce(p_payload->>'startYear', '')), '') is not null then
    v_start_year := (p_payload->>'startYear')::int;
    if v_start_year < -500000 or v_start_year > 2100 then
      raise exception 'startYear out of allowed range (-500000..2100)';
    end if;
  end if;

  if (p_payload->'endYear') is not null
     and jsonb_typeof(p_payload->'endYear') <> 'null'
     and nullif(trim(coalesce(p_payload->>'endYear', '')), '') is not null then
    v_end_year := (p_payload->>'endYear')::int;
    if v_end_year < -500000 or v_end_year > 2100 then
      raise exception 'endYear out of allowed range (-500000..2100)';
    end if;
  end if;

  if v_start_year is not null and v_end_year is not null and v_end_year < v_start_year then
    raise exception 'endYear must be greater than or equal to startYear';
  end if;

  if (p_payload->'origin') is not null and jsonb_typeof(p_payload->'origin') <> 'null' then
    if jsonb_typeof(p_payload->'origin') <> 'object' then
      raise exception 'origin must be an object with latitude and longitude';
    end if;
    v_origin_lat := (p_payload->'origin'->>'latitude')::double precision;
    v_origin_lon := (p_payload->'origin'->>'longitude')::double precision;
    if v_origin_lat is null or v_origin_lon is null
       or v_origin_lat = 'NaN'::double precision or v_origin_lon = 'NaN'::double precision
       or not (v_origin_lat between -90 and 90)
       or not (v_origin_lon between -180 and 180) then
      raise exception 'Invalid origin coordinates';
    end if;
    v_origin_geog := st_setsrid(st_makepoint(v_origin_lon, v_origin_lat), 4326)::geography;
  end if;

  if (p_payload->'current') is not null and jsonb_typeof(p_payload->'current') <> 'null' then
    if v_entry_type <> 'artifact' then
      raise exception 'Only artifacts can have a current location';
    end if;
    if jsonb_typeof(p_payload->'current') <> 'object' then
      raise exception 'current must be an object with latitude and longitude';
    end if;
    v_current_lat := (p_payload->'current'->>'latitude')::double precision;
    v_current_lon := (p_payload->'current'->>'longitude')::double precision;
    if v_current_lat is null or v_current_lon is null
       or v_current_lat = 'NaN'::double precision or v_current_lon = 'NaN'::double precision
       or not (v_current_lat between -90 and 90)
       or not (v_current_lon between -180 and 180) then
      raise exception 'Invalid current coordinates';
    end if;
    v_current_geog := st_setsrid(st_makepoint(v_current_lon, v_current_lat), 4326)::geography;
  end if;

  v_origin_precision := coalesce(nullif(trim(coalesce(p_payload->>'originPrecision', '')), ''), 'unknown');
  if v_origin_precision not in ('exact', 'approximate', 'area_centroid', 'unknown') then
    raise exception 'Invalid originPrecision';
  end if;

  if v_current_geog is not null then
    v_current_precision := coalesce(nullif(trim(coalesce(p_payload->>'currentPrecision', '')), ''), 'unknown');
    if v_current_precision not in ('exact', 'approximate', 'area_centroid', 'unknown') then
      raise exception 'Invalid currentPrecision';
    end if;
  else
    v_current_precision := null;
  end if;

  v_origin_source := nullif(trim(coalesce(p_payload->>'originSource', '')), '');
  if v_origin_source is not null and v_origin_source !~* '^https?://[^/\s<>"]+' then
    raise exception 'Invalid originSource URL';
  end if;

  v_current_source := nullif(trim(coalesce(p_payload->>'currentSource', '')), '');
  if v_current_source is not null and v_current_source !~* '^https?://[^/\s<>"]+' then
    raise exception 'Invalid currentSource URL';
  end if;

  insert into public.entries (
    title,
    slug,
    scope,
    entry_type,
    era,
    start_year,
    end_year,
    date_is_approximate,
    location_name,
    summary,
    significance,
    origin_location,
    current_location,
    origin_coordinate_precision,
    current_coordinate_precision,
    origin_coordinate_source,
    current_coordinate_source,
    reviewed
  )
  values (
    v_title,
    v_slug,
    v_scope,
    v_entry_type,
    v_era,
    v_start_year,
    v_end_year,
    v_date_is_approximate,
    v_location_name,
    v_summary,
    v_significance,
    v_origin_geog,
    v_current_geog,
    v_origin_precision,
    v_current_precision,
    v_origin_source,
    v_current_source,
    v_reviewed
  )
  returning * into v_entry;

  if (p_payload->'media') is not null and jsonb_typeof(p_payload->'media') <> 'null' then
    if jsonb_typeof(p_payload->'media') <> 'array' then
      raise exception 'media must be an array';
    end if;

    v_media_idx := 0;
    for v_media_item in select value from jsonb_array_elements(p_payload->'media')
    loop
      v_media_url := nullif(trim(coalesce(v_media_item->>'imageUrl', '')), '');
      if v_media_url is null or v_media_url !~* '^https?://[^/\s<>"]+' then
        raise exception 'Media item % requires a valid HTTP/HTTPS imageUrl', v_media_idx;
      end if;

      v_media_source_url := nullif(trim(coalesce(v_media_item->>'sourceUrl', '')), '');
      if v_media_source_url is not null and v_media_source_url !~* '^https?://[^/\s<>"]+' then
        raise exception 'Media item % has an invalid sourceUrl', v_media_idx;
      end if;

      v_media_license_url := nullif(trim(coalesce(v_media_item->>'licenseUrl', '')), '');
      if v_media_license_url is not null and v_media_license_url !~* '^https?://[^/\s<>"]+' then
        raise exception 'Media item % has an invalid licenseUrl', v_media_idx;
      end if;

      v_media_period := coalesce(nullif(trim(coalesce(v_media_item->>'period', '')), ''), 'unknown');
      if v_media_period not in ('archival', 'modern', 'unknown') then
        raise exception 'Media item % has an invalid period', v_media_idx;
      end if;

      v_media_year := null;
      if (v_media_item->'photoYear') is not null
         and jsonb_typeof(v_media_item->'photoYear') <> 'null'
         and nullif(trim(coalesce(v_media_item->>'photoYear', '')), '') is not null then
        v_media_year := (v_media_item->>'photoYear')::int;
        if v_media_year < -500000 or v_media_year > 2100 then
          raise exception 'Media item % photoYear out of range (-500000..2100)', v_media_idx;
        end if;
      end if;

      insert into public.entry_media (
        entry_id,
        image_url,
        source_url,
        caption,
        photo_year,
        media_period,
        creator,
        attribution_text,
        license,
        license_url,
        comparison_group,
        display_order
      )
      values (
        v_entry.id,
        v_media_url,
        v_media_source_url,
        nullif(trim(coalesce(v_media_item->>'caption', '')), ''),
        v_media_year,
        v_media_period,
        nullif(trim(coalesce(v_media_item->>'creator', '')), ''),
        nullif(trim(coalesce(v_media_item->>'attributionText', '')), ''),
        nullif(trim(coalesce(v_media_item->>'license', '')), ''),
        v_media_license_url,
        nullif(trim(coalesce(v_media_item->>'comparisonGroup', '')), ''),
        v_media_idx
      );

      v_media_idx := v_media_idx + 1;
    end loop;
  end if;

  if (p_payload->'sources') is not null and jsonb_typeof(p_payload->'sources') <> 'null' then
    if jsonb_typeof(p_payload->'sources') <> 'array' then
      raise exception 'sources must be an array';
    end if;

    for v_source_item in select value from jsonb_array_elements(p_payload->'sources')
    loop
      v_source_title := nullif(trim(coalesce(v_source_item->>'title', '')), '');
      v_source_url := nullif(trim(coalesce(v_source_item->>'url', '')), '');

      if v_source_title is null then
        raise exception 'Each source requires a title';
      end if;
      if v_source_url is null or v_source_url !~* '^https?://[^/\s<>"]+' then
        raise exception 'Each source requires a valid HTTP/HTTPS url';
      end if;

      insert into public.entry_sources (
        entry_id,
        source_title,
        source_url,
        publisher,
        source_type,
        notes
      )
      values (
        v_entry.id,
        v_source_title,
        v_source_url,
        nullif(trim(coalesce(v_source_item->>'publisher', '')), ''),
        nullif(trim(coalesce(v_source_item->>'sourceType', '')), ''),
        nullif(trim(coalesce(v_source_item->>'notes', '')), '')
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_entry.id,
    'title', v_entry.title,
    'slug', v_entry.slug,
    'scope', v_entry.scope,
    'entryType', v_entry.entry_type,
    'era', v_entry.era,
    'startYear', v_entry.start_year,
    'endYear', v_entry.end_year,
    'dateIsApproximate', v_entry.date_is_approximate,
    'locationName', v_entry.location_name,
    'summary', v_entry.summary,
    'significance', v_entry.significance,
    'origin', case
      when v_entry.origin_location is null then null
      else jsonb_build_object(
        'latitude', st_y(v_entry.origin_location::geometry),
        'longitude', st_x(v_entry.origin_location::geometry)
      )
    end,
    'current', case
      when v_entry.current_location is null then null
      else jsonb_build_object(
        'latitude', st_y(v_entry.current_location::geometry),
        'longitude', st_x(v_entry.current_location::geometry)
      )
    end,
    'originPrecision', v_entry.origin_coordinate_precision,
    'currentPrecision', v_entry.current_coordinate_precision,
    'originSource', v_entry.origin_coordinate_source,
    'currentSource', v_entry.current_coordinate_source,
    'reviewed', v_entry.reviewed
  );
end;
$$;

revoke all on function public.import_historical_entry(jsonb) from public;
grant execute on function public.import_historical_entry(jsonb) to authenticated;

-- Curator-only RPC to toggle human review status on a historical entry.
create or replace function public.set_entry_reviewed(
  p_entry_id uuid,
  p_reviewed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_reviewed boolean;
begin
  if not public.is_curator() then
    raise exception 'Curator privileges are required to update review status' using errcode = '42501';
  end if;

  if p_entry_id is null or p_reviewed is null then
    raise exception 'Entry id and reviewed flag are required';
  end if;

  update public.entries
  set reviewed = p_reviewed
  where id = p_entry_id
  returning id, reviewed into v_id, v_reviewed;

  if not found then
    raise exception 'Historical entry not found';
  end if;

  return jsonb_build_object(
    'id', v_id,
    'reviewed', v_reviewed
  );
end;
$$;

revoke all on function public.set_entry_reviewed(uuid, boolean) from public;
grant execute on function public.set_entry_reviewed(uuid, boolean) to authenticated;
