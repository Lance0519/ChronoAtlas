import { seedEntries, seedLinks, seedMedia, seedSources } from "../data/seed";
import { buildViewportEnvelopes, entryInAnyBounds, isValidCoordinate } from "../lib/geo";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import type {
  AtlasFilters,
  Coordinates,
  DirectedEntryLink,
  EntriesPage,
  HistoricalEntry,
  ImportDraftPayload,
  MediaItem,
  PersonalProgress,
  SourceRef,
  ViewportBounds,
} from "../types/atlas";
import type { Database, GeoJsonPoint, Json, RpcHistoricalEntry } from "../types/database";
import { getSession, isCuratorRole } from "./authService";
import { hasValidationErrors, validateImportPayload } from "./import/wikiValidator";
import {
  exportLocalOverlayJson,
  getLocalOverlayStats,
  readLocalOverlay,
  resetLocalOverlay,
  saveLocalImportedEntry,
  setLocalEntryReviewed,
  type LocalOverlayStats,
} from "./localOverlay";

const PROGRESS_KEY = "chronoatlas.progress.v1";
const RESULT_CAP = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EntryQueryOptions {
  limit?: number;
  offset?: number;
}

let extendedEntries: HistoricalEntry[] = [];
let extendedSources: SourceRef[] = [];
let extendedMedia: MediaItem[] = [];
let extendedLoaded = false;
let extendedLoadPromise: Promise<void> | null = null;
const corpusListeners = new Set<() => void>();
const remoteEntryCache = new Map<string, HistoricalEntry>();

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function notifyCorpusListeners(): void {
  for (const listener of corpusListeners) {
    try {
      listener();
    } catch {
      // Listener errors must not block other subscribers.
    }
  }
}

export function isExtendedCorpusLoaded(): boolean {
  return extendedLoaded;
}

export function subscribeCorpusLoaded(cb: () => void): () => void {
  corpusListeners.add(cb);
  return () => {
    corpusListeners.delete(cb);
  };
}

export async function ensureExtendedCorpusLoaded(): Promise<void> {
  if (extendedLoaded) return;
  if (extendedLoadPromise) return extendedLoadPromise;

  extendedLoadPromise = Promise.all([import("../data/unescoSeed"), import("../data/unescoMedia")])
    .then(([seedMod, mediaMod]) => {
      extendedEntries = seedMod.unescoEntries;
      extendedSources = seedMod.unescoSources;
      extendedMedia = mediaMod.unescoMedia;
      extendedLoaded = true;
      notifyCorpusListeners();
    })
    .catch((error) => {
      extendedLoadPromise = null;
      throw error;
    });

  return extendedLoadPromise;
}

export function cacheRemoteEntries(entries: HistoricalEntry[]): void {
  for (const entry of entries) {
    remoteEntryCache.set(entry.id, entry);
  }
}

export function parsePostgisPoint(
  raw: GeoJsonPoint | string | null | undefined,
): Coordinates | null {
  if (!raw) return null;

  if (typeof raw === "object" && raw.type === "Point" && Array.isArray(raw.coordinates)) {
    const [lon, lat] = raw.coordinates;
    if (typeof lat === "number" && typeof lon === "number" && isValidCoordinate(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
    return null;
  }

  if (typeof raw === "string") {
    const wktMatch = /POINT\s*\(\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*\)/i.exec(raw);
    if (wktMatch) {
      const lon = Number(wktMatch[1]);
      const lat = Number(wktMatch[2]);
      return isValidCoordinate(lat, lon) ? { latitude: lat, longitude: lon } : null;
    }

    if (/^[0-9a-fA-F]{42,50}$/.test(raw)) {
      const bytes = new Uint8Array(raw.length / 2);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
      }
      const view = new DataView(bytes.buffer);
      const littleEndian = view.getUint8(0) === 1;
      const geomType = view.getUint32(1, littleEndian);
      const hasSrid = (geomType & 0x20000000) !== 0;
      const baseType = geomType & 0xff;
      const coordOffset = hasSrid ? 9 : 5;
      if (baseType === 1 && bytes.length >= coordOffset + 16) {
        const lon = view.getFloat64(coordOffset, littleEndian);
        const lat = view.getFloat64(coordOffset + 8, littleEndian);
        return isValidCoordinate(lat, lon) ? { latitude: lat, longitude: lon } : null;
      }
    }
  }

  return null;
}

export function mapDatabaseEntryRow(
  row: Database["public"]["Tables"]["entries"]["Row"],
): HistoricalEntry {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    scope: row.scope,
    entryType: row.entry_type,
    era: row.era,
    startYear: row.start_year,
    endYear: row.end_year,
    dateIsApproximate: row.date_is_approximate,
    locationName: row.location_name,
    summary: row.summary,
    significance: row.significance,
    origin: parsePostgisPoint(row.origin_location),
    current: parsePostgisPoint(row.current_location),
    originPrecision: row.origin_coordinate_precision,
    currentPrecision: row.current_coordinate_precision,
    originSource: row.origin_coordinate_source,
    currentSource: row.current_coordinate_source,
    reviewed: row.reviewed,
  };
}

