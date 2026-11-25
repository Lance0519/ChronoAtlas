import { useEffect, useState } from "react";
import { BookPlus, HelpCircle, UserCheck, UserRound } from "lucide-react";
import { useAtlas } from "./hooks/useAtlas";
import { AtlasProvider } from "./providers/AtlasProvider";
import { ContextDrawer } from "../components/drawer/ContextDrawer";
import { DiscoveryFeed } from "../components/feed/DiscoveryFeed";
import { WikiImportDialog } from "../components/importer/WikiImportDialog";
import { AuthCuratorDialog } from "../components/layout/AuthCuratorDialog";
import { OnboardingTour } from "../components/layout/OnboardingTour";
import { ThreePaneLayout } from "../components/layout/ThreePaneLayout";
import { AtlasMap } from "../components/map/AtlasMap";
import { useActiveEntry } from "../hooks/useActiveEntry";
import { FEED_RESULT_CAP, useAtlasEntries } from "../hooks/useAtlasEntries";
import { useAuthSession } from "../hooks/useAuthSession";
import type { ViewportBounds } from "../types/atlas";

function Workspace() {
  const { state, dispatch } = useAtlas();
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

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

  const authButtonLabel = isLocalMode
    ? "Local archive"
    : session.authenticated
      ? `${session.email ?? "Signed in"} (${session.role})`
      : "Sign in";

  return (
    <>
      <ThreePaneLayout
        headerActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Guide"
              data-tour="guide"
              onClick={() => setTourOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 border border-rule bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink md:min-h-9"
            >
              <HelpCircle aria-hidden="true" size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Guide</span>
            </button>
            <button
              type="button"
              aria-label="Import Wikipedia"
              data-tour="import"
              onClick={() => setImportOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 border border-rule bg-sheet px-3 py-1.5 text-xs text-ink hover:border-ink hover:bg-paper md:min-h-9"
            >
              <BookPlus aria-hidden="true" size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Import Wikipedia</span>
            </button>
            <button
              type="button"
              aria-label={authButtonLabel}
              data-tour="archive"
              onClick={() => setAuthOpen(true)}
              className="inline-flex min-h-11 max-w-[220px] items-center gap-1.5 border border-rule bg-sheet px-3 py-1.5 text-xs text-muted hover:border-ink hover:text-ink md:min-h-9"
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
          />
        }
        drawer={
          <ContextDrawer
            activeEntryState={activeEntryState}
            corpusRevision={corpusRevision}
            onOpenAuth={() => setAuthOpen(true)}
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

      <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
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
