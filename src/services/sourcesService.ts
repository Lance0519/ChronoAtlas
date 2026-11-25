import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import type { SourceRef } from "../types/atlas";
import { getSources, isUuid } from "./entriesService";

export function getSourcesForEntry(entryId: string): SourceRef[] {
  return getSources(entryId);
}

export async function fetchSourcesForEntry(entryId: string): Promise<SourceRef[]> {
  if (!isSupabaseConfigured() || !isUuid(entryId)) {
    return getSources(entryId);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return getSources(entryId);
  }

  const { data, error } = await supabase
    .from("entry_sources")
    .select("*")
    .eq("entry_id", entryId)
    .order("accessed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    title: row.source_title,
    url: row.source_url,
    publisher: row.publisher ?? "Unknown publisher",
    accessedAt: row.accessed_at.slice(0, 10),
    sourceType: row.source_type ?? "reference",
    author: row.author,
    publicationYear: row.publication_year,
    notes: row.notes,
  }));
}
