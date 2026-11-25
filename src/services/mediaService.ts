import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import type { MediaItem } from "../types/atlas";
import { getMedia, isUuid } from "./entriesService";

export function getMediaForEntry(entryId: string): MediaItem[] {
  return getMedia(entryId);
}

export async function fetchMediaForEntry(entryId: string): Promise<MediaItem[]> {
  if (!isSupabaseConfigured() || !isUuid(entryId)) {
    return getMedia(entryId);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return getMedia(entryId);
  }

  const { data, error } = await supabase
    .from("entry_media")
    .select("*")
    .eq("entry_id", entryId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    imageUrl: row.image_url,
    sourceUrl: row.source_url ?? "",
    caption: row.caption ?? "",
    period: row.media_period,
    photoYear: row.photo_year,
    creator: row.creator,
    license: row.license,
    licenseUrl: row.license_url,
    attributionText: row.attribution_text,
    comparisonGroup: row.comparison_group,
  }));
}
