import { useCallback, useEffect, useMemo, useState } from "react";
import { BookPlus, HelpCircle, UserCheck, UserRound } from "lucide-react";
import { useAtlas } from "./hooks/useAtlas";
import { AtlasProvider } from "./providers/AtlasProvider";
import { ContextDrawer } from "../components/drawer/ContextDrawer";
import { DiscoveryFeed } from "../components/feed/DiscoveryFeed";
import { WikiImportDialog } from "../components/importer/WikiImportDialog";
import { AuthCuratorDialog } from "../components/layout/AuthCuratorDialog";
import { OnboardingTour } from "../components/layout/OnboardingTour";
import { ThreePaneLayout, type MobilePane } from "../components/layout/ThreePaneLayout";
import { AtlasMap } from "../components/map/AtlasMap";
import { useActiveEntry } from "../hooks/useActiveEntry";
import { FEED_RESULT_CAP, useAtlasEntries } from "../hooks/useAtlasEntries";
import { useAuthSession } from "../hooks/useAuthSession";
import type { ViewportBounds } from "../types/atlas";

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function Workspace() {
  const { state, dispatch } = useAtlas();
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourMobilePane, setTourMobilePane] = useState<MobilePane | null>(null);
  const [journeyRequestCount, setJourneyRequestCount] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem("chronoatlas.tour.v1")) setTourOpen(true);
    } catch {
      // Storage can be blocked; the guide still opens on replay.
    }
  }, []);

  const {
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
  } = useAtlasEntries(state.filters, bounds);

  const activeEntryState = useActiveEntry(state.activeEntryId, corpusRevision);
  const { session, isLocalMode } = useAuthSession();

  const activeIndex = useMemo(
    () => (state.activeEntryId ? entries.findIndex((item) => item.id === state.activeEntryId) : -1),
    [entries, state.activeEntryId],
  );

  const hasPrevEntry = entries.length > 0 && activeIndex > 0;
  const hasNextEntry =
    entries.length > 0 && (activeIndex === -1 || activeIndex < entries.length - 1);

  const selectPrevEntry = useCallback(() => {
    if (!hasPrevEntry) return;
    const prev = entries[activeIndex - 1];
    if (prev) {
      dispatch({ type: "selectEntry", id: prev.id, role: "origin" });
    }
  }, [hasPrevEntry, entries, activeIndex, dispatch]);

  const selectNextEntry = useCallback(() => {
    if (!hasNextEntry) return;
    const next = activeIndex === -1 ? entries[0] : entries[activeIndex + 1];
    if (next) {
      dispatch({ type: "selectEntry", id: next.id, role: "origin" });
    }
  }, [hasNextEntry, activeIndex, entries, dispatch]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (importOpen || authOpen || tourOpen) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (event.key === "Escape") {
        if (state.isContextDrawerOpen && !isEditableElement(event.target)) {
          event.preventDefault();
          dispatch({ type: "closeDrawer" });
        }
        return;
      }

      if (isEditableElement(event.target)) return;

      if (event.key === "/") {
        const searchInput = document.querySelector<HTMLInputElement>("#feed-search");
        if (searchInput) {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      } else if (event.key === "[") {
        event.preventDefault();
        selectPrevEntry();
      } else if (event.key === "]") {
        event.preventDefault();
        selectNextEntry();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    importOpen,
    authOpen,
    tourOpen,
    state.isContextDrawerOpen,
    dispatch,
    selectPrevEntry,
    selectNextEntry,
  ]);

  const handleTourStepChange = useCallback(
    (_step: number, target: string | null) => {
      if (target === "feed" || target === "search" || target === "records") {
        setTourMobilePane("feed");
      } else if (target === "map") {
        setTourMobilePane("map");
      } else if (target === "drawer") {
        if (!state.activeEntryId) {
          dispatch({ type: "selectEntry", id: "e-intramuros", role: "origin" });
        } else if (!state.isContextDrawerOpen) {
          dispatch({ type: "openDrawer" });
        }
        setTourMobilePane("drawer");
      } else {
        setTourMobilePane(null);
      }
    },
    [state.activeEntryId, state.isContextDrawerOpen, dispatch],
  );

  const authButtonLabel = isLocalMode
    ? "Local archive"
    : session.authenticated
      ? `${session.email ?? "Signed in"} (${session.role})`
      : "Sign in";

  return (
    <>
      <ThreePaneLayout
        tourMobilePane={tourOpen ? tourMobilePane : null}
        headerActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Guide"
              data-tour="guide"
              onClick={() => setTourOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 border border-rule bg-paper px-3 py-1.5 text-xs text-ink transition-colors duration-150 hover:border-ink md:min-h-9"
            >
              <HelpCircle aria-hidden="true" size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Guide</span>
            </button>
            <button
              type="button"
              aria-label="Import Wikipedia"
              data-tour="import"
              onClick={() => setImportOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 border border-rule bg-sheet px-3 py-1.5 text-xs text-ink transition-colors duration-150 hover:border-ink hover:bg-paper md:min-h-9"
            >
              <BookPlus aria-hidden="true" size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Import Wikipedia</span>
            </button>
            <button
              type="button"
              aria-label={authButtonLabel}
              data-tour="archive"
              onClick={() => setAuthOpen(true)}
              className="inline-flex min-h-11 max-w-[220px] items-center gap-1.5 border border-rule bg-sheet px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-ink hover:text-ink md:min-h-9"
            >
              {isLocalMode ? (
                <span className="size-1.5 shrink-0 bg-ochre" aria-hidden="true" />
              ) : session.authenticated ? (
                <UserCheck
                  aria-hidden="true"
                  size={14}
                  strokeWidth={1.5}
                  className="shrink-0 text-harbor"
                />
              ) : (
                <UserRound aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
              )}
              <span className="hidden truncate sm:inline">{authButtonLabel}</span>
            </button>
          </div>
        }
        feed={
          <DiscoveryFeed
            entries={entries}
            loading={loading}
            error={error}
            onRetry={retry}
            onClearArea={() => dispatch({ type: "setFilter", patch: { searchThisArea: false } })}
            totalMatched={totalMatched}
            worldwideMatched={worldwideMatched}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onOpenImporter={() => setImportOpen(true)}
            resultCap={FEED_RESULT_CAP}
          />
        }
        map={
          <AtlasMap
            entries={entries}
            bounds={bounds}
            onBoundsChange={setBounds}
            activeEntry={activeEntryState.entry}
            activeLinks={activeEntryState.links}
            journeyRequestCount={journeyRequestCount}
          />
        }
        drawer={
          <ContextDrawer
            activeEntryState={activeEntryState}
            corpusRevision={corpusRevision}
            onOpenAuth={() => setAuthOpen(true)}
            onPrevEntry={selectPrevEntry}
            onNextEntry={selectNextEntry}
            hasPrevEntry={hasPrevEntry}
            hasNextEntry={hasNextEntry}
            onViewFullJourney={() => setJourneyRequestCount((value) => value + 1)}
          />
        }
      />

      <WikiImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onOpenAuth={() => setAuthOpen(true)}
        onImported={(entry) => {
          setImportOpen(false);
          dispatch({ type: "selectEntry", id: entry.id, role: "origin" });
        }}
      />

      <AuthCuratorDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        corpusRevision={corpusRevision}
      />

      <OnboardingTour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false);
          setTourMobilePane(null);
        }}
        onStepChange={handleTourStepChange}
      />
    </>
  );
}

export default function App() {
  return (
    <AtlasProvider>
      <Workspace />
    </AtlasProvider>
  );
}
