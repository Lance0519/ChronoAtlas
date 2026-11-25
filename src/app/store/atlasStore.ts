import { createContext } from "react";
import type { Dispatch } from "react";
import type { AtlasFilters, AtlasState, LocationRole } from "../../types/atlas";

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
  | { type: "clearSelection" };

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
      return { ...state, filters: { ...state.filters, ...action.patch } };
    case "resetFilters":
      return { ...state, filters: defaultFilters };
    case "clearSelection":
      return { ...state, activeEntryId: null, activeLocationRole: null };
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
  return {
    query: params.get("q") ?? "",
    scope: scope === "local" || scope === "international" ? scope : "all",
    entryType: entryType === "place" || entryType === "artifact" ? entryType : "all",
    minYear: year("from"),
    maxYear: year("to"),
    searchThisArea: params.get("area") !== "false",
  };
}

export function filtersToSearch(filters: AtlasFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.entryType !== "all") params.set("type", filters.entryType);
  if (filters.minYear !== null) params.set("from", String(filters.minYear));
  if (filters.maxYear !== null) params.set("to", String(filters.maxYear));
  if (!filters.searchThisArea) params.set("area", "false");
  const search = params.toString();
  return search ? `?${search}` : "";
}
