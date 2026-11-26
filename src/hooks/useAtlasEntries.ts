import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeProgressChanges } from "./usePersonalProgress";
import {
  isExtendedCorpusLoaded,
  queryEntriesPage,
  subscribeCorpusLoaded,
} from "../services/entriesService";
import type { AtlasFilters, HistoricalEntry, ViewportBounds } from "../types/atlas";

export const FEED_PAGE_SIZE = 150;
export const FEED_RESULT_CAP = 500;
const QUERY_DEBOUNCE_MS = 180;

/**
 * Queries paginated historical records with debounce, stale-response protection,
 * corpus-load reactivity, and viewport isolation during global search.
 */
export function useAtlasEntries(filters: AtlasFilters, bounds: ViewportBounds | null) {
  const [entries, setEntries] = useState<HistoricalEntry[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [worldwideMatched, setWorldwideMatched] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [corpusRevision, setCorpusRevision] = useState(0);
  const [progressRevision, setProgressRevision] = useState(0);

  const generation = useRef(0);
  const queryTargetCount = useRef(FEED_PAGE_SIZE);
  const awaitingInitialExtended = useRef(false);
  const lastQuerySignature = useRef<string | null>(null);
  const isFirstRender = useRef(true);

  const effectiveBounds = useMemo<ViewportBounds | null>(() => {
    if (!filters.searchThisArea || !bounds) return null;
    return {
      minLat: bounds.minLat,
      minLon: bounds.minLon,
      maxLat: bounds.maxLat,
      maxLon: bounds.maxLon,
    };
  }, [filters.searchThisArea, bounds]);

  const querySignature = useMemo(
    () =>
      JSON.stringify([
        filters,
        effectiveBounds,
        retryCount,
        filters.onlyVisited ? progressRevision : 0,
      ]),
    [filters, effectiveBounds, retryCount, progressRevision],
  );

  useEffect(() => {
    return subscribeCorpusLoaded(() => {
      if (awaitingInitialExtended.current) {
        awaitingInitialExtended.current = false;
        return;
      }
      setCorpusRevision((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeProgressChanges(() => {
      setProgressRevision((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    const requestId = ++generation.current;
    const isFilterOrViewportChange = lastQuerySignature.current !== querySignature;
    lastQuerySignature.current = querySignature;

    if (isFilterOrViewportChange) {
      queryTargetCount.current = FEED_PAGE_SIZE;
      setLoading(true);
      setLoadingMore(false);
    }

    // Skip artificial debounce on the very first mount so initial records paint immediately.
    const shouldDebounce = isFilterOrViewportChange && !isFirstRender.current;
    isFirstRender.current = false;
    const delay = shouldDebounce ? QUERY_DEBOUNCE_MS : 0;

    const timer = window.setTimeout(() => {
      if (requestId !== generation.current) return;
      if (!isExtendedCorpusLoaded()) {
        awaitingInitialExtended.current = true;
      }

      const limit = Math.min(queryTargetCount.current, FEED_RESULT_CAP);

      void queryEntriesPage(filters, effectiveBounds, { limit, offset: 0 })
        .then((page) => {
          if (requestId !== generation.current) return;
          awaitingInitialExtended.current = false;
          setEntries(page.entries);
          setHasMore(page.hasMore);
          setNextOffset(page.nextOffset);
          setTotalMatched(page.totalMatched);
          setWorldwideMatched(page.worldwideMatched);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (requestId !== generation.current) return;
          awaitingInitialExtended.current = false;
          const message =
            err instanceof Error && err.message
              ? err.message
              : "The historical archive could not be queried. Try again.";
          setError(message);
          setLoading(false);
        });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [filters, effectiveBounds, querySignature, corpusRevision]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || entries.length >= FEED_RESULT_CAP) return;

    const requestId = generation.current;
    const offset = nextOffset ?? entries.length;
    const remaining = FEED_RESULT_CAP - entries.length;
    const limit = Math.min(FEED_PAGE_SIZE, remaining);
    if (limit <= 0) return;

    setLoadingMore(true);
    void queryEntriesPage(filters, effectiveBounds, { limit, offset })
      .then((page) => {
        if (requestId !== generation.current) return;
        setEntries((current) => {
          const seen = new Set(current.map((item) => item.id));
          const merged = [...current];
          for (const item of page.entries) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          queryTargetCount.current = merged.length;
          return merged;
        });
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
        setTotalMatched((prev) => Math.max(prev, page.totalMatched));
        if (page.worldwideMatched !== undefined) {
          setWorldwideMatched(page.worldwideMatched);
        }
        setError(null);
        setLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (requestId !== generation.current) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Additional records could not be loaded. Try again.";
        setError(message);
        setLoadingMore(false);
      });
  }, [loading, loadingMore, hasMore, entries.length, nextOffset, filters, effectiveBounds]);

  const retry = useCallback(() => setRetryCount((value) => value + 1), []);

  return {
    entries,
    totalMatched,
    worldwideMatched,
    hasMore,
    loading,
    loadingMore,
    error,
    corpusRevision,
    loadMore,
    retry,
  };
}