function mapRpcEntry(entry: RpcHistoricalEntry): HistoricalEntry {
  return {
    id: entry.id,
    title: entry.title,
    slug: entry.slug,
    scope: entry.scope,
    entryType: entry.entryType,
    era: entry.era,
    startYear: entry.startYear,
    endYear: entry.endYear,
    dateIsApproximate: entry.dateIsApproximate,
    locationName: entry.locationName,
    summary: entry.summary,
    significance: entry.significance,
    origin: entry.origin,
    current: entry.current,
    originPrecision: entry.originPrecision,
    currentPrecision: entry.currentPrecision,
    originSource: entry.originSource,
    currentSource: entry.currentSource,
    reviewed: entry.reviewed,
  };
}

function getMergedEntries(): HistoricalEntry[] {
  const overlay = readLocalOverlay();
  const byId = new Map<string, HistoricalEntry>();
  const applyOverride = (entry: HistoricalEntry): HistoricalEntry => {
    if (Object.prototype.hasOwnProperty.call(overlay.reviewedOverrides, entry.id)) {
      return { ...entry, reviewed: overlay.reviewedOverrides[entry.id] };
    }
    return entry;
  };

  for (const entry of seedEntries) {
    byId.set(entry.id, applyOverride(entry));
  }
  for (const entry of extendedEntries) {
    byId.set(entry.id, applyOverride(entry));
  }
  for (const entry of overlay.entries) {
    byId.set(entry.id, applyOverride(entry));
  }

  return [...byId.values()];
}

function getMergedSources(): SourceRef[] {
  const overlay = readLocalOverlay();
  return [...seedSources, ...extendedSources, ...overlay.sources];
}

function getMergedMedia(): MediaItem[] {
  const overlay = readLocalOverlay();
  return [...seedMedia, ...extendedMedia, ...overlay.media];
}

