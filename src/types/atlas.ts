export type Scope = "local" | "international";
export type EntryType = "place" | "artifact";
export type ScopeFilter = "all" | Scope;
export type EntryTypeFilter = "all" | EntryType;
export type LocationRole = "origin" | "current";
export type MediaPeriod = "archival" | "modern" | "unknown";
export type CoordinatePrecision = "exact" | "approximate" | "area_centroid" | "unknown";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface AtlasFilters {
  query: string;
  scope: ScopeFilter;
  entryType: EntryTypeFilter;
  minYear: number | null;
  maxYear: number | null;
  searchThisArea: boolean;
}

export interface HistoricalEntry {
  id: string;
  title: string;
  slug: string;
  scope: Scope;
  entryType: EntryType;
  era: string | null;
  startYear: number | null;
  endYear: number | null;
  dateIsApproximate: boolean;
  locationName: string | null;
  summary: string;
  significance: string | null;
  origin: Coordinates | null;
  current: Coordinates | null;
  originPrecision: CoordinatePrecision;
  currentPrecision: CoordinatePrecision | null;
  originSource: string | null;
  currentSource: string | null;
  reviewed: boolean;
}

export interface MediaItem {
  id: string;
  entryId: string;
  imageUrl: string;
  sourceUrl: string;
  caption: string;
  period: MediaPeriod;
  photoYear: number | null;
  creator: string | null;
  license: string | null;
  licenseUrl?: string | null;
  attributionText?: string | null;
  comparisonGroup: string | null;
}

export interface SourceRef {
  id: string;
  entryId: string;
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
  sourceType: string;
  author?: string | null;
  publicationYear?: number | null;
  notes?: string | null;
}

export type RelationshipType =
  | "historical_influence"
  | "cultural_exchange"
  | "political_association"
  | "same_event"
  | "successor"
  | "predecessor"
  | "related_site"
  | "artifact_origin"
  | "artifact_relocation"
  | "other";

export interface EntryLink {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: RelationshipType;
  relationshipLabel: string;
  description: string | null;
}

export interface DirectedEntryLink extends EntryLink {
  direction: "in" | "out";
}

export interface ViewportBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface EntriesPage {
  entries: HistoricalEntry[];
  hasMore: boolean;
  nextOffset: number | null;
  totalMatched: number;
}

export interface AtlasState {
  activeEntryId: string | null;
  activeLocationRole: LocationRole | null;
  filters: AtlasFilters;
  isContextDrawerOpen: boolean;
}

export interface PersonalProgress {
  visited: boolean;
  notes: string;
  updatedAt?: string;
}

export type DuplicateReason =
  "exact_slug" | "normalized_title" | "source_url" | "location_similarity";

export interface DuplicateCandidate {
  entry: HistoricalEntry;
  reasons: DuplicateReason[];
}

export interface ImportMediaDraft {
  imageUrl: string;
  sourceUrl: string;
  caption: string;
  period: MediaPeriod;
  photoYear: number | null;
  creator: string | null;
  license: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  comparisonGroup: string | null;
}

export interface ImportSourceDraft {
  title: string;
  url: string;
  publisher: string;
  sourceType: string;
  notes: string | null;
}

export interface ImportDraftPayload {
  title: string;
  slug: string;
  scope: Scope;
  entryType: EntryType;
  era: string | null;
  startYear: number | null;
  endYear: number | null;
  dateIsApproximate: boolean;
  locationName: string | null;
  summary: string;
  significance: string | null;
  origin: Coordinates | null;
  current: Coordinates | null;
  originPrecision: CoordinatePrecision;
  currentPrecision: CoordinatePrecision | null;
  originSource: string | null;
  currentSource: string | null;
  reviewed: boolean;
  media: ImportMediaDraft[];
  sources: ImportSourceDraft[];
}

export type AppRole = "owner" | "curator" | "viewer" | "local";

export interface UserSession {
  mode: "local" | "supabase";
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  role: AppRole;
}
