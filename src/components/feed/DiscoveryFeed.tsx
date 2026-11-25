import { useEffect, useRef, useState } from "react";
import {
  BookPlus,
  CheckCircle2,
  MapPin,
  MapPinOff,
  Package,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useAtlas } from "../../app/hooks/useAtlas";
import { defaultFilters } from "../../app/store/atlasStore";
import { FEED_RESULT_CAP } from "../../hooks/useAtlasEntries";
import { getCachedProgress, subscribeProgressChanges } from "../../hooks/usePersonalProgress";
import { formatYearRange } from "../../lib/format";
import type { EntryTypeFilter, HistoricalEntry, ScopeFilter } from "../../types/atlas";
import { ErrorMessage, PanelMessage, SkeletonRows } from "../ui/States";

interface DiscoveryFeedProps {
  entries: HistoricalEntry[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClearArea: () => void;
  totalMatched?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenImporter?: () => void;
  resultCap?: number;
}

const ERA_PRESETS: Array<{
  id: string;
  label: string;
  minYear: number | null;
  maxYear: number | null;
}> = [
  { id: "all", label: "All", minYear: null, maxYear: null },
  { id: "ancient", label: "Ancient (≤500)", minYear: null, maxYear: 500 },
  { id: "pre1521", label: "Pre-1521", minYear: null, maxYear: 1520 },
  { id: "colonial", label: "1521–1898", minYear: 1521, maxYear: 1898 },
  { id: "modern", label: "1899+", minYear: 1899, maxYear: null },
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
  );
}

