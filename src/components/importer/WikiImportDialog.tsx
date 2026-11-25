import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import { useAuthSession } from "../../hooks/useAuthSession";
import { isSafeExternalUrl } from "../../lib/validators";
import { saveImportedEntry } from "../../services/entriesService";
import { buildImportDraftPayload } from "../../services/import/importPayloadBuilder";
import {
  fetchWikimediaImageMetadata,
  type WikimediaImageMetadata,
} from "../../services/import/wikimediaService";
import {
  fetchWikipediaArticle,
  type WikipediaFetchErrorCode,
  type WikipediaFetchedArticle,
} from "../../services/import/wikipediaService";
import { parseWikipediaUrl } from "../../services/import/wikiUrlParser";
import type { HistoricalEntry, ImportDraftPayload } from "../../types/atlas";
import { ImportReviewForm } from "./ImportReviewForm";

interface WikiImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (entry: HistoricalEntry) => void;
  onOpenAuth?: () => void;
}

const EXAMPLE_URLS = [
  { label: "Rizal Park (en)", url: "https://en.wikipedia.org/wiki/Rizal_Park" },
  { label: "Rosetta Stone (en)", url: "https://en.wikipedia.org/wiki/Rosetta_Stone" },
  { label: "Maynila (tl)", url: "https://tl.wikipedia.org/wiki/Maynila" },
];

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "error";
      code: WikipediaFetchErrorCode;
      message: string;
      disambiguationUrl?: string;
    }
  | {
      status: "ready";
      article: WikipediaFetchedArticle;
      mediaMetadata: WikimediaImageMetadata | null;
      initialDraft: ImportDraftPayload;
    };

