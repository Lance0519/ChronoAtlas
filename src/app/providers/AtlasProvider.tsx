import { useEffect, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import {
  AtlasContext,
  atlasReducer,
  filtersFromUrl,
  filtersToSearch,
  initialAtlasState,
} from "../store/atlasStore";

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(atlasReducer, initialAtlasState, (initial) => ({
    ...initial,
    filters: filtersFromUrl(window.location.search),
  }));

  useEffect(() => {
    const search = filtersToSearch(state.filters);
    const next = `${window.location.pathname}${search}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [state.filters]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}
