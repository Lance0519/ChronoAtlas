import { createContext } from "react";
import type { Dispatch } from "react";
import type { AtlasFilters, AtlasSortOrder, AtlasState, LocationRole } from "../../types/atlas";

export const defaultFilters: AtlasFilters = {
  query: "",
  scope: "all",
  entryType: "all",
  minYear: null,
  maxYear: null,
  searchThisArea: true,
};

export const initialAtlasState: AtlasState = {
  activeEntryId: null,
  activeLocationRole: null,
  filters: defaultFilters,
  isContextDrawerOpen: false,
};

export type AtlasAction =
  | { type: "selectEntry"; id: string; role: LocationRole }
  | { type: "setRole"; role: LocationRole }
  | { type: "openDrawer" }
  | { type: "closeDrawer" }
  | { type: "setFilter"; patch: Partial<AtlasFilters> }
  | { type: "resetFilters" }
  | { type: "clearSelection" }
  | { type: "syncFromUrl"; state: AtlasState };

export function normalizeFilters(filters: AtlasFilters): AtlasFilters {
  const next: AtlasFilters = {
    query: filters.query,
    scope: filters.scope,
    entryType: filters.entryType,
    minYear: filters.minYear,
    maxYear: filters.maxYear,
    searchThisArea: filters.searchThisArea,
  };
  if (filters.sort && filters.sort !== "relevance") {
    next.sort = filters.sort;
  }
  if (filters.onlyCompared) {
    next.onlyCompared = true;
  }
  if (filters.onlyVisited) {
    next.onlyVisited = true;
  }
  return next;
}

export function atlasReducer(state: AtlasState, action: AtlasAction): AtlasState {
  switch (action.type) {
    case "selectEntry":
      return {
        ...state,
        activeEntryId: action.id,
        activeLocationRole: action.role,
        isContextDrawerOpen: true,
      };
    case "setRole":
      return { ...state, activeLocationRole: action.role };
    case "openDrawer":
      return { ...state, isContextDrawerOpen: true };
    case "closeDrawer":
      return { ...state, isContextDrawerOpen: false };
    case "setFilter":
      return { ...state, filters: normalizeFilters({ ...state.filters, ...action.patch }) };
    case "resetFilters":
      return { ...state, filters: defaultFilters };
    case "clearSelection":
      return { ...state, activeEntryId: null, activeLocationRole: null };
    case "syncFromUrl":
      return action.state;
  }
}

export interface AtlasContextValue {
  state: AtlasState;
  dispatch: Dispatch<AtlasAction>;
}

export const AtlasContext = createContext<AtlasContextValue | null>(null);

export function filtersFromUrl(search: string): AtlasFilters {
  const params = new URLSearchParams(search);
  const year = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  };
  const scope = params.get("scope");
  const entryType = params.get("type");
  const sort = params.get("sort");
  const parsedSort: AtlasSortOrder | undefined =
    sort === "oldest" || sort === "newest" ? sort : undefined;

  return normalizeFilters({
    query: params.get("q") ?? "",
    scope: scope === "local" || scope === "international" ? scope : "all",
    entryType: entryType === "place" || entryType === "artifact" ? entryType : "all",
    minYear: year("from"),
    maxYear: year("to"),
    searchThisArea: params.get("area") !== "false",
    sort: parsedSort,
    onlyCompared: params.get("compare") === "true",
    onlyVisited: params.get("visited") === "true",
  });
}

export function filtersToSearch(filters: AtlasFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.entryType !== "all") params.set("type", filters.entryType);
  if (filters.minYear !== null) params.set("from", String(filters.minYear));
  if (filters.maxYear !== null) params.set("to", String(filters.maxYear));
  if (!filters.searchThisArea) params.set("area", "false");
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.onlyCompared) params.set("compare", "true");
  if (filters.onlyVisited) params.set("visited", "true");
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function stateFromUrl(search: string): AtlasState {
  const params = new URLSearchParams(search);
  const filters = filtersFromUrl(search);
  const rawEntry = params.get("entry")?.trim() ?? "";
  const rawRole = params.get("role");
  const activeEntryId = rawEntry ? rawEntry : null;
  const activeLocationRole: LocationRole | null = activeEntryId
    ? rawRole === "current"
      ? "current"
      : "origin"
    : null;
  const drawerClosed = params.get("drawer") === "closed";

  return {
    activeEntryId,
    activeLocationRole,
    filters,
    isContextDrawerOpen: Boolean(activeEntryId) && !drawerClosed,
  };
}

export function stateToSearch(state: AtlasState): string {
  const base = filtersToSearch(state.filters);
  const params = new URLSearchParams(base.startsWith("?") ? base.slice(1) : base);
  if (state.activeEntryId) {
    params.set("entry", state.activeEntryId);
    if (state.activeLocationRole === "current") {
      params.set("role", "current");
    }
    if (!state.isContextDrawerOpen) {
      params.set("drawer", "closed");
    }
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}
