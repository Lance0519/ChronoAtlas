import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { formatYearRange } from "../../lib/format";
import { isSafeExternalUrl, normalizeSlug } from "../../lib/validators";
import {
  ensureExtendedCorpusLoaded,
  getAllKnownEntries,
  getAllKnownSources,
  isExtendedCorpusLoaded,
} from "../../services/entriesService";
import { findDuplicateCandidates } from "../../services/import/duplicateDetection";
import { hasValidationErrors, validateImportPayload } from "../../services/import/wikiValidator";
import type {
  CoordinatePrecision,
  Coordinates,
  DuplicateReason,
  EntryType,
  ImportDraftPayload,
  MediaPeriod,
  Scope,
} from "../../types/atlas";

interface ImportReviewFormProps {
  initialDraft: ImportDraftPayload;
  redirectedFrom: string | null;
  wikidataId: string | null;
  hasCoordinates: boolean;
  hasMediaMetadata: boolean;
  onBack: () => void;
  onCancel: () => void;
  onSave: (payload: ImportDraftPayload) => Promise<void>;
  saving: boolean;
  saveError: string | null;
}

const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  exact_slug: "Exact slug match",
  normalized_title: "Matching title",
  source_url: "Matching Wikipedia / source URL",
  location_similarity: "Nearby coordinates with similar title",
};

function parseNullableInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : NaN;
}

function parseCoordinateInputs(latRaw: string, lonRaw: string): Coordinates | null {
  const latTrim = latRaw.trim();
  const lonTrim = lonRaw.trim();
  if (!latTrim && !lonTrim) return null;
  if (!latTrim || !lonTrim) return { latitude: NaN, longitude: NaN };
  const latitude = Number(latTrim);
  const longitude = Number(lonTrim);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude: NaN, longitude: NaN };
  }
  return { latitude, longitude };
}