function filterAndSortLocalEntries(
  filters: AtlasFilters,
  bounds: ViewportBounds | null,
): HistoricalEntry[] {
  const entries = getMergedEntries();
  const sources = getMergedSources();
  const query = filters.query.trim().toLowerCase();
  const envelopes = bounds && filters.searchThisArea ? buildViewportEnvelopes(bounds) : [];
  const hasAreaFilter = filters.searchThisArea && bounds !== null;

  let sourceTitlesByEntry: Map<string, string[]> | null = null;
  if (query) {
    sourceTitlesByEntry = new Map<string, string[]>();
    for (const source of sources) {
      const list = sourceTitlesByEntry.get(source.entryId) ?? [];
      list.push(source.title.toLowerCase());
      sourceTitlesByEntry.set(source.entryId, list);
    }
  }

  return entries
    .filter((entry) => {
      if (filters.scope !== "all" && entry.scope !== filters.scope) return false;
      if (filters.entryType !== "all" && entry.entryType !== filters.entryType) return false;
      if (
        filters.minYear !== null &&
        (entry.endYear ?? entry.startYear ?? -Infinity) < filters.minYear
      ) {
        return false;
      }
      if (filters.maxYear !== null && (entry.startYear ?? Infinity) > filters.maxYear) {
        return false;
      }
      if (query) {
        const sourceTitles = sourceTitlesByEntry?.get(entry.id) ?? [];
        const haystack = [entry.title, entry.era ?? "", entry.locationName ?? "", ...sourceTitles]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (hasAreaFilter && !entryInAnyBounds(entry, envelopes)) return false;
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export function listEntriesPage(
  filters: AtlasFilters,
  bounds: ViewportBounds | null,
  options: EntryQueryOptions = {},
): EntriesPage {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? RESULT_CAP), 1), RESULT_CAP);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  const matched = filterAndSortLocalEntries(filters, bounds);
  const windowed = matched.slice(offset, offset + limit + 1);
  const hasMore = windowed.length > limit;

  return {
    entries: windowed.slice(0, limit),
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
    totalMatched: matched.length,
  };
}

/** Synchronous local query preserved for immediate rendering and unit tests. */
export function listEntries(
  filters: AtlasFilters,
  bounds: ViewportBounds | null,
): HistoricalEntry[] {
  return listEntriesPage(filters, bounds, { limit: RESULT_CAP, offset: 0 }).entries;
}

/** Dual-mode paginated query: Supabase PostGIS/tsvector RPCs when configured, else lazy local corpus. */
export async function queryEntriesPage(
  filters: AtlasFilters,
  bounds: ViewportBounds | null,
  options: EntryQueryOptions = {},
): Promise<EntriesPage> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? RESULT_CAP), 1), RESULT_CAP);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);

  if (!isSupabaseConfigured()) {
    await ensureExtendedCorpusLoaded();
    return listEntriesPage(filters, bounds, { limit, offset });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    await ensureExtendedCorpusLoaded();
    return listEntriesPage(filters, bounds, { limit, offset });
  }

  const scopeArg = filters.scope === "all" ? null : filters.scope;
  const typeArg = filters.entryType === "all" ? null : filters.entryType;
  const trimmedQuery = filters.query.trim();
  const hasAreaFilter = filters.searchThisArea && bounds !== null;

  if (hasAreaFilter && bounds) {
    const envelopes = buildViewportEnvelopes(bounds);
    if (envelopes.length === 0) {
      return { entries: [], hasMore: false, nextOffset: null, totalMatched: 0 };
    }

    if (!trimmedQuery) {
      const { data, error } = await supabase.rpc("search_viewport", {
        p_min_lat: bounds.minLat,
        p_min_lon: bounds.minLon,
        p_max_lat: bounds.maxLat,
        p_max_lon: bounds.maxLon,
        p_scope: scopeArg,
        p_entry_type: typeArg,
        p_min_year: filters.minYear,
        p_max_year: filters.maxYear,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        throw new Error(error.message);
      }

      const entries = (data?.entries ?? []).map(mapRpcEntry);
      cacheRemoteEntries(entries);
      const hasMore = Boolean(data?.hasMore);
      const nextOffset = data?.nextOffset ?? (hasMore ? offset + limit : null);

      return {
        entries,
        hasMore,
        nextOffset,
        totalMatched: hasMore ? offset + entries.length + 1 : offset + entries.length,
      };
    }

    const { data, error } = await supabase.rpc("search_entries", {
      p_query: trimmedQuery,
      p_scope: scopeArg,
      p_entry_type: typeArg,
      p_min_year: filters.minYear,
      p_max_year: filters.maxYear,
      p_limit: RESULT_CAP,
      p_offset: 0,
    });

    if (error) {
      throw new Error(error.message);
    }

    const allMatched = (data?.entries ?? []).map(mapRpcEntry);
    cacheRemoteEntries(allMatched);
    const areaMatched = allMatched.filter((entry) => entryInAnyBounds(entry, envelopes));
    const windowed = areaMatched.slice(offset, offset + limit + 1);
    const hasMore = windowed.length > limit;

    return {
      entries: windowed.slice(0, limit),
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      totalMatched: areaMatched.length,
    };
  }

  const { data, error } = await supabase.rpc("search_entries", {
    p_query: trimmedQuery || null,
    p_scope: scopeArg,
    p_entry_type: typeArg,
    p_min_year: filters.minYear,
    p_max_year: filters.maxYear,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw new Error(error.message);
  }

  const entries = (data?.entries ?? []).map(mapRpcEntry);
  cacheRemoteEntries(entries);
  const hasMore = Boolean(data?.hasMore);

  return {
    entries,
    hasMore,
    nextOffset: data?.nextOffset ?? (hasMore ? offset + limit : null),
    totalMatched: data?.totalMatched ?? offset + entries.length,
  };
}

export function getEntry(id: string): HistoricalEntry | undefined {
  const remote = remoteEntryCache.get(id);
  if (remote) return remote;
  return getMergedEntries().find((entry) => entry.id === id);
}

export async function fetchEntryDetail(id: string): Promise<HistoricalEntry | undefined> {
  const cached = remoteEntryCache.get(id);
  if (cached) return cached;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase && isUuid(id)) {
      const { data, error } = await supabase.from("entries").select("*").eq("id", id).maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (data) {
        const mapped = mapDatabaseEntryRow(data);
        cacheRemoteEntries([mapped]);
        return mapped;
      }
    }
  }

  return getMergedEntries().find((entry) => entry.id === id);
}

export function getAllKnownEntries(): HistoricalEntry[] {
  if (isSupabaseConfigured() && remoteEntryCache.size > 0) {
    const combined = new Map<string, HistoricalEntry>();
    for (const entry of getMergedEntries()) {
      combined.set(entry.id, entry);
    }
    for (const entry of remoteEntryCache.values()) {
      combined.set(entry.id, entry);
    }
    return [...combined.values()];
  }
  return getMergedEntries();
}

export function getAllKnownSources(): SourceRef[] {
  return getMergedSources();
}

export function getMedia(entryId: string): MediaItem[] {
  return getMergedMedia().filter((item) => item.entryId === entryId);
}

export function getSources(entryId: string): SourceRef[] {
  return getMergedSources().filter((source) => source.entryId === entryId);
}

export function getLinks(entryId: string): DirectedEntryLink[] {
  return seedLinks
    .filter((link) => link.sourceId === entryId || link.targetId === entryId)
    .map((link) => ({
      ...link,
      direction: link.sourceId === entryId ? "out" : "in",
    }));
}

