import type { HistoricalEntry, ImportDraftPayload, MediaItem, SourceRef } from "../types/atlas";
import { hasValidationErrors, validateImportPayload } from "./import/wikiValidator";

const OVERLAY_STORAGE_KEY = "chronoatlas.overlay.v1";

export interface LocalOverlayState {
  version: 1;
  entries: HistoricalEntry[];
  media: MediaItem[];
  sources: SourceRef[];
  reviewedOverrides: Record<string, boolean>;
}

export interface LocalOverlayStats {
  importedEntries: number;
  importedMedia: number;
  importedSources: number;
  reviewedOverrides: number;
}

function emptyOverlay(): LocalOverlayState {
  return {
    version: 1,
    entries: [],
    media: [],
    sources: [],
    reviewedOverrides: {},
  };
}

function generateLocalId(prefix: string): string {
  const uuid =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

export function readLocalOverlay(): LocalOverlayState {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return emptyOverlay();
    }
    const raw = globalThis.localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return emptyOverlay();

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyOverlay();

    const record = parsed as Partial<LocalOverlayState>;
    const reviewedOverrides: Record<string, boolean> = {};
    if (record.reviewedOverrides && typeof record.reviewedOverrides === "object") {
      for (const [key, value] of Object.entries(record.reviewedOverrides)) {
        if (typeof value === "boolean") {
          reviewedOverrides[key] = value;
        }
      }
    }

    return {
      version: 1,
      entries: Array.isArray(record.entries) ? (record.entries as HistoricalEntry[]) : [],
      media: Array.isArray(record.media) ? (record.media as MediaItem[]) : [],
      sources: Array.isArray(record.sources) ? (record.sources as SourceRef[]) : [],
      reviewedOverrides,
    };
  } catch {
    return emptyOverlay();
  }
}

function writeLocalOverlay(state: LocalOverlayState): void {
  if (typeof globalThis.localStorage === "undefined") {
    throw new Error("Browser storage is unavailable in this environment.");
  }
  try {
    globalThis.localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error(
      "Unable to persist local overlay in browser storage (storage full or blocked).",
    );
  }
}

export function saveLocalImportedEntry(
  payload: ImportDraftPayload,
  existingSlugs?: Set<string>,
): HistoricalEntry {
  const errors = validateImportPayload(payload);
  if (hasValidationErrors(errors)) {
    const firstError = Object.values(errors)[0] ?? "Import payload validation failed.";
    throw new Error(firstError);
  }

  const overlay = readLocalOverlay();
  const slug = payload.slug.trim();

  if (
    overlay.entries.some((entry) => entry.slug === slug) ||
    (existingSlugs && existingSlugs.has(slug))
  ) {
    throw new Error(`An entry with slug "${slug}" already exists.`);
  }

  const entryId = generateLocalId("e-import");
  const isArtifact = payload.entryType === "artifact";
  const currentCoords = isArtifact ? payload.current : null;

  const entry: HistoricalEntry = {
    id: entryId,
    title: payload.title.trim(),
    slug,
    scope: payload.scope,
    entryType: payload.entryType,
    era: payload.era?.trim() || null,
    startYear: payload.startYear,
    endYear: payload.endYear,
    dateIsApproximate: Boolean(payload.dateIsApproximate),
    locationName: payload.locationName?.trim() || null,
    summary: payload.summary.trim(),
    significance: payload.significance?.trim() || null,
    origin: payload.origin,
    current: currentCoords,
    originPrecision: payload.originPrecision,
    currentPrecision: currentCoords ? (payload.currentPrecision ?? "unknown") : null,
    originSource: payload.originSource?.trim() || null,
    currentSource: isArtifact ? payload.currentSource?.trim() || null : null,
    reviewed: Boolean(payload.reviewed),
  };

  const today = new Date().toISOString().slice(0, 10);

  const media: MediaItem[] = payload.media.map((item) => ({
    id: generateLocalId("m-import"),
    entryId,
    imageUrl: item.imageUrl.trim(),
    sourceUrl: item.sourceUrl.trim(),
    caption: item.caption.trim() || entry.title,
    period: item.period,
    photoYear: item.photoYear,
    creator: item.creator?.trim() || null,
    license: item.license?.trim() || null,
    licenseUrl: item.licenseUrl?.trim() || null,
    attributionText: item.attributionText?.trim() || null,
    comparisonGroup: item.comparisonGroup?.trim() || null,
  }));

  const sources: SourceRef[] = payload.sources.map((src) => ({
    id: generateLocalId("s-import"),
    entryId,
    title: src.title.trim(),
    url: src.url.trim(),
    publisher: src.publisher.trim() || "Wikipedia",
    accessedAt: today,
    sourceType: src.sourceType.trim() || "encyclopedia",
    notes: src.notes?.trim() || null,
  }));

  const nextState: LocalOverlayState = {
    version: 1,
    entries: [...overlay.entries, entry],
    media: [...overlay.media, ...media],
    sources: [...overlay.sources, ...sources],
    reviewedOverrides: {
      ...overlay.reviewedOverrides,
      [entryId]: entry.reviewed,
    },
  };

  writeLocalOverlay(nextState);
  return entry;
}

export function setLocalEntryReviewed(entryId: string, reviewed: boolean): void {
  const overlay = readLocalOverlay();
  const nextEntries = overlay.entries.map((entry) =>
    entry.id === entryId ? { ...entry, reviewed } : entry,
  );

  writeLocalOverlay({
    ...overlay,
    entries: nextEntries,
    reviewedOverrides: {
      ...overlay.reviewedOverrides,
      [entryId]: reviewed,
    },
  });
}

export function exportLocalOverlayJson(): string {
  return JSON.stringify(readLocalOverlay(), null, 2);
}

export function resetLocalOverlay(): void {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.removeItem(OVERLAY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage removal errors if localStorage is blocked.
  }
}

export function getLocalOverlayStats(): LocalOverlayStats {
  const overlay = readLocalOverlay();
  return {
    importedEntries: overlay.entries.length,
    importedMedia: overlay.media.length,
    importedSources: overlay.sources.length,
    reviewedOverrides: Object.keys(overlay.reviewedOverrides).length,
  };
}
