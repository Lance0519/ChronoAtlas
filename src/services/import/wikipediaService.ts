import { isValidCoordinate } from "../../lib/geo";
import { isSafeExternalUrl, sanitizePlainText } from "../../lib/validators";
import type { Coordinates } from "../../types/atlas";
import {
  isAllowedWikipediaHost,
  parseWikipediaUrl,
  type ParsedWikipediaUrl,
} from "./wikiUrlParser";

export interface WikipediaFetchedArticle {
  lang: string;
  title: string;
  canonicalTitle: string;
  pageUrl: string;
  redirectedFrom: string | null;
  summary: string;
  description: string | null;
  extract: string | null;
  coordinates: Coordinates | null;
  pageImageTitle: string | null;
  thumbnailUrl: string | null;
  wikidataId: string | null;
  accessedAt: string;
}

export type WikipediaFetchErrorCode =
  | "invalid_url"
  | "not_found"
  | "disambiguation"
  | "rate_limited"
  | "network_error"
  | "timeout"
  | "api_error";

export type WikipediaFetchResult =
  | { ok: true; article: WikipediaFetchedArticle }
  | {
      ok: false;
      code: WikipediaFetchErrorCode;
      message: string;
      disambiguationUrl?: string;
      redirectedFrom?: string | null;
    };

export interface WikiRequestOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

type RestSummaryResponse = {
  type?: string;
  title?: string;
  displaytitle?: string;
  description?: string;
  extract?: string;
  wikibase_item?: string;
  coordinates?: { lat?: number; lon?: number };
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

type ActionQueryResponse = {
  query?: {
    redirects?: Array<{ from?: string; to?: string }>;
    normalized?: Array<{ from?: string; to?: string }>;
    pages?: Array<{
      missing?: boolean;
      title?: string;
      fullurl?: string;
      extract?: string;
      pageimage?: string;
      thumbnail?: { source?: string };
      coordinates?: Array<{ lat?: number; lon?: number }>;
      pageprops?: { disambiguation?: string; wikibase_item?: string };
    }>;
  };
};

export type FetchJsonOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: Exclude<WikipediaFetchErrorCode, "invalid_url" | "disambiguation">;
      status?: number;
      message: string;
    };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 350;

function isAllowedWikimediaApiUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "commons.wikimedia.org" || isAllowedWikipediaHost(host);
  } catch {
    return false;
  }
}

function waitWithSignal(ms: number, externalSignal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (externalSignal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      externalSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    externalSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseRetryAfterMs(headerValue: string | null, fallbackMs: number): number {
  if (!headerValue) return fallbackMs;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 5000);
  }
  return fallbackMs;
}

export async function fetchWikiJsonWithRetry<T>(
  url: string,
  options: WikiRequestOptions = {},
): Promise<FetchJsonOutcome<T>> {
  if (!isAllowedWikimediaApiUrl(url)) {
    return {
      ok: false,
      code: "api_error",
      message: "Blocked request to non-allowlisted Wikimedia host.",
    };
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) {
      return { ok: false, code: "network_error", message: "Request was cancelled." };
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const response = await fetchFn(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Api-User-Agent": "ChronoAtlas/2.0 (historical-atlas-importer)",
        },
        signal: controller.signal,
      });

      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);

      if (response.status === 404) {
        return {
          ok: false,
          code: "not_found",
          status: 404,
          message: "The requested Wikipedia article was not found.",
        };
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const fallbackDelay = baseDelayMs * 2 ** attempt;
          const retryMs = parseRetryAfterMs(response.headers.get("Retry-After"), fallbackDelay);
          await waitWithSignal(retryMs, options.signal);
          continue;
        }
        return {
          ok: false,
          code: response.status === 429 ? "rate_limited" : "api_error",
          status: response.status,
          message:
            response.status === 429
              ? "Wikipedia API rate limit reached. Wait a moment and try again."
              : `Wikipedia API returned HTTP ${response.status}.`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          code: "api_error",
          status: response.status,
          message: `Wikipedia API returned HTTP ${response.status}.`,
        };
      }

      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (error) {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);

      if (options.signal?.aborted) {
        return { ok: false, code: "network_error", message: "Request was cancelled." };
      }

      if (timedOut || (error instanceof DOMException && error.name === "TimeoutError")) {
        if (attempt < maxRetries) {
          await waitWithSignal(baseDelayMs * 2 ** attempt, options.signal);
          continue;
        }
        return {
          ok: false,
          code: "timeout",
          message: "Wikipedia request timed out. Check your connection and try again.",
        };
      }

      if (attempt < maxRetries) {
        try {
          await waitWithSignal(baseDelayMs * 2 ** attempt, options.signal);
          continue;
        } catch {
          return { ok: false, code: "network_error", message: "Request was cancelled." };
        }
      }

      return {
        ok: false,
        code: "network_error",
        message: "Unable to reach Wikipedia. Check your network connection and retry.",
      };
    }
  }

  return {
    ok: false,
    code: "network_error",
    message: "Unable to complete Wikipedia lookup.",
  };
}

function normalizeTitleComparison(value: string): string {
  return value.replaceAll("_", " ").replaceAll(/\s+/g, " ").trim().toLowerCase();
}

