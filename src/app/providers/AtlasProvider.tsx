import { useEffect, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import {
  AtlasContext,
  atlasReducer,
  initialAtlasState,
  stateFromUrl,
  stateToSearch,
} from "../store/atlasStore";

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(atlasReducer, initialAtlasState, () =>
    stateFromUrl(window.location.search),
  );

  useEffect(() => {
    const search = stateToSearch(state);
    const next = `${window.location.pathname}${search}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }, [state]);

  useEffect(() => {
    const handlePopState = () => {
      dispatch({ type: "syncFromUrl", state: stateFromUrl(window.location.search) });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}
