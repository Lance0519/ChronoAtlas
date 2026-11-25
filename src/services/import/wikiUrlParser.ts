import { hasControlCharacters } from "../../lib/validators";

export interface ParsedWikipediaUrl {
  ok: true;
  lang: string;
  title: string;
  normalizedUrl: string;
}

export interface InvalidWikipediaUrl {
  ok: false;
  error: string;
}

export type WikiUrlParseResult = ParsedWikipediaUrl | InvalidWikipediaUrl;

const NON_CONTENT_SUBDOMAINS = new Set([
  "www",
  "m",
  "mobile",
  "upload",
  "commons",
  "meta",
  "donate",
  "foundation",
  "lists",
  "shop",
  "wikitech",
  "api",
  "rest",
  "incubator",
  "species",
  "login",
  "auth",
]);

const NON_ARTICLE_NAMESPACES = [
  "special:",
  "talk:",
  "user:",
  "user talk:",
  "wikipedia:",
  "wikipedia talk:",
  "project:",
  "file:",
  "file talk:",
  "mediawiki:",
  "template:",
  "help:",
  "category:",
  "portal:",
  "draft:",
  "module:",
];

const WIKIPEDIA_HOST_PATTERN = /^([a-z]{2,12}(?:-[a-z]{2,12})*)(?:\.m)?\.wikipedia\.org$/;

export function isAllowedWikipediaHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  const match = WIKIPEDIA_HOST_PATTERN.exec(lower);
  if (!match) return false;
  const lang = match[1];
  return !NON_CONTENT_SUBDOMAINS.has(lang);
}

export function parseWikipediaUrl(rawInput: string): WikiUrlParseResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a Wikipedia article URL." };
  }

  if (hasControlCharacters(trimmed)) {
    return { ok: false, error: "URL contains unsupported control characters." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "Enter a valid URL (for example, https://en.wikipedia.org/wiki/Intramuros).",
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only HTTP/HTTPS Wikipedia URLs are supported." };
  }

  if (parsed.username || parsed.password || parsed.port) {
    return {
      ok: false,
      error: "Wikipedia article URLs must not include credentials or custom ports.",
    };
  }

  const hostLower = parsed.hostname.toLowerCase();
  const hostMatch = WIKIPEDIA_HOST_PATTERN.exec(hostLower);
  if (!hostMatch || NON_CONTENT_SUBDOMAINS.has(hostMatch[1])) {
    return {
      ok: false,
      error:
        "Only language editions on *.wikipedia.org are supported (such as en.wikipedia.org or tl.wikipedia.org).",
    };
  }

  const lang = hostMatch[1];
  let rawTitle = "";

  if (parsed.pathname.startsWith("/wiki/")) {
    rawTitle = parsed.pathname.slice("/wiki/".length);
  } else if (parsed.pathname === "/w/index.php") {
    rawTitle = parsed.searchParams.get("title") ?? "";
  } else {
    return {
      ok: false,
      error:
        "URL must point to a Wikipedia article (/wiki/Article_Title or /w/index.php?title=Article_Title).",
    };
  }

  if (!rawTitle.trim()) {
    return { ok: false, error: "Wikipedia URL does not specify an article title." };
  }

  let decodedTitle: string;
  try {
    decodedTitle = decodeURIComponent(rawTitle);
  } catch {
    return { ok: false, error: "Wikipedia URL contains malformed percent-encoding." };
  }

  const title = decodedTitle.replaceAll("_", " ").replaceAll(/\s+/g, " ").trim();
  if (!title) {
    return { ok: false, error: "Wikipedia URL does not specify an article title." };
  }

  const lowerTitle = title.toLowerCase();
  if (NON_ARTICLE_NAMESPACES.some((prefix) => lowerTitle.startsWith(prefix))) {
    return {
      ok: false,
      error: "Special and administrative Wikipedia pages cannot be imported as historical records.",
    };
  }

  const encodedPath = encodeURIComponent(title.replaceAll(" ", "_"))
    .replaceAll("%2F", "/")
    .replaceAll("%3A", ":");

  return {
    ok: true,
    lang,
    title,
    normalizedUrl: `https://${lang}.wikipedia.org/wiki/${encodedPath}`,
  };
}
