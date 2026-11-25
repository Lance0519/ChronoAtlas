import type {
  Coordinates,
  DuplicateCandidate,
  DuplicateReason,
  HistoricalEntry,
  ImportDraftPayload,
  SourceRef,
} from "../../types/atlas";

const EARTH_RADIUS_KM = 6371;
const SIMILARITY_RADIUS_KM = 2;
const STOP_WORDS = new Set(["the", "and", "for", "from", "with", "into", "that", "this"]);

export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeComparisonTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractTitleWords(title: string): Set<string> {
  const normalized = normalizeComparisonTitle(title);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

function hasOverlappingTitleWord(a: Set<string>, b: Set<string>): boolean {
  for (const word of a) {
    if (b.has(word)) return true;
  }
  return false;
}

export function normalizeComparableUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/\.m\.wikipedia\.org$/, ".wikipedia.org");
    let path = parsed.pathname;
    if (host.endsWith(".wikipedia.org") && path.startsWith("/wiki/")) {
      const title = decodeURIComponent(path.slice("/wiki/".length)).replaceAll(" ", "_").trim();
      path = `/wiki/${title.toLowerCase()}`;
    } else if (host.endsWith(".wikipedia.org") && path === "/w/index.php") {
      const title = (parsed.searchParams.get("title") ?? "").replaceAll(" ", "_").trim();
      if (title) {
        path = `/wiki/${title.toLowerCase()}`;
      }
    }
    const cleanPath = path.replace(/\/+$/, "");
    return `https://${host}${cleanPath}`;
  } catch {
    return trimmed.toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function indexSourcesByEntry(
  sources?: SourceRef[] | Map<string, SourceRef[]>,
): Map<string, SourceRef[]> {
  if (!sources) return new Map();
  if (sources instanceof Map) return sources;
  const map = new Map<string, SourceRef[]>();
  for (const source of sources) {
    const list = map.get(source.entryId) ?? [];
    list.push(source);
    map.set(source.entryId, list);
  }
  return map;
}

export function findDuplicateCandidates(
  draft: Pick<ImportDraftPayload, "title" | "slug" | "origin" | "originSource" | "sources">,
  existingEntries: HistoricalEntry[],
  existingSources?: SourceRef[] | Map<string, SourceRef[]>,
): DuplicateCandidate[] {
  const draftSlug = draft.slug.trim().toLowerCase();
  const draftTitleNorm = normalizeComparisonTitle(draft.title);
  const draftWords = extractTitleWords(draft.title);
  const sourcesMap = indexSourcesByEntry(existingSources);

  const draftUrls = new Set<string>();
  const originUrlNorm = normalizeComparableUrl(draft.originSource);
  if (originUrlNorm) draftUrls.add(originUrlNorm);
  for (const src of draft.sources) {
    const norm = normalizeComparableUrl(src.url);
    if (norm) draftUrls.add(norm);
  }

  const candidates: DuplicateCandidate[] = [];

  for (const entry of existingEntries) {
    const reasons: DuplicateReason[] = [];

    if (draftSlug && entry.slug.toLowerCase() === draftSlug) {
      reasons.push("exact_slug");
    }

    if (draftTitleNorm && normalizeComparisonTitle(entry.title) === draftTitleNorm) {
      reasons.push("normalized_title");
    }

    if (draftUrls.size > 0) {
      const entryUrls = [
        normalizeComparableUrl(entry.originSource),
        normalizeComparableUrl(entry.currentSource),
        ...(sourcesMap.get(entry.id) ?? []).map((src) => normalizeComparableUrl(src.url)),
      ].filter(Boolean);

      if (entryUrls.some((url) => draftUrls.has(url))) {
        reasons.push("source_url");
      }
    }

    if (
      draft.origin &&
      entry.origin &&
      draftWords.size > 0 &&
      haversineDistanceKm(draft.origin, entry.origin) <= SIMILARITY_RADIUS_KM
    ) {
      const entryWords = extractTitleWords(entry.title);
      if (hasOverlappingTitleWord(draftWords, entryWords)) {
        reasons.push("location_similarity");
      }
    }

    if (reasons.length > 0) {
      candidates.push({ entry, reasons });
    }
  }

  const reasonWeight = (reason: DuplicateReason): number => {
    switch (reason) {
      case "exact_slug":
        return 4;
      case "source_url":
        return 3;
      case "normalized_title":
        return 2;
      case "location_similarity":
        return 1;
    }
  };

  return candidates.sort((a, b) => {
    const scoreA = a.reasons.reduce((sum, r) => sum + reasonWeight(r), 0);
    const scoreB = b.reasons.reduce((sum, r) => sum + reasonWeight(r), 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.entry.title.localeCompare(b.entry.title);
  });
}