export async function fetchWikipediaArticle(
  input: string | ParsedWikipediaUrl,
  options: WikiRequestOptions = {},
): Promise<WikipediaFetchResult> {
  const parsed = typeof input === "string" ? parseWikipediaUrl(input) : input;
  if (!parsed.ok) {
    return { ok: false, code: "invalid_url", message: parsed.error };
  }

  const { lang, title, normalizedUrl } = parsed;
  const encodedTitle = encodeURIComponent(title.replaceAll(" ", "_"));
  const restUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}?redirect=true`;
  const actionParams = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    redirects: "1",
    prop: "coordinates|pageimages|info|extracts|pageprops",
    piprop: "name|thumbnail",
    pithumbsize: "960",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    titles: title,
  });
  const actionUrl = `https://${lang}.wikipedia.org/w/api.php?${actionParams.toString()}`;

  const [restOutcome, actionOutcome] = await Promise.all([
    fetchWikiJsonWithRetry<RestSummaryResponse>(restUrl, options),
    fetchWikiJsonWithRetry<ActionQueryResponse>(actionUrl, options),
  ]);

  if (!restOutcome.ok) {
    return {
      ok: false,
      code: restOutcome.code,
      message: restOutcome.message,
    };
  }

  const summaryData = restOutcome.data;
  const restTitle = sanitizePlainText(summaryData.title ?? summaryData.displaytitle ?? title);
  const restPageUrlCandidate = summaryData.content_urls?.desktop?.page ?? "";
  const restPageUrl =
    isSafeExternalUrl(restPageUrlCandidate) && parseWikipediaUrl(restPageUrlCandidate).ok
      ? restPageUrlCandidate
      : normalizedUrl;

  if (summaryData.type === "disambiguation") {
    return {
      ok: false,
      code: "disambiguation",
      message: `"${restTitle || title}" is a Wikipedia disambiguation page. Choose a specific article URL instead.`,
      disambiguationUrl: restPageUrl,
    };
  }

  const actionPage = actionOutcome.ok ? actionOutcome.data.query?.pages?.[0] : undefined;
  if (actionPage?.pageprops && actionPage.pageprops.disambiguation !== undefined) {
    return {
      ok: false,
      code: "disambiguation",
      message: `"${restTitle || title}" is a Wikipedia disambiguation page. Choose a specific article URL instead.`,
      disambiguationUrl: restPageUrl,
    };
  }

  if (actionPage?.missing) {
    return {
      ok: false,
      code: "not_found",
      message: `Wikipedia article "${title}" was not found on ${lang}.wikipedia.org.`,
    };
  }

  const actionRedirects = actionOutcome.ok ? actionOutcome.data.query?.redirects : undefined;
  let redirectedFrom: string | null = null;
  if (actionRedirects && actionRedirects.length > 0 && actionRedirects[0]?.from) {
    redirectedFrom = sanitizePlainText(actionRedirects[0].from);
  } else if (restTitle && normalizeTitleComparison(restTitle) !== normalizeTitleComparison(title)) {
    redirectedFrom = title;
  }

  const canonicalTitle = sanitizePlainText(actionPage?.title ?? (restTitle || title)) || title;

  const actionCoord = actionPage?.coordinates?.[0];
  const restCoord = summaryData.coordinates;
  let coordinates: Coordinates | null = null;
  if (
    actionCoord &&
    typeof actionCoord.lat === "number" &&
    typeof actionCoord.lon === "number" &&
    isValidCoordinate(actionCoord.lat, actionCoord.lon)
  ) {
    coordinates = { latitude: actionCoord.lat, longitude: actionCoord.lon };
  } else if (
    restCoord &&
    typeof restCoord.lat === "number" &&
    typeof restCoord.lon === "number" &&
    isValidCoordinate(restCoord.lat, restCoord.lon)
  ) {
    coordinates = { latitude: restCoord.lat, longitude: restCoord.lon };
  }

  const actionFullUrl = actionPage?.fullurl ?? "";
  const pageUrl =
    isSafeExternalUrl(actionFullUrl) && parseWikipediaUrl(actionFullUrl).ok
      ? actionFullUrl
      : restPageUrl;

  const rawThumbnail = actionPage?.thumbnail?.source ?? summaryData.thumbnail?.source ?? "";
  const thumbnailUrl = isSafeExternalUrl(rawThumbnail) ? rawThumbnail : null;

  const summary = sanitizePlainText(summaryData.extract ?? "");
  const extract = actionPage?.extract ? sanitizePlainText(actionPage.extract) : null;
  const description = summaryData.description ? sanitizePlainText(summaryData.description) : null;
  const pageImageTitle = actionPage?.pageimage ? sanitizePlainText(actionPage.pageimage) : null;
  const wikidataId = summaryData.wikibase_item ?? actionPage?.pageprops?.wikibase_item ?? null;

  return {
    ok: true,
    article: {
      lang,
      title,
      canonicalTitle,
      pageUrl,
      redirectedFrom,
      summary: summary || extract || "",
      description: description || null,
      extract: extract || null,
      coordinates,
      pageImageTitle: pageImageTitle || null,
      thumbnailUrl,
      wikidataId,
      accessedAt: new Date().toISOString().slice(0, 10),
    },
  };
}
