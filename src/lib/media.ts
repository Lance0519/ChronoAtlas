import type { MediaItem } from "../types/atlas";

export interface ComparisonPair {
  archival: MediaItem;
  modern: MediaItem;
}

/** A pair is valid only when a curated group has one image of each period. */
export function getComparisonPair(media: MediaItem[]): ComparisonPair | null {
  const groups = new Map<string, MediaItem[]>();
  for (const item of media) {
    if (!item.comparisonGroup) continue;
    const group = groups.get(item.comparisonGroup) ?? [];
    group.push(item);
    groups.set(item.comparisonGroup, group);
  }
  for (const group of groups.values()) {
    const archival = group.find((item) => item.period === "archival");
    const modern = group.find((item) => item.period === "modern");
    if (archival && modern) return { archival, modern };
  }
  return null;
}
