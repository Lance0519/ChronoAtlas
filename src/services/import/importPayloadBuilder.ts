import { isSafeExternalUrl, normalizeSlug } from "../../lib/validators";
import type { Coordinates, ImportDraftPayload, ImportMediaDraft, Scope } from "../../types/atlas";
import type { WikimediaImageMetadata } from "./wikimediaService";
import type { WikipediaFetchedArticle } from "./wikipediaService";

export function isPhilippineCoordinates(coords: Coordinates | null): boolean {
  if (!coords) return false;
  return (
    coords.latitude >= 4.5 &&
    coords.latitude <= 21.5 &&
    coords.longitude >= 116 &&
    coords.longitude <= 127
  );
}

export function inferImportScope(coords: Coordinates | null): Scope {
  return isPhilippineCoordinates(coords) ? "local" : "international";
}

function buildSafeFallbackSlug(article: WikipediaFetchedArticle): string {
  const normalized = normalizeSlug(article.canonicalTitle || article.title);
  if (normalized) return normalized;
  if (article.wikidataId) {
    const wikiSlug = normalizeSlug(article.wikidataId);
    if (wikiSlug) return `import-${wikiSlug}`;
  }
  return `import-${article.lang}-record`;
}

export function buildImportDraftPayload(
  article: WikipediaFetchedArticle,
  mediaMetadata?: WikimediaImageMetadata | null,
): ImportDraftPayload {
  const coordinates = article.coordinates;
  const scope = inferImportScope(coordinates);
  const media: ImportMediaDraft[] = [];

  if (mediaMetadata && isSafeExternalUrl(mediaMetadata.imageUrl)) {
    media.push({
      imageUrl: mediaMetadata.imageUrl,
      sourceUrl: mediaMetadata.sourceUrl,
      caption: mediaMetadata.description || article.canonicalTitle,
      period: mediaMetadata.period,
      photoYear: mediaMetadata.photoYear,
      creator: mediaMetadata.creator,
      license: mediaMetadata.license,
      licenseUrl: mediaMetadata.licenseUrl,
      attributionText: mediaMetadata.attributionText,
      comparisonGroup: null,
    });
  } else if (article.thumbnailUrl && isSafeExternalUrl(article.thumbnailUrl)) {
    media.push({
      imageUrl: article.thumbnailUrl,
      sourceUrl: article.pageUrl,
      caption: article.canonicalTitle,
      period: "unknown",
      photoYear: null,
      creator: null,
      license: null,
      licenseUrl: null,
      attributionText: null,
      comparisonGroup: null,
    });
  }

  const summaryText =
    article.summary.trim() ||
    article.extract?.trim() ||
    article.description?.trim() ||
    article.canonicalTitle;

  const noteParts = [
    article.redirectedFrom ? `Redirected from "${article.redirectedFrom}".` : null,
    "Imported from Wikipedia; requires human curator review.",
  ].filter(Boolean);

  return {
    title: article.canonicalTitle,
    slug: buildSafeFallbackSlug(article),
    scope,
    entryType: "place",
    era: null,
    startYear: null,
    endYear: null,
    dateIsApproximate: false,
    locationName: null,
    summary: summaryText,
    significance: null,
    origin: coordinates,
    current: null,
    originPrecision: coordinates ? "approximate" : "unknown",
    currentPrecision: null,
    originSource: coordinates ? article.pageUrl : null,
    currentSource: null,
    reviewed: false,
    media,
    sources: [
      {
        title: `${article.canonicalTitle} (${article.lang.toUpperCase()} Wikipedia)`,
        url: article.pageUrl,
        publisher: `Wikipedia (${article.lang})`,
        sourceType: "encyclopedia",
        notes: noteParts.join(" "),
      },
    ],
  };
}