export function WikiImportDialog({ open, onClose, onImported, onOpenAuth }: WikiImportDialogProps) {
  const { session, canCurate } = useAuthSession();
  const [urlInput, setUrlInput] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const runFetch = async (rawUrl: string) => {
    const parsed = parseWikipediaUrl(rawUrl);
    if (!parsed.ok) {
      setLookup({ status: "error", code: "invalid_url", message: parsed.error });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLookup({ status: "loading" });
    setSaveError(null);

    const articleResult = await fetchWikipediaArticle(parsed, { signal: controller.signal });
    if (controller.signal.aborted) return;

    if (!articleResult.ok) {
      setLookup({
        status: "error",
        code: articleResult.code,
        message: articleResult.message,
        disambiguationUrl: articleResult.disambiguationUrl,
      });
      return;
    }

    const { article } = articleResult;
    const mediaMetadata = article.pageImageTitle
      ? await fetchWikimediaImageMetadata(article.pageImageTitle, {
          signal: controller.signal,
          fallbackLang: article.lang,
        })
      : null;

    if (controller.signal.aborted) return;

    const initialDraft = buildImportDraftPayload(article, mediaMetadata);
    setLookup({
      status: "ready",
      article,
      mediaMetadata,
      initialDraft,
    });
  };

  const handleFetchSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runFetch(urlInput);
  };

  const handleSave = async (payload: ImportDraftPayload) => {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await saveImportedEntry(payload);
      setSaving(false);
      setUrlInput("");
      setLookup({ status: "idle" });
      onImported(created);
    } catch (err: unknown) {
      setSaving(false);
      setSaveError(
        err instanceof Error && err.message
          ? err.message
          : "Could not save imported record. Review fields and retry.",
      );
    }
  };

  const handleClose = () => {
    if (saving) return;
    abortRef.current?.abort();
    onClose();
  };

  const retryable =
    lookup.status === "error" &&
    (lookup.code === "rate_limited" ||
      lookup.code === "timeout" ||
      lookup.code === "network_error" ||
      lookup.code === "api_error");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-import-title"
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col border border-ink bg-sheet"
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3">
          <div>
            <p className="caption-label">Curator tool</p>
            <h2 id="wiki-import-title" className="mt-0.5 font-display text-[24px] leading-tight">
              Import from Wikipedia
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close importer"
            onClick={handleClose}
            disabled={saving}
            className="mt-1 border border-rule p-1.5 text-muted hover:border-ink hover:text-ink disabled:opacity-50"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </header>

        {!canCurate ? (
          <div className="space-y-3 px-5 py-6 text-sm">
            <p className="text-ink">
              {!session.authenticated
                ? "Curator sign-in is required to import Wikipedia articles into the database archive."
                : `Your signed-in account (${session.email ?? "viewer"}) currently has the "${session.role}" role. Only curator or owner accounts can import historical records.`}
            </p>
            <p className="text-xs text-muted">
              Role permissions are enforced by PostgreSQL row-level security and database functions.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {!session.authenticated && onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onOpenAuth();
                  }}
                  className="border border-ink bg-ink px-3 py-1.5 text-xs text-sheet hover:bg-ink/90"
                >
                  Sign in as curator
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="border border-rule bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink"
              >
                Close
              </button>
            </div>
          </div>
        ) : lookup.status === "ready" ? (
          <ImportReviewForm
            initialDraft={lookup.initialDraft}
            redirectedFrom={lookup.article.redirectedFrom}
            wikidataId={lookup.article.wikidataId}
            hasCoordinates={lookup.article.coordinates !== null}
            hasMediaMetadata={lookup.mediaMetadata !== null}
            onBack={() => {
              setSaveError(null);
              setLookup({ status: "idle" });
            }}
            onCancel={handleClose}
            onSave={handleSave}
            saving={saving}
            saveError={saveError}
          />
        ) : (
          <div className="space-y-4 overflow-y-auto px-5 py-5">
            <p className="text-sm text-muted">
              Paste a Wikipedia article URL from a supported language edition (such as{" "}
              <code className="bg-paper px-1 text-xs text-ink">en.wikipedia.org</code> or{" "}
              <code className="bg-paper px-1 text-xs text-ink">tl.wikipedia.org</code>). Imported
              fields are saved as unreviewed drafts until verified.
            </p>

            <form onSubmit={handleFetchSubmit} className="space-y-3">
              <div>
                <label htmlFor="wiki-url-input" className="caption-label block">
                  Wikipedia article URL
                </label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    ref={inputRef}
                    id="wiki-url-input"
                    type="url"
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    placeholder="https://en.wikipedia.org/wiki/Intramuros"
                    disabled={lookup.status === "loading"}
                    className="min-w-0 flex-1 border border-rule bg-paper px-3 py-2 text-sm placeholder:text-muted/70 focus:border-ochre"
                  />
                  <button
                    type="submit"
                    disabled={lookup.status === "loading"}
                    className="border border-ink bg-ink px-4 py-2 text-xs text-sheet hover:bg-ink/90 disabled:opacity-50"
                  >
                    {lookup.status === "loading" ? "Fetching…" : "Fetch article"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="caption-label">Examples:</span>
                {EXAMPLE_URLS.map((example) => (
                  <button
                    key={example.url}
                    type="button"
                    disabled={lookup.status === "loading"}
                    onClick={() => {
                      setUrlInput(example.url);
                      void runFetch(example.url);
                    }}
                    className="border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:border-ink disabled:opacity-50"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </form>

            {lookup.status === "loading" && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 border border-rule bg-paper px-3 py-2.5 text-xs text-muted"
              >
                <span>Fetching Wikipedia summary and Wikimedia Commons metadata…</span>
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    setLookup({ status: "idle" });
                  }}
                  className="border border-rule px-2 py-1 text-[11px] text-ink hover:border-ink"
                >
                  Cancel
                </button>
              </div>
            )}

            {lookup.status === "error" && (
              <div
                role="alert"
                className="border border-[#b8835c] bg-[#f7e9e2] px-3 py-3 text-xs text-[#7a3720]"
              >
                <p>{lookup.message}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {lookup.disambiguationUrl && isSafeExternalUrl(lookup.disambiguationUrl) && (
                    <a
                      href={lookup.disambiguationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 border border-current px-2 py-1 text-[11px] hover:bg-[#efd8cc]"
                    >
                      Open disambiguation page <ExternalLink aria-hidden="true" size={11} />
                    </a>
                  )}
                  {retryable && (
                    <button
                      type="button"
                      onClick={() => void runFetch(urlInput)}
                      className="inline-flex items-center gap-1 border border-current px-2 py-1 text-[11px] hover:bg-[#efd8cc]"
                    >
                      <RefreshCw aria-hidden="true" size={11} strokeWidth={1.5} />
                      Retry fetch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
