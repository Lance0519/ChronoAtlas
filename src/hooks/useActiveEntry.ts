import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  ensureExtendedCorpusLoaded,
  fetchEntryDetail,
  getEntry,
  isExtendedCorpusLoaded,
} from "../services/entriesService";
import { fetchLinksForEntry, getLinksForEntry } from "../services/entryLinksService";
import { fetchMediaForEntry, getMediaForEntry } from "../services/mediaService";
import { fetchSourcesForEntry, getSourcesForEntry } from "../services/sourcesService";
import type { DirectedEntryLink, HistoricalEntry, MediaItem, SourceRef } from "../types/atlas";

export interface ActiveEntryState {
  entry: HistoricalEntry | undefined;
  media: MediaItem[];
  sources: SourceRef[];
  links: DirectedEntryLink[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Resolves the active entry and its media, sources, and links across both
 * local lazy corpus and async Supabase fetches with stale-request protection.
 */
export function useActiveEntry(activeEntryId: string | null, corpusRevision = 0): ActiveEntryState {
  const [entry, setEntry] = useState<HistoricalEntry | undefined>(() =>
    activeEntryId ? getEntry(activeEntryId) : undefined,
  );
  const [media, setMedia] = useState<MediaItem[]>(() =>
    activeEntryId ? getMediaForEntry(activeEntryId) : [],
  );
  const [sources, setSources] = useState<SourceRef[]>(() =>
    activeEntryId ? getSourcesForEntry(activeEntryId) : [],
  );
  const [links, setLinks] = useState<DirectedEntryLink[]>(() =>
    activeEntryId ? getLinksForEntry(activeEntryId) : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const requestId = ++generation.current;
    if (!activeEntryId) {
      setEntry(undefined);
      setMedia([]);
      setSources([]);
      setLinks([]);
      setLoading(false);
      setError(null);
      return;
    }

    const syncEntry = getEntry(activeEntryId);
    setEntry(syncEntry);
    setMedia(getMediaForEntry(activeEntryId));
    setSources(getSourcesForEntry(activeEntryId));
    setLinks(getLinksForEntry(activeEntryId));
    setError(null);
    setLoading(!syncEntry || isSupabaseConfigured());

    let cancelled = false;

    const load = async () => {
      try {
        if (!isSupabaseConfigured() && !isExtendedCorpusLoaded()) {
          await ensureExtendedCorpusLoaded();
        }
        if (cancelled || requestId !== generation.current) return;

        const [detailResult, mediaResult, sourcesResult, linksResult] = await Promise.allSettled([
          fetchEntryDetail(activeEntryId),
          fetchMediaForEntry(activeEntryId),
          fetchSourcesForEntry(activeEntryId),
          fetchLinksForEntry(activeEntryId),
        ]);

        if (cancelled || requestId !== generation.current) return;

        const nextEntry =
          detailResult.status === "fulfilled" ? detailResult.value : getEntry(activeEntryId);
        setEntry(nextEntry);

        if (mediaResult.status === "fulfilled") {
          setMedia(mediaResult.value);
        }
        if (sourcesResult.status === "fulfilled") {
          setSources(sourcesResult.value);
        }
        if (linksResult.status === "fulfilled") {
          setLinks(linksResult.value);
        }

        const firstRejection = [detailResult, mediaResult, sourcesResult, linksResult].find(
          (res): res is PromiseRejectedResult => res.status === "rejected",
        );

        if (firstRejection) {
          const reason = firstRejection.reason;
          setError(
            reason instanceof Error && reason.message
              ? reason.message
              : "Some details for this record could not be loaded.",
          );
        } else {
          setError(null);
        }
      } catch (err: unknown) {
        if (cancelled || requestId !== generation.current) return;
        setError(
          err instanceof Error && err.message ? err.message : "Record details could not be loaded.",
        );
      } finally {
        if (!cancelled && requestId === generation.current) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeEntryId, corpusRevision, retryCount]);

  const retry = useCallback(() => setRetryCount((value) => value + 1), []);

  return { entry, media, sources, links, loading, error, retry };
}
