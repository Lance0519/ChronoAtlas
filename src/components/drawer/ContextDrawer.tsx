import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Eraser,
  ExternalLink,
  FileClock,
  RefreshCw,
  X,
} from "lucide-react";
import { useAtlas } from "../../app/hooks/useAtlas";
import { useActiveEntry, type ActiveEntryState } from "../../hooks/useActiveEntry";
import { useAuthSession } from "../../hooks/useAuthSession";
import { usePersonalProgress } from "../../hooks/usePersonalProgress";
import { formatCoordinate, formatYearRange } from "../../lib/format";
import { getComparisonPair } from "../../lib/media";
import { isSafeExternalUrl } from "../../lib/validators";
import { getEntry, isUuid, toggleEntryReviewed } from "../../services/entriesService";
import type { DirectedEntryLink, HistoricalEntry, SourceRef, UserSession } from "../../types/atlas";
import { ErrorMessage, PanelMessage } from "../ui/States";
import { PhotoGallery } from "./PhotoGallery";

interface ContextDrawerProps {
  activeEntryState?: ActiveEntryState;
  corpusRevision?: number;
  onOpenAuth?: () => void;
}

export function ContextDrawer({
  activeEntryState,
  corpusRevision = 0,
  onOpenAuth,
}: ContextDrawerProps = {}) {
  const { state, dispatch } = useAtlas();
  const { session, canCurate } = useAuthSession();
  const fallbackEntryState = useActiveEntry(
    activeEntryState ? null : state.activeEntryId,
    corpusRevision,
  );
  const resolvedState = activeEntryState ?? fallbackEntryState;
  const { entry, media, sources, links, loading, error, retry } = resolvedState;

  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  if (!state.activeEntryId) {
    return (
      <section aria-label="Context drawer" className="flex h-full w-full flex-col bg-sheet">
        <div className="border-b border-rule px-5 py-3">
          <h2 className="text-[22px] leading-tight">Context</h2>
        </div>
        <PanelMessage title="Nothing selected">
          Choose a record in the feed or a marker on the map to read its context, sources, and
          media.
        </PanelMessage>
      </section>
    );
  }

  if (loading && !entry) {
    return (
      <section aria-label="Context drawer" className="flex h-full w-full flex-col bg-sheet">
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3">
          <div>
            <p className="caption-label">Context</p>
            <h2 className="mt-1 font-display text-[24px] leading-tight text-ink">
              Loading record…
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => dispatch({ type: "clearSelection" })}
              className="border border-rule p-1.5 text-muted hover:border-ink hover:text-ink"
            >
              <Eraser aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Close context drawer"
              onClick={() => dispatch({ type: "closeDrawer" })}
              className="border border-rule p-1.5 text-muted hover:border-ink hover:text-ink"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <div aria-busy="true" className="space-y-3 px-5 py-5">
          <div className="h-4 w-2/3 animate-pulse bg-rule" />
          <div className="h-4 w-1/2 animate-pulse bg-rule/70" />
          <div className="mt-4 aspect-[4/3] w-full animate-pulse bg-rule/50" />
        </div>
      </section>
    );
  }

  if (!entry) {
    return (
      <section aria-label="Context drawer" className="flex h-full w-full flex-col bg-sheet">
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3">
          <h2 className="text-[22px] leading-tight">Context</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => dispatch({ type: "clearSelection" })}
              className="border border-rule p-1.5 text-muted hover:border-ink hover:text-ink"
            >
              <Eraser aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Close context drawer"
              onClick={() => dispatch({ type: "closeDrawer" })}
              className="border border-rule p-1.5 text-muted hover:border-ink hover:text-ink"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <PanelMessage
          title="Record unavailable"
          action={
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={retry}
                className="border border-ink px-3 py-1.5 text-xs hover:bg-ink hover:text-sheet"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "clearSelection" })}
                className="border border-rule px-3 py-1.5 text-xs text-muted hover:border-ink hover:text-ink"
              >
                Clear selection
              </button>
            </div>
          }
        >
          {error ?? "The selected historical record could not be located."}
        </PanelMessage>
      </section>
    );
  }

  const handleToggleReviewed = async () => {
    setReviewBusy(true);
    setReviewError(null);
    try {
      await toggleEntryReviewed(entry.id, !entry.reviewed);
    } catch (err: unknown) {
      setReviewError(
        err instanceof Error && err.message ? err.message : "Could not update review status.",
      );
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <section aria-label="Context drawer" className="flex h-full w-full min-h-0 flex-col bg-sheet">
      <header className="border-b border-rule px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="caption-label">
              Context · {state.activeLocationRole === "current" ? "current location" : "origin"}
            </p>
            <h2 className="mt-1 font-display text-[34px] leading-[1.05] text-ink">{entry.title}</h2>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Clear selection"
              title="Clear selection"
              onClick={() => dispatch({ type: "clearSelection" })}
              className="grid size-11 place-items-center border border-rule text-muted hover:border-ink hover:text-ink md:size-8"
            >
              <Eraser aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Close context drawer"
              title="Close context drawer"
              onClick={() => dispatch({ type: "closeDrawer" })}
              className="grid size-11 place-items-center border border-rule text-muted hover:border-ink hover:text-ink md:size-8"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          {entry.reviewed ? (
            <span className="inline-flex items-center gap-1 border border-harbor px-2 py-0.5 text-[11px] text-harbor">
              <CheckCircle2 aria-hidden="true" size={12} strokeWidth={1.5} />
              Curated · reviewed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 border border-ochre px-2 py-0.5 text-[11px] text-ochre">
              <FileClock aria-hidden="true" size={12} strokeWidth={1.5} />
              Draft · unreviewed
            </span>
          )}

          {canCurate && (
            <button
              type="button"
              disabled={reviewBusy}
              onClick={() => void handleToggleReviewed()}
              className="border border-rule bg-paper px-2 py-0.5 text-[11px] text-ink hover:border-ink disabled:opacity-50"
            >
              {reviewBusy ? "Updating…" : entry.reviewed ? "Mark as draft" : "Mark as reviewed"}
            </button>
          )}
        </div>
        {reviewError && (
          <p role="alert" className="mt-2 text-xs text-[#7a3720]">
            {reviewError}
          </p>
        )}
      </header>

      {error && <ErrorMessage onRetry={retry}>{error}</ErrorMessage>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <Metadata entry={entry} />
        <PhotoGallery
          key={entry.id}
          entryId={entry.id}
          media={media}
          pair={getComparisonPair(media)}
        />

        <section className="border-b border-rule py-4">
          <h3 className="caption-label">Summary</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink">{entry.summary}</p>
          {entry.significance && (
            <p className="mt-3 text-sm leading-relaxed text-muted">{entry.significance}</p>
          )}
          <p className="mt-3 text-[11px] italic text-muted">
            {entry.reviewed
              ? "Curated record. Consult primary sources below before citing."
              : "Unreviewed draft. Check the source before relying on this text."}
          </p>
        </section>

        <Relationships links={links} />
        <Sources sources={sources} />
        <ProgressPanel entryId={entry.id} session={session} onOpenAuth={onOpenAuth} />
      </div>
    </section>
  );
}

function Metadata({ entry }: { entry: HistoricalEntry }) {
  const { state, dispatch } = useAtlas();
  const role = entry.entryType === "artifact" ? "Artifact" : "Place";
  const isRelocated = entry.entryType === "artifact" && entry.current !== null;

  return (
    <section className="border-b border-rule pb-4">
      <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
        <Meta label="Type" value={`${entry.scope} · ${role}`} />
        <Meta
          label="Date"
          value={formatYearRange(entry.startYear, entry.endYear, entry.dateIsApproximate)}
        />
        <Meta label="Era" value={entry.era ?? "Not recorded"} />
        <Meta label="Place" value={entry.locationName ?? "Not recorded"} />

        <dt className="caption-label">{isRelocated ? "Origin site" : "Coordinates"}</dt>
        <dd className="min-w-0 break-words text-ink">
          <span className="tabular">
            {entry.origin
              ? formatCoordinate(
                  entry.origin.latitude,
                  entry.origin.longitude,
                  entry.originPrecision,
                )
              : "Not recorded"}
          </span>
          {entry.originSource && isSafeExternalUrl(entry.originSource) ? (
            <a
              href={entry.originSource}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ochre underline underline-offset-2 hover:text-ink"
            >
              Coordinate source <ExternalLink aria-hidden="true" size={10} strokeWidth={1.5} />
            </a>
          ) : (
            <span className="mt-0.5 block text-[11px] text-muted">
              Coordinate provenance not recorded
            </span>
          )}
        </dd>

        {isRelocated && entry.current && (
          <>
            <dt className="caption-label">Current location</dt>
            <dd className="min-w-0 break-words text-ink">
              <span className="tabular">
                {formatCoordinate(
                  entry.current.latitude,
                  entry.current.longitude,
                  entry.currentPrecision ?? "unknown",
                )}
              </span>
              {entry.currentSource && isSafeExternalUrl(entry.currentSource) ? (
                <a
                  href={entry.currentSource}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ochre underline underline-offset-2 hover:text-ink"
                >
                  Holding source <ExternalLink aria-hidden="true" size={10} strokeWidth={1.5} />
                </a>
              ) : (
                <span className="mt-0.5 block text-[11px] text-muted">
                  Holding provenance not recorded
                </span>
              )}
            </dd>
          </>
        )}
      </dl>

      {isRelocated && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            aria-pressed={state.activeLocationRole === "origin"}
            onClick={() => dispatch({ type: "setRole", role: "origin" })}
            className={`min-h-11 border px-3 py-1 text-[11px] md:min-h-0 md:px-2 ${state.activeLocationRole === "origin" ? "border-ochre text-ochre" : "border-rule text-muted hover:text-ink"}`}
          >
            Go to origin
          </button>
          <button
            type="button"
            aria-pressed={state.activeLocationRole === "current"}
            onClick={() => dispatch({ type: "setRole", role: "current" })}
            className={`min-h-11 border px-3 py-1 text-[11px] md:min-h-0 md:px-2 ${state.activeLocationRole === "current" ? "border-ochre text-ochre" : "border-rule text-muted hover:text-ink"}`}
          >
            Go to current location
          </button>
        </div>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="caption-label">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </>
  );
}

function formatRelType(raw: string): string {
  return raw.replaceAll("_", " ");
}

function Relationships({ links }: { links: DirectedEntryLink[] }) {
  const { dispatch } = useAtlas();

  return (
    <section className="border-b border-rule py-4">
      <h3 className="caption-label">Relationships</h3>
      {links.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No relationships are recorded.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {links.map((link) => {
            const otherId = link.direction === "out" ? link.targetId : link.sourceId;
            const other = getEntry(otherId);
            return (
              <li key={link.id}>
                <button
                  type="button"
                  disabled={!other}
                  onClick={() => {
                    if (other) {
                      dispatch({ type: "selectEntry", id: other.id, role: "origin" });
                    }
                  }}
                  className="flex w-full items-start gap-2 text-left text-xs hover:underline disabled:cursor-default disabled:no-underline"
                >
                  {link.direction === "out" ? (
                    <ArrowUpRight
                      aria-hidden="true"
                      size={14}
                      strokeWidth={1.5}
                      className="mt-0.5 shrink-0 text-ochre"
                    />
                  ) : (
                    <ArrowDownLeft
                      aria-hidden="true"
                      size={14}
                      strokeWidth={1.5}
                      className="mt-0.5 shrink-0 text-harbor"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="text-muted">
                      {link.direction === "out" ? "Outgoing" : "Incoming"} ·{" "}
                    </span>
                    <span className="border border-rule bg-paper px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                      {formatRelType(link.relationshipType)}
                    </span>{" "}
                    <span>{link.relationshipLabel}: </span>
                    <span className="text-ochre">{other ? other.title : `Record ${otherId}`}</span>
                    {link.description && (
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {link.description}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Sources({ sources }: { sources: SourceRef[] }) {
  return (
    <section className="border-b border-rule py-4">
      <h3 className="caption-label">Sources</h3>
      {sources.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No source is recorded.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {sources.map((source) => (
            <li key={source.id} className="text-xs">
              {isSafeExternalUrl(source.url) ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-ochre underline underline-offset-2 hover:text-ink"
                >
                  {source.title} <ExternalLink aria-hidden="true" size={11} strokeWidth={1.5} />
                </a>
              ) : (
                <span className="font-medium text-ink">{source.title}</span>
              )}
              <p className="text-muted">
                {source.publisher}
                {source.sourceType ? ` · ${source.sourceType}` : ""}
                {source.author ? ` · ${source.author}` : ""}
                {source.publicationYear ? ` (${source.publicationYear})` : ""} · accessed{" "}
                <span className="tabular">{source.accessedAt}</span>
              </p>
              {source.notes && <p className="mt-0.5 text-[11px] text-muted">{source.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProgressPanel({
  entryId,
  session,
  onOpenAuth,
}: {
  entryId: string;
  session: UserSession;
  onOpenAuth?: () => void;
}) {
  const {
    progress,
    loading,
    canPersist,
    saveState,
    errorMessage,
    isDirty,
    setVisited,
    setNotes,
    retrySave,
  } = usePersonalProgress(entryId, session);

  const isSupabaseSignedOut = session.mode === "supabase" && !session.authenticated;
  const isSupabaseNonUuid =
    session.mode === "supabase" && session.authenticated && !isUuid(entryId);

  const statusLabel = (() => {
    if (loading) return "Loading your notes…";
    if (saveState === "saving") return "Saving…";
    if (saveState === "error") return "Save failed";
    if (isDirty) return "Unsaved edits (autosaving…)";
    if (saveState === "saved") {
      return session.mode === "supabase" ? "Saved to account" : "Saved locally";
    }
    return session.mode === "supabase" ? "Private to your account" : "Stored locally";
  })();

  return (
    <section className="py-4">
      <h3 className="caption-label">Your private record</h3>
      <p className="mt-1 text-[11px] text-muted">
        {session.mode === "supabase"
          ? "Protected by row-level security. Not visible to other users."
          : "Stored in this browser. Not part of the public dataset."}
      </p>

      {isSupabaseSignedOut && (
        <div className="mt-3 border border-rule bg-paper px-3 py-2 text-xs text-muted">
          <p>Sign in to save personal visited status and notes.</p>
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="mt-2 border border-ink px-2.5 py-1 text-[11px] text-ink hover:bg-ink hover:text-sheet"
            >
              Sign in
            </button>
          )}
        </div>
      )}

      {isSupabaseNonUuid && (
        <p className="mt-3 border border-rule bg-paper px-3 py-2 text-xs text-muted">
          Personal progress in Supabase requires a database record UUID.
        </p>
      )}

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={progress.visited}
          disabled={!canPersist || loading}
          onChange={(event) => setVisited(event.target.checked)}
          className="size-4 accent-[#9a5b24] disabled:cursor-not-allowed disabled:opacity-50"
        />
        Marked as visited
      </label>

      <label htmlFor="personal-notes" className="caption-label mt-4 block">
        Notes
      </label>
      <textarea
        id="personal-notes"
        name="notes"
        rows={4}
        value={progress.notes}
        disabled={!canPersist || loading}
        onChange={(event) => setNotes(event.target.value)}
        placeholder={
          canPersist
            ? "What did you notice here? (Autosaves after pause)"
            : "Sign in to record private notes"
        }
        className="mt-1 w-full resize-y border border-rule bg-paper px-3 py-2 text-sm placeholder:text-muted/70 focus:border-ochre disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <p
          role="status"
          aria-live="polite"
          className={saveState === "error" ? "text-[#7a3720]" : "text-muted"}
        >
          {statusLabel}
        </p>
        {saveState === "error" && (
          <button
            type="button"
            onClick={retrySave}
            className="inline-flex items-center gap-1 border border-[#b8835c] bg-[#f7e9e2] px-2 py-0.5 text-[11px] text-[#7a3720] hover:bg-[#efd8cc]"
          >
            <RefreshCw aria-hidden="true" size={11} strokeWidth={1.5} />
            Retry
          </button>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="mt-1 text-xs text-[#7a3720]">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
