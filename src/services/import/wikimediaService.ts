import { isSafeExternalUrl, sanitizePlainText } from "../../lib/validators";
import type { MediaPeriod } from "../../types/atlas";
import { fetchWikiJsonWithRetry, type WikiRequestOptions } from "./wikipediaService";

export interface WikimediaImageMetadata {
  filename: string;
  imageUrl: string;
  sourceUrl: string;
  creator: string | null;
  license: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  photoYear: number | null;
  period: MediaPeriod;
  description: string | null;
}

type CommonsImageInfoResponse = {
  query?: {
    pages?: Array<{
      missing?: boolean;
      title?: string;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }>;
  };
};

export function classifyMediaPeriod(photoYear: number | null): MediaPeriod {
  if (photoYear === null) return "unknown";
  if (photoYear <= 1960) return "archival";
  if (photoYear >= 1990) return "modern";
  return "unknown";
}

export function extractPhotoYear(rawDate: string | null | undefined): number | null {
  if (!rawDate) return null;
  const cleaned = sanitizePlainText(rawDate);
  if (!cleaned) return null;

  const match = /\b(1\d{3}|20\d{2}|2100)\b/.exec(cleaned);
  if (!match) return null;

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 2100) {
    return null;
  }
  return parsed;
}

function normalizeCommonsFileTitle(rawFilename: string): string {
  return rawFilename
    .trim()
    .replace(/^(?:File|Image):/i, "")
    .replaceAll(" ", "_");
}

function buildCommonsFileUrl(normalizedFilename: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(normalizedFilename)}`;
}

async function queryHostImageInfo(
  apiBase: string,
  normalizedFilename: string,
  options: WikiRequestOptions,
): Promise<WikimediaImageMetadata | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    titles: `File:${normalizedFilename}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "960",
  });

  const outcome = await fetchWikiJsonWithRetry<CommonsImageInfoResponse>(
    `${apiBase}?${params.toString()}`,
    options,
  );
  if (!outcome.ok) return null;

  const page = outcome.data.query?.pages?.[0];
  if (!page || page.missing) return null;

  const info = page.imageinfo?.[0];
  if (!info) return null;

  const candidateImageUrl = info.thumburl ?? info.url ?? "";
  if (!isSafeExternalUrl(candidateImageUrl)) return null;

  const candidateSourceUrl = info.descriptionurl ?? buildCommonsFileUrl(normalizedFilename);
  const sourceUrl = isSafeExternalUrl(candidateSourceUrl)
    ? candidateSourceUrl
    : buildCommonsFileUrl(normalizedFilename);

  const meta = info.extmetadata ?? {};
  const creator = sanitizePlainText(meta.Artist?.value ?? "") || null;
  const license = sanitizePlainText(meta.LicenseShortName?.value ?? "") || null;
  const rawLicenseUrl = sanitizePlainText(meta.LicenseUrl?.value ?? "");
  const licenseUrl = rawLicenseUrl && isSafeExternalUrl(rawLicenseUrl) ? rawLicenseUrl : null;
  const rawAttribution = sanitizePlainText(meta.Attribution?.value ?? meta.Credit?.value ?? "");
  const attributionText = rawAttribution || [creator, license].filter(Boolean).join(" · ") || null;
  const description = sanitizePlainText(meta.ImageDescription?.value ?? "") || null;
  const photoYear = extractPhotoYear(meta.DateTimeOriginal?.value);

  return {
    filename: normalizedFilename,
    imageUrl: candidateImageUrl,
    sourceUrl,
    creator,
    license,
    licenseUrl,
    attributionText,
    photoYear,
    period: classifyMediaPeriod(photoYear),
    description,
  };
}

export async function fetchWikimediaImageMetadata(
  filename: string | null | undefined,
  options: WikiRequestOptions & { fallbackLang?: string } = {},
): Promise<WikimediaImageMetadata | null> {
  if (!filename || !filename.trim()) return null;
  const normalizedFilename = normalizeCommonsFileTitle(filename);
  if (!normalizedFilename) return null;

  const commonsResult = await queryHostImageInfo(
    "https://commons.wikimedia.org/w/api.php",
    normalizedFilename,
    options,
  );
  if (commonsResult) return commonsResult;

  if (options.fallbackLang && /^[a-z]{2,12}(?:-[a-z]{2,12})*$/.test(options.fallbackLang)) {
    return queryHostImageInfo(
      `https://${options.fallbackLang}.wikipedia.org/w/api.php`,
      normalizedFilename,
      options,
    );
  }

  return null;
}
