import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import type { DirectedEntryLink, RelationshipType } from "../types/atlas";
import {
  cacheRemoteEntries,
  getEntry,
  getLinks,
  isUuid,
  mapDatabaseEntryRow,
} from "./entriesService";

const KNOWN_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  "historical_influence",
  "cultural_exchange",
  "political_association",
  "same_event",
  "successor",
  "predecessor",
  "related_site",
  "artifact_origin",
  "artifact_relocation",
  "other",
]);

function normalizeRelationshipType(raw: string): RelationshipType {
  return KNOWN_RELATIONSHIP_TYPES.has(raw as RelationshipType)
    ? (raw as RelationshipType)
    : "other";
}

export function getLinksForEntry(entryId: string): DirectedEntryLink[] {
  return getLinks(entryId);
}

export async function fetchLinksForEntry(entryId: string): Promise<DirectedEntryLink[]> {
  if (!isSupabaseConfigured() || !isUuid(entryId)) {
    return getLinks(entryId);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return getLinks(entryId);
  }

  const { data, error } = await supabase
    .from("entry_links")
    .select("*")
    .or(`source_id.eq.${entryId},target_id.eq.${entryId}`)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const links: DirectedEntryLink[] = (data ?? []).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationshipType: normalizeRelationshipType(row.relationship_type),
    relationshipLabel: row.relationship_label,
    description: row.description,
    direction: row.source_id === entryId ? "out" : "in",
  }));

  const missingIds = new Set<string>();
  for (const link of links) {
    const otherId = link.direction === "out" ? link.targetId : link.sourceId;
    if (!getEntry(otherId) && isUuid(otherId)) {
      missingIds.add(otherId);
    }
  }

  if (missingIds.size > 0) {
    const { data: relatedRows } = await supabase
      .from("entries")
      .select("*")
      .in("id", [...missingIds]);
    if (relatedRows && relatedRows.length > 0) {
      cacheRemoteEntries(relatedRows.map(mapDatabaseEntryRow));
    }
  }

  return links;
}