export async function saveImportedEntry(payload: ImportDraftPayload): Promise<HistoricalEntry> {
  const errors = validateImportPayload(payload);
  if (hasValidationErrors(errors)) {
    const firstError = Object.values(errors)[0] ?? "Import payload validation failed.";
    throw new Error(firstError);
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase client is unavailable.");
    }
    const session = await getSession();
    if (!session.authenticated || !isCuratorRole(session.role)) {
      throw new Error("Curator sign-in is required to save imported entries.");
    }

    const { data, error } = await supabase.rpc("import_historical_entry", {
      p_payload: payload as unknown as Json,
    });

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error("Import succeeded without returning the created entry.");
    }

    const created = mapRpcEntry(data);
    cacheRemoteEntries([created]);
    notifyCorpusListeners();
    return created;
  }

  const existingSlugs = new Set(getMergedEntries().map((entry) => entry.slug));
  const created = saveLocalImportedEntry(payload, existingSlugs);
  notifyCorpusListeners();
  return created;
}

export async function toggleEntryReviewed(entryId: string, reviewed: boolean): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase client is unavailable.");
    }
    const session = await getSession();
    if (!session.authenticated || !isCuratorRole(session.role)) {
      throw new Error("Curator sign-in is required to update review status.");
    }

    const { error } = await supabase.rpc("set_entry_reviewed", {
      p_entry_id: entryId,
      p_reviewed: reviewed,
    });

    if (error) {
      throw new Error(error.message);
    }

    const cached = remoteEntryCache.get(entryId);
    if (cached) {
      remoteEntryCache.set(entryId, { ...cached, reviewed });
    }
    notifyCorpusListeners();
    return;
  }

  const exists = getMergedEntries().some((entry) => entry.id === entryId);
  if (!exists) {
    throw new Error("Historical entry could not be found.");
  }
  setLocalEntryReviewed(entryId, reviewed);
  notifyCorpusListeners();
}

export function exportOverlayJson(): string {
  return exportLocalOverlayJson();
}

export function resetOverlay(): void {
  resetLocalOverlay();
  notifyCorpusListeners();
}

export function getOverlayStats(): LocalOverlayStats {
  return getLocalOverlayStats();
}

export function getProgress(entryId: string): PersonalProgress {
  const all = readProgress();
  return all[entryId] ?? { visited: false, notes: "" };
}

/** Merge a patch so separate edits cannot overwrite each other. */
export function patchProgress(entryId: string, patch: Partial<PersonalProgress>): void {
  const all = readProgress();
  const current = all[entryId] ?? { visited: false, notes: "" };
  all[entryId] = { ...current, ...patch };
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    }
  } catch {
    // A full or blocked store must not lose the current editing session.
  }
}

export async function getProgressAsync(entryId: string): Promise<PersonalProgress> {
  if (!isSupabaseConfigured()) {
    return getProgress(entryId);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return getProgress(entryId);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isUuid(entryId)) {
    return { visited: false, notes: "" };
  }

  const { data, error } = await supabase
    .from("user_entry_progress")
    .select("visited, personal_notes, updated_at")
    .eq("user_id", user.id)
    .eq("entry_id", entryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    visited: data?.visited ?? false,
    notes: data?.personal_notes ?? "",
    updatedAt: data?.updated_at,
  };
}

export async function saveProgressAsync(
  entryId: string,
  patch: Partial<PersonalProgress>,
): Promise<PersonalProgress> {
  if (!isSupabaseConfigured()) {
    patchProgress(entryId, patch);
    return {
      ...getProgress(entryId),
      updatedAt: new Date().toISOString(),
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is unavailable.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Sign in to save personal visited status and notes.");
  }
  if (!isUuid(entryId)) {
    throw new Error("Personal progress in Supabase requires a database record UUID.");
  }

  let visited = patch.visited;
  let notes = patch.notes;

  if (visited === undefined || notes === undefined) {
    const existing = await getProgressAsync(entryId);
    visited = visited ?? existing.visited;
    notes = notes ?? existing.notes;
  }

  const { data, error } = await supabase
    .from("user_entry_progress")
    .upsert(
      {
        user_id: user.id,
        entry_id: entryId,
        visited,
        personal_notes: notes,
      },
      { onConflict: "user_id,entry_id" },
    )
    .select("visited, personal_notes, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    visited: data.visited,
    notes: data.personal_notes,
    updatedAt: data.updated_at,
  };
}

function readProgress(): Record<string, PersonalProgress> {
  try {
    if (typeof globalThis.localStorage === "undefined") return {};
    const raw = globalThis.localStorage.getItem(PROGRESS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PersonalProgress>) : {};
  } catch {
    return {};
  }
}
