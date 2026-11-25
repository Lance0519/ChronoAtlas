import type { Coordinates } from "../types/atlas";
import { isValidCoordinate } from "./geo";

export const MIN_HISTORICAL_YEAR = -500000;
export const MAX_HISTORICAL_YEAR = 2100;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  copy: "©",
  reg: "®",
  deg: "°",
};

export function normalizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function isSafeExternalUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || hasControlCharacters(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isValidYear(year: number | null): boolean {
  if (year === null) return true;
  return Number.isInteger(year) && year >= MIN_HISTORICAL_YEAR && year <= MAX_HISTORICAL_YEAR;
}

export function isValidYearRange(startYear: number | null, endYear: number | null): boolean {
  if (!isValidYear(startYear) || !isValidYear(endYear)) return false;
  if (startYear !== null && endYear !== null && endYear < startYear) return false;
  return true;
}

export function isValidCoordinatePair(coords: Coordinates | null): boolean;
export function isValidCoordinatePair(latitude: number, longitude: number): boolean;
export function isValidCoordinatePair(
  coordsOrLat: Coordinates | null | number,
  longitude?: number,
): boolean {
  if (coordsOrLat === null) return false;
  if (typeof coordsOrLat === "number") {
    return typeof longitude === "number" && isValidCoordinate(coordsOrLat, longitude);
  }
  return isValidCoordinate(coordsOrLat.latitude, coordsOrLat.longitude);
}

/** Strip raw HTML markup and decode entities into safe plain text without DOM injection. */
export function sanitizePlainText(input: string): string {
  if (!input) return "";

  const withoutScripts = input
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  const withoutTags = withoutScripts
    .replaceAll(/<(?:br\s*\/?|\/(?:p|div|li|tr|h[1-6]|blockquote))\b[^>]*>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "");

  const decoded = withoutTags.replaceAll(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (match, token: string) => {
      if (token.startsWith("#x") || token.startsWith("#X")) {
        const code = Number.parseInt(token.slice(2), 16);
        return isPrintableCodePoint(code) ? String.fromCodePoint(code) : "";
      }
      if (token.startsWith("#")) {
        const code = Number.parseInt(token.slice(1), 10);
        return isPrintableCodePoint(code) ? String.fromCodePoint(code) : "";
      }
      const mapped = NAMED_HTML_ENTITIES[token.toLowerCase()];
      return mapped ?? match;
    },
  );

  return stripControlCharacters(decoded.replaceAll(/\r\n?/g, "\n"))
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/\n[ \t]+/g, "\n")
    .replaceAll(/[ \t]+\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function stripControlCharacters(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code !== 0x7f)) {
      result += value[i];
    }
  }
  return result;
}

function isPrintableCodePoint(code: number): boolean {
  if (!Number.isInteger(code)) return false;
  if (code === 0x09 || code === 0x0a) return true;
  if (code < 0x20 || code > 0x10ffff) return false;
  return code < 0xd800 || code > 0xdfff;
}