export function DiscoveryFeed({
  entries,
  loading,
  error,
  onRetry,
  onClearArea,
  totalMatched,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onOpenImporter,
  resultCap = FEED_RESULT_CAP,
}: DiscoveryFeedProps) {
  const { state, dispatch } = useAtlas();
  const { filters, activeEntryId } = state;
  const [draftQuery, setDraftQuery] = useState(filters.query);
  const [, setProgressTick] = useState(0);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastScrolledId = useRef<string | null>(null);
  const lastDispatchedQuery = useRef(filters.query);

  useEffect(() => {
    return subscribeProgressChanges(() => setProgressTick((value) => value + 1));
  }, []);

  useEffect(() => {
    if (filters.query !== lastDispatchedQuery.current) {
      lastDispatchedQuery.current = filters.query;
      setDraftQuery(filters.query);
    }
  }, [filters.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftQuery !== filters.query) {
        lastDispatchedQuery.current = draftQuery;
        dispatch({ type: "setFilter", patch: { query: draftQuery } });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftQuery, filters.query, dispatch]);

  useEffect(() => {
    if (!activeEntryId) {
      lastScrolledId.current = null;
      return;
    }
    if (lastScrolledId.current === activeEntryId) return;
    const cardEl = cardRefs.current.get(activeEntryId);
    if (!cardEl) return;
    lastScrolledId.current = activeEntryId;
    if (typeof cardEl.scrollIntoView === "function") {
      cardEl.scrollIntoView({
        block: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  }, [activeEntryId, entries]);

  const hasNonDefaultFilters =
    filters.query !== defaultFilters.query ||
    filters.scope !== defaultFilters.scope ||
    filters.entryType !== defaultFilters.entryType ||
    filters.minYear !== defaultFilters.minYear ||
    filters.maxYear !== defaultFilters.maxYear ||
    filters.searchThisArea !== defaultFilters.searchThisArea;

  const isCapped = entries.length >= resultCap && hasMore;

  const countLabel = (() => {
    if (loading) return "Loading…";
    if (totalMatched !== undefined && totalMatched > entries.length) {
      return `${entries.length} of ${totalMatched}${isCapped ? "+" : ""} shown`;
    }
    return `${entries.length} shown`;
  })();

  const parseYearInput = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
  };

  return (
    <section
      aria-label="Discovery feed"
      data-tour="feed"
      className="flex h-full w-full min-h-0 flex-col bg-sheet"
    >
      <div className="border-b border-rule px-4 py-3">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[22px] leading-tight text-ink">Records</h2>
          <div className="flex items-center gap-2">
            <span className="caption-label tabular" aria-live="polite">
              {countLabel}
            </span>
            {onOpenImporter && (
              <button
                type="button"
                onClick={onOpenImporter}
                className="inline-flex items-center gap-1 border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:border-ink"
              >
                <BookPlus aria-hidden="true" size={12} strokeWidth={1.5} />
                Import
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <label htmlFor="feed-search" className="sr-only">
            Search titles, eras, and locations
          </label>
          <Search
            aria-hidden="true"
            size={16}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2 top-3 text-muted"
          />
          <input
            id="feed-search"
            data-tour="search"
            type="search"
            name="q"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search titles, eras, places…"
            autoComplete="off"
            className="w-full border border-rule bg-paper py-2 pl-8 pr-8 text-sm placeholder:text-muted/80 focus:border-ochre"
          />
          {draftQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setDraftQuery("")}
              className="absolute right-1 top-1.5 p-1 text-muted hover:text-ink"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>

        <FilterRow
          label="Scope"
          options={[
            ["all", "All"],
            ["local", "Local"],
            ["international", "International"],
          ]}
          value={filters.scope}
          onChange={(value) =>
            dispatch({ type: "setFilter", patch: { scope: value as ScopeFilter } })
          }
        />
        <FilterRow
          label="Type"
          options={[
            ["all", "All"],
            ["place", "Places"],
            ["artifact", "Artifacts"],
          ]}
          value={filters.entryType}
          onChange={(value) =>
            dispatch({ type: "setFilter", patch: { entryType: value as EntryTypeFilter } })
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="caption-label w-10 shrink-0">Era</span>
          <div role="group" aria-label="Era presets" className="flex flex-wrap gap-x-3 gap-y-1">
            {ERA_PRESETS.map((preset) => {
              const pressed =
                filters.minYear === preset.minYear && filters.maxYear === preset.maxYear;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() =>
                    dispatch({
                      type: "setFilter",
                      patch: { minYear: preset.minYear, maxYear: preset.maxYear },
                    })
                  }
                  className={`border-b-2 pb-0.5 text-xs transition-colors duration-150 hover:text-ink ${
                    pressed ? "border-ochre text-ink" : "border-transparent text-muted"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted" htmlFor="year-from">
            From
            <input
              id="year-from"
              type="number"
              name="from"
              inputMode="numeric"
              value={filters.minYear ?? ""}
              onChange={(event) =>
                dispatch({
                  type: "setFilter",
                  patch: { minYear: parseYearInput(event.target.value) },
                })
              }
              placeholder="Any"
              className="w-20 border border-rule bg-paper px-2 py-1 tabular text-ink focus:border-ochre"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted" htmlFor="year-to">
            To
            <input
              id="year-to"
              type="number"
              name="to"
              inputMode="numeric"
              value={filters.maxYear ?? ""}
              onChange={(event) =>
                dispatch({
                  type: "setFilter",
                  patch: { maxYear: parseYearInput(event.target.value) },
                })
              }
              placeholder="Any"
              className="w-20 border border-rule bg-paper px-2 py-1 tabular text-ink focus:border-ochre"
            />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Astronomical years (e.g. <span className="tabular">-499</span> = 500 BCE,{" "}
          <span className="tabular">0</span> = 1 BCE).
        </p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              name="area"
              checked={filters.searchThisArea}
              onChange={(event) =>
                dispatch({ type: "setFilter", patch: { searchThisArea: event.target.checked } })
              }
              className="size-4 accent-[#9a5b24]"
            />
            Search this map area
          </label>

          {hasNonDefaultFilters && (
            <button
              type="button"
              onClick={() => {
                setDraftQuery("");
                lastDispatchedQuery.current = "";
                dispatch({ type: "resetFilters" });
              }}
              className="inline-flex items-center gap-1 border border-rule px-2 py-1 text-[11px] text-muted hover:border-ink hover:text-ink"
            >
              <RotateCcw aria-hidden="true" size={11} strokeWidth={1.5} />
              Reset filters
            </button>
          )}
        </div>
      </div>

      {error && <ErrorMessage onRetry={onRetry}>{error}</ErrorMessage>}
      {loading && <SkeletonRows />}

      {!loading && !error && entries.length === 0 && (
        <PanelMessage
          title={filters.searchThisArea ? "No records in this view" : "No matching records"}
          action={
            filters.searchThisArea ? (
              <button
                type="button"
                onClick={onClearArea}
                className="border border-ink px-3 py-1.5 text-xs hover:bg-ink hover:text-sheet"
              >
                Search the world
              </button>
            ) : undefined
          }
        >
          Try a different search, widen the year range, or turn off the map-area filter.
        </PanelMessage>
      )}

      <ul data-tour="records" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!loading &&
          entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              selected={entry.id === activeEntryId}
              visited={getCachedProgress(entry.id).visited}
              buttonRef={(el) => {
                if (el) {
                  cardRefs.current.set(entry.id, el);
                } else {
                  cardRefs.current.delete(entry.id);
                }
              }}
              onSelect={() => {
                lastScrolledId.current = entry.id;
                dispatch({ type: "selectEntry", id: entry.id, role: "origin" });
              }}
            />
          ))}
        {!loading && entries.length > 0 && hasMore && !isCapped && onLoadMore && (
          <li className="border-b border-rule px-4 py-3">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full border border-rule bg-paper px-3 py-2 text-xs text-ink hover:border-ink disabled:opacity-60"
            >
              {loadingMore ? "Loading more records…" : "Load more records"}
            </button>
          </li>
        )}
      </ul>

      {!loading && entries.length > 0 && (
        <p className="border-t border-rule px-4 py-2 text-[11px] text-muted">
          {isCapped
            ? `Display capped at ${resultCap} results. Narrow your search or map area to locate specific entries.`
            : `${filters.searchThisArea ? "Map area" : "Worldwide"} · showing ${entries.length}${
                totalMatched !== undefined ? ` of ${totalMatched}` : ""
              } matching records.`}
        </p>
      )}
    </section>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="caption-label w-10 shrink-0">{label}</span>
      <div role="group" aria-label={label} className="flex gap-3">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={`border-b-2 pb-0.5 text-xs transition-colors duration-150 hover:text-ink ${
              value === id ? "border-ochre text-ink" : "border-transparent text-muted"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  selected,
  visited,
  buttonRef,
  onSelect,
}: {
  entry: HistoricalEntry;
  selected: boolean;
  visited: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
}) {
  const Icon = entry.entryType === "artifact" ? Package : MapPin;
  const unlocated = entry.origin === null;

  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        data-entry-id={entry.id}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={`w-full border-b border-l-2 border-rule px-4 py-3 text-left transition-colors duration-150 hover:bg-paper ${
          selected ? "border-l-ochre bg-paper" : "border-l-transparent"
        }`}
      >
        <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider text-muted">
          <Icon aria-hidden="true" size={13} strokeWidth={1.5} />
          <span>
            {entry.scope} · {entry.entryType}
          </span>
          {unlocated && (
            <span className="inline-flex items-center gap-1 border border-rule px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted">
              <MapPinOff aria-hidden="true" size={10} strokeWidth={1.5} />
              No map pin
            </span>
          )}
          {visited && <span className="ml-auto text-ochre">Visited</span>}
        </span>

        <span className="block font-display text-[19px] leading-tight text-ink">{entry.title}</span>

        <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
          <span className="tabular">
            {formatYearRange(entry.startYear, entry.endYear, entry.dateIsApproximate)}
          </span>
          {entry.era && <span>· {entry.era}</span>}
        </span>

        {entry.locationName && (
          <span className="mt-1 block truncate text-xs text-muted">{entry.locationName}</span>
        )}

        <span className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          {entry.reviewed ? (
            <span className="inline-flex items-center gap-1 text-harbor">
              <CheckCircle2 aria-hidden="true" size={11} strokeWidth={1.5} />
              Reviewed
            </span>
          ) : (
            <span className="italic text-muted">Draft · unreviewed</span>
          )}
        </span>
      </button>
    </li>
  );
}