export function ImportReviewForm({
  initialDraft,
  redirectedFrom,
  wikidataId,
  hasCoordinates,
  hasMediaMetadata,
  onBack,
  onCancel,
  onSave,
  saving,
  saveError,
}: ImportReviewFormProps) {
  const [draft, setDraft] = useState<ImportDraftPayload>(initialDraft);
  const [originLat, setOriginLat] = useState(
    initialDraft.origin ? String(initialDraft.origin.latitude) : "",
  );
  const [originLon, setOriginLon] = useState(
    initialDraft.origin ? String(initialDraft.origin.longitude) : "",
  );
  const [currentLat, setCurrentLat] = useState(
    initialDraft.current ? String(initialDraft.current.latitude) : "",
  );
  const [currentLon, setCurrentLon] = useState(
    initialDraft.current ? String(initialDraft.current.longitude) : "",
  );
  const [startYearInput, setStartYearInput] = useState(
    initialDraft.startYear !== null ? String(initialDraft.startYear) : "",
  );
  const [endYearInput, setEndYearInput] = useState(
    initialDraft.endYear !== null ? String(initialDraft.endYear) : "",
  );
  const [photoYearInput, setPhotoYearInput] = useState(
    initialDraft.media[0]?.photoYear !== null && initialDraft.media[0]?.photoYear !== undefined
      ? String(initialDraft.media[0].photoYear)
      : "",
  );
  const [submitted, setSubmitted] = useState(false);
  const [mediaBroken, setMediaBroken] = useState(false);
  const [existingCatalog, setExistingCatalog] = useState(() => ({
    entries: getAllKnownEntries(),
    sources: getAllKnownSources(),
  }));
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState(false);

  useEffect(() => {
    if (!isExtendedCorpusLoaded()) {
      void ensureExtendedCorpusLoaded()
        .then(() => {
          setExistingCatalog({
            entries: getAllKnownEntries(),
            sources: getAllKnownSources(),
          });
        })
        .catch(() => {
          // Non-fatal: seed + overlay entries are still checked.
        });
    }
  }, []);

  const errors = useMemo(() => validateImportPayload(draft), [draft]);
  const hasErrors = hasValidationErrors(errors);

  const duplicates = useMemo(
    () => findDuplicateCandidates(draft, existingCatalog.entries, existingCatalog.sources),
    [draft, existingCatalog],
  );

  const hasExactSlugCollision = duplicates.some((item) => item.reasons.includes("exact_slug"));
  const requiresDuplicateAck =
    duplicates.length > 0 && !hasExactSlugCollision && !acknowledgeDuplicate;

  const updateOriginCoords = (nextLat: string, nextLon: string) => {
    setOriginLat(nextLat);
    setOriginLon(nextLon);
    const parsed = parseCoordinateInputs(nextLat, nextLon);
    setDraft((prev) => ({
      ...prev,
      origin: parsed,
      originPrecision: parsed === null ? "unknown" : prev.originPrecision,
    }));
  };

  const updateCurrentCoords = (nextLat: string, nextLon: string) => {
    setCurrentLat(nextLat);
    setCurrentLon(nextLon);
    const parsed = parseCoordinateInputs(nextLat, nextLon);
    setDraft((prev) => ({
      ...prev,
      current: parsed,
      currentPrecision: parsed === null ? null : (prev.currentPrecision ?? "approximate"),
    }));
  };

  const handleEntryTypeChange = (nextType: EntryType) => {
    setDraft((prev) => {
      if (nextType === "place") {
        setCurrentLat("");
        setCurrentLon("");
        return {
          ...prev,
          entryType: nextType,
          current: null,
          currentPrecision: null,
          currentSource: null,
        };
      }
      return { ...prev, entryType: nextType };
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors || hasExactSlugCollision || requiresDuplicateAck || saving) return;
    void onSave(draft);
  };

  const primaryMedia = draft.media[0];
  const primarySource = draft.sources[0];

  const fieldError = (key: string) =>
    submitted || key === "slug" || key === "title" ? errors[key] : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.5} />
            Fetch a different URL
          </button>
          {wikidataId && <span className="caption-label tabular">Wikidata {wikidataId}</span>}
        </div>

        {redirectedFrom && (
          <div role="status" className="border border-rule bg-paper px-3 py-2 text-xs text-ink">
            Redirected from <strong>{redirectedFrom}</strong> to <strong>{draft.title}</strong>.
          </div>
        )}

        {!hasCoordinates && (
          <div role="status" className="border border-rule bg-paper px-3 py-2 text-xs text-muted">
            No coordinates were found in the Wikipedia metadata. You can enter coordinates manually
            below or save as an unlocated record.
          </div>
        )}

        {!hasMediaMetadata && primaryMedia && (
          <div role="status" className="border border-rule bg-paper px-3 py-2 text-xs text-muted">
            Full Wikimedia Commons license/creator metadata was unavailable; inspect the image
            source before verifying attribution.
          </div>
        )}

        {duplicates.length > 0 && (
          <div
            role="alert"
            className="border border-[#9a5b24] bg-[#f8efe3] px-3 py-3 text-xs text-ink"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                aria-hidden="true"
                size={16}
                strokeWidth={1.5}
                className="mt-0.5 shrink-0 text-ochre"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  Possible duplicate{duplicates.length > 1 ? "s" : ""} found ({duplicates.length})
                </p>
                <p className="mt-0.5 text-muted">
                  ChronoAtlas will not silently overwrite existing records. Review the match
                  {duplicates.length > 1 ? "es" : ""} below:
                </p>
                <ul className="mt-2 space-y-1.5">
                  {duplicates.slice(0, 5).map(({ entry, reasons }) => (
                    <li key={entry.id} className="border border-rule bg-sheet px-2 py-1.5">
                      <span className="font-medium text-ink">{entry.title}</span>{" "}
                      <span className="tabular text-muted">({entry.slug})</span>
                      <span className="mt-0.5 block text-[11px] text-ochre">
                        {reasons.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {hasExactSlugCollision ? (
                  <p className="mt-2 font-medium text-[#7a3720]">
                    Slug &ldquo;{draft.slug}&rdquo; already exists. Change the slug below before
                    saving.
                  </p>
                ) : (
                  <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={acknowledgeDuplicate}
                      onChange={(event) => setAcknowledgeDuplicate(event.target.checked)}
                      className="size-4 accent-[#9a5b24]"
                    />
                    I reviewed the matches above and confirm this is a distinct record.
                  </label>
                )}
              </div>
            </div>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="border border-[#b8835c] bg-[#f7e9e2] px-3 py-2 text-xs text-[#7a3720]"
          >
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="import-title" className="caption-label block">
              Title *
            </label>
            <input
              id="import-title"
              type="text"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
            />
            {fieldError("title") && (
              <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("title")}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="import-slug" className="caption-label block">
                Slug *
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    slug: normalizeSlug(prev.title) || prev.slug,
                  }))
                }
                className="text-[11px] text-ochre underline underline-offset-2 hover:text-ink"
              >
                Normalize from title
              </button>
            </div>
            <input
              id="import-slug"
              type="text"
              value={draft.slug}
              onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
            />
            {fieldError("slug") && (
              <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("slug")}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="import-scope" className="caption-label block">
              Scope *
            </label>
            <select
              id="import-scope"
              value={draft.scope}
              onChange={(event) => setDraft({ ...draft, scope: event.target.value as Scope })}
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
            >
              <option value="local">Local (Philippines)</option>
              <option value="international">International</option>
            </select>
          </div>

          <div>
            <label htmlFor="import-type" className="caption-label block">
              Entry type *
            </label>
            <select
              id="import-type"
              value={draft.entryType}
              onChange={(event) => handleEntryTypeChange(event.target.value as EntryType)}
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
            >
              <option value="place">Place</option>
              <option value="artifact">Artifact</option>
            </select>
          </div>

          <div>
            <label htmlFor="import-era" className="caption-label block">
              Era
            </label>
            <input
              id="import-era"
              type="text"
              value={draft.era ?? ""}
              onChange={(event) => setDraft({ ...draft, era: event.target.value || null })}
              placeholder="e.g. Spanish colonial"
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="import-start-year" className="caption-label block">
              Start year (astronomical)
            </label>
            <input
              id="import-start-year"
              type="number"
              inputMode="numeric"
              value={startYearInput}
              onChange={(event) => {
                setStartYearInput(event.target.value);
                setDraft((prev) => ({ ...prev, startYear: parseNullableInt(event.target.value) }));
              }}
              placeholder="e.g. -499 = 500 BCE"
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
            />
            {fieldError("startYear") && (
              <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("startYear")}</p>
            )}
          </div>

          <div>
            <label htmlFor="import-end-year" className="caption-label block">
              End year (optional)
            </label>
            <input
              id="import-end-year"
              type="number"
              inputMode="numeric"
              value={endYearInput}
              onChange={(event) => {
                setEndYearInput(event.target.value);
                setDraft((prev) => ({ ...prev, endYear: parseNullableInt(event.target.value) }));
              }}
              placeholder="Optional"
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
            />
            {fieldError("endYear") && (
              <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("endYear")}</p>
            )}
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={draft.dateIsApproximate}
                onChange={(event) =>
                  setDraft({ ...draft, dateIsApproximate: event.target.checked })
                }
                className="size-4 accent-[#9a5b24]"
              />
              Approximate date
            </label>
            <p className="mt-1 text-[11px] tabular text-muted">
              Display:{" "}
              {!errors.startYear && !errors.endYear
                ? formatYearRange(draft.startYear, draft.endYear, draft.dateIsApproximate)
                : "Invalid year"}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="import-location-name" className="caption-label block">
            Place / Location name
          </label>
          <input
            id="import-location-name"
            type="text"
            value={draft.locationName ?? ""}
            onChange={(event) => setDraft({ ...draft, locationName: event.target.value || null })}
            placeholder="e.g. Manila, Metro Manila"
            className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
          />
        </div>

        <fieldset className="border border-rule p-3">
          <legend className="caption-label px-1">Origin Coordinates & Provenance</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="import-origin-lat" className="caption-label block">
                Latitude (-90..90)
              </label>
              <input
                id="import-origin-lat"
                type="text"
                inputMode="decimal"
                value={originLat}
                onChange={(event) => updateOriginCoords(event.target.value, originLon)}
                placeholder="Unknown"
                className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
              />
            </div>
            <div>
              <label htmlFor="import-origin-lon" className="caption-label block">
                Longitude (-180..180)
              </label>
              <input
                id="import-origin-lon"
                type="text"
                inputMode="decimal"
                value={originLon}
                onChange={(event) => updateOriginCoords(originLat, event.target.value)}
                placeholder="Unknown"
                className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
              />
            </div>
            <div>
              <label htmlFor="import-origin-precision" className="caption-label block">
                Precision
              </label>
              <select
                id="import-origin-precision"
                value={draft.originPrecision}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    originPrecision: event.target.value as CoordinatePrecision,
                  })
                }
                className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
              >
                <option value="exact">Exact</option>
                <option value="approximate">Approximate</option>
                <option value="area_centroid">Area centroid</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
          {fieldError("origin") && (
            <p className="mt-1.5 text-[11px] text-[#7a3720]">{fieldError("origin")}</p>
          )}
          <div className="mt-3">
            <label htmlFor="import-origin-source" className="caption-label block">
              Origin coordinate source URL
            </label>
            <input
              id="import-origin-source"
              type="url"
              value={draft.originSource ?? ""}
              onChange={(event) => setDraft({ ...draft, originSource: event.target.value || null })}
              placeholder="https://..."
              className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
            />
            {fieldError("originSource") && (
              <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("originSource")}</p>
            )}
          </div>
        </fieldset>

        {draft.entryType === "artifact" && (
          <fieldset className="border border-harbor/60 p-3">
            <legend className="caption-label px-1 text-harbor">
              Current Holding Location (Optional for Relocated Artifacts)
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="import-current-lat" className="caption-label block">
                  Current latitude
                </label>
                <input
                  id="import-current-lat"
                  type="text"
                  inputMode="decimal"
                  value={currentLat}
                  onChange={(event) => updateCurrentCoords(event.target.value, currentLon)}
                  placeholder="Unknown"
                  className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
                />
              </div>
              <div>
                <label htmlFor="import-current-lon" className="caption-label block">
                  Current longitude
                </label>
                <input
                  id="import-current-lon"
                  type="text"
                  inputMode="decimal"
                  value={currentLon}
                  onChange={(event) => updateCurrentCoords(currentLat, event.target.value)}
                  placeholder="Unknown"
                  className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm tabular focus:border-ochre"
                />
              </div>
              <div>
                <label htmlFor="import-current-precision" className="caption-label block">
                  Current precision
                </label>
                <select
                  id="import-current-precision"
                  disabled={draft.current === null}
                  value={draft.currentPrecision ?? "unknown"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      currentPrecision: event.target.value as CoordinatePrecision,
                    })
                  }
                  className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre disabled:opacity-50"
                >
                  <option value="exact">Exact</option>
                  <option value="approximate">Approximate</option>
                  <option value="area_centroid">Area centroid</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
            {fieldError("current") && (
              <p className="mt-1.5 text-[11px] text-[#7a3720]">{fieldError("current")}</p>
            )}
            <div className="mt-3">
              <label htmlFor="import-current-source" className="caption-label block">
                Holding coordinate source URL
              </label>
              <input
                id="import-current-source"
                type="url"
                value={draft.currentSource ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, currentSource: event.target.value || null })
                }
                placeholder="https://..."
                className="mt-1 w-full border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
              />
              {fieldError("currentSource") && (
                <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("currentSource")}</p>
              )}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="import-summary" className="caption-label block">
            Summary *
          </label>
          <textarea
            id="import-summary"
            rows={4}
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            className="mt-1 w-full resize-y border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
          />
          {fieldError("summary") && (
            <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("summary")}</p>
          )}
        </div>

        <div>
          <label htmlFor="import-significance" className="caption-label block">
            Historical significance (optional)
          </label>
          <textarea
            id="import-significance"
            rows={2}
            value={draft.significance ?? ""}
            onChange={(event) => setDraft({ ...draft, significance: event.target.value || null })}
            placeholder="Why this place or artifact matters in historical context"
            className="mt-1 w-full resize-y border border-rule bg-paper px-2.5 py-1.5 text-sm focus:border-ochre"
          />
        </div>

        {primaryMedia && (
          <fieldset className="border border-rule p-3">
            <legend className="caption-label px-1">Media Preview & Attribution</legend>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="w-full shrink-0 border border-rule bg-paper sm:w-44">
                {mediaBroken ? (
                  <p className="grid aspect-[4/3] place-items-center px-3 text-center text-xs text-muted">
                    Preview unavailable
                  </p>
                ) : (
                  <img
                    src={primaryMedia.imageUrl}
                    alt={primaryMedia.caption}
                    onError={() => setMediaBroken(true)}
                    className="aspect-[4/3] w-full object-cover"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div>
                  <label htmlFor="import-media-caption" className="caption-label block">
                    Caption
                  </label>
                  <input
                    id="import-media-caption"
                    type="text"
                    value={primaryMedia.caption}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        media: [{ ...primaryMedia, caption: event.target.value }],
                      })
                    }
                    className="mt-1 w-full border border-rule bg-paper px-2 py-1 text-xs focus:border-ochre"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="import-media-period" className="caption-label block">
                      Period
                    </label>
                    <select
                      id="import-media-period"
                      value={primaryMedia.period}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          media: [{ ...primaryMedia, period: event.target.value as MediaPeriod }],
                        })
                      }
                      className="mt-1 w-full border border-rule bg-paper px-2 py-1 text-xs focus:border-ochre"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="archival">Archival</option>
                      <option value="modern">Modern</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="import-media-year" className="caption-label block">
                      Photo year
                    </label>
                    <input
                      id="import-media-year"
                      type="number"
                      inputMode="numeric"
                      value={photoYearInput}
                      onChange={(event) => {
                        setPhotoYearInput(event.target.value);
                        setDraft((prev) => ({
                          ...prev,
                          media: prev.media[0]
                            ? [
                                {
                                  ...prev.media[0],
                                  photoYear: parseNullableInt(event.target.value),
                                },
                              ]
                            : [],
                        }));
                      }}
                      placeholder="Unknown"
                      className="mt-1 w-full border border-rule bg-paper px-2 py-1 text-xs tabular focus:border-ochre"
                    />
                    {fieldError("media.0.photoYear") && (
                      <p className="mt-1 text-[11px] text-[#7a3720]">
                        {fieldError("media.0.photoYear")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="import-media-creator" className="caption-label block">
                      Creator
                    </label>
                    <input
                      id="import-media-creator"
                      type="text"
                      value={primaryMedia.creator ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          media: [{ ...primaryMedia, creator: event.target.value || null }],
                        })
                      }
                      placeholder="Not recorded"
                      className="mt-1 w-full border border-rule bg-paper px-2 py-1 text-xs focus:border-ochre"
                    />
                  </div>
                  <div>
                    <label htmlFor="import-media-license" className="caption-label block">
                      License
                    </label>
                    <input
                      id="import-media-license"
                      type="text"
                      value={primaryMedia.license ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          media: [{ ...primaryMedia, license: event.target.value || null }],
                        })
                      }
                      placeholder="Not recorded"
                      className="mt-1 w-full border border-rule bg-paper px-2 py-1 text-xs focus:border-ochre"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {isSafeExternalUrl(primaryMedia.sourceUrl) && (
                    <a
                      href={primaryMedia.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-ochre underline underline-offset-2 hover:text-ink"
                    >
                      Commons / media page <ExternalLink aria-hidden="true" size={11} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, media: [] })}
                    className="inline-flex items-center gap-1 border border-rule px-2 py-1 text-[11px] text-muted hover:border-[#7a3720] hover:text-[#7a3720]"
                  >
                    <Trash2 aria-hidden="true" size={11} strokeWidth={1.5} />
                    Remove media
                  </button>
                </div>
              </div>
            </div>
          </fieldset>
        )}

        {primarySource && (
          <fieldset className="border border-rule p-3">
            <legend className="caption-label px-1">Source Provenance</legend>
            <div className="space-y-2 text-xs">
              <div>
                <label htmlFor="import-source-title" className="caption-label block">
                  Source title *
                </label>
                <input
                  id="import-source-title"
                  type="text"
                  value={primarySource.title}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      sources: [{ ...primarySource, title: event.target.value }],
                    })
                  }
                  className="mt-1 w-full border border-rule bg-paper px-2 py-1 text-xs focus:border-ochre"
                />
                {fieldError("sources.0.title") && (
                  <p className="mt-1 text-[11px] text-[#7a3720]">{fieldError("sources.0.title")}</p>
                )}
              </div>
              <p className="text-[11px] text-muted">
                {primarySource.publisher} ·{" "}
                {isSafeExternalUrl(primarySource.url) ? (
                  <a
                    href={primarySource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ochre underline underline-offset-2 hover:text-ink"
                  >
                    {primarySource.url}
                  </a>
                ) : (
                  primarySource.url
                )}
              </p>
            </div>
          </fieldset>
        )}

        <div className="border border-rule bg-paper px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={draft.reviewed}
              onChange={(event) => setDraft({ ...draft, reviewed: event.target.checked })}
              className="size-4 accent-[#9a5b24]"
            />
            Mark as reviewed
          </label>
          <p className="mt-1 text-[11px] text-muted">
            {draft.reviewed
              ? "Only mark as reviewed after verifying historical claims, dates, coordinates, and media licenses against primary sources."
              : "Unchecked by default: imported Wikipedia content is saved as an unreviewed draft until checked by a curator."}
          </p>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-sheet px-5 py-3">
        <p className="text-[11px] text-muted">
          {hasErrors ? "Fix highlighted validation fields before saving." : "Ready to save record."}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="border border-rule bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              saving || hasExactSlugCollision || requiresDuplicateAck || (submitted && hasErrors)
            }
            className="border border-ink bg-ink px-4 py-1.5 text-xs text-sheet hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving Record…" : "Save Record"}
          </button>
        </div>
      </footer>
    </form>
  );
}
