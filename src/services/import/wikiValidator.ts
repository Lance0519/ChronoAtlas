import {
  isSafeExternalUrl,
  isValidCoordinatePair,
  isValidSlug,
  isValidYear,
  MAX_HISTORICAL_YEAR,
  MIN_HISTORICAL_YEAR,
} from "../../lib/validators";
import type { CoordinatePrecision, ImportDraftPayload, MediaPeriod } from "../../types/atlas";

export type ImportValidationErrors = Record<string, string>;

const VALID_SCOPES = new Set(["local", "international"]);
const VALID_TYPES = new Set(["place", "artifact"]);
const VALID_PRECISIONS = new Set<CoordinatePrecision>([
  "exact",
  "approximate",
  "area_centroid",
  "unknown",
]);
const VALID_PERIODS = new Set<MediaPeriod>(["archival", "modern", "unknown"]);

export function validateImportPayload(payload: ImportDraftPayload): ImportValidationErrors {
  const errors: ImportValidationErrors = {};

  const title = payload.title.trim();
  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > 300) {
    errors.title = "Title must be 300 characters or fewer.";
  }

  const slug = payload.slug.trim();
  if (!slug) {
    errors.slug = "Slug is required.";
  } else if (!isValidSlug(slug)) {
    errors.slug = "Slug must use lowercase letters, numbers, and single hyphens only.";
  }

  if (!VALID_SCOPES.has(payload.scope)) {
    errors.scope = "Scope must be either local or international.";
  }

  if (!VALID_TYPES.has(payload.entryType)) {
    errors.entryType = "Entry type must be either place or artifact.";
  }

  if (!payload.summary.trim()) {
    errors.summary = "Summary is required.";
  }

  if (!isValidYear(payload.startYear)) {
    errors.startYear = `Start year must be an integer between ${MIN_HISTORICAL_YEAR} and ${MAX_HISTORICAL_YEAR}.`;
  }

  if (!isValidYear(payload.endYear)) {
    errors.endYear = `End year must be an integer between ${MIN_HISTORICAL_YEAR} and ${MAX_HISTORICAL_YEAR}.`;
  } else if (
    payload.startYear !== null &&
    payload.endYear !== null &&
    isValidYear(payload.startYear) &&
    payload.endYear < payload.startYear
  ) {
    errors.endYear = "End year must be greater than or equal to start year.";
  }

  if (payload.origin !== null && !isValidCoordinatePair(payload.origin)) {
    errors.origin = "Origin coordinates must have latitude (-90..90) and longitude (-180..180).";
  }

  if (!VALID_PRECISIONS.has(payload.originPrecision)) {
    errors.originPrecision = "Invalid origin coordinate precision.";
  }

  if (payload.current !== null) {
    if (payload.entryType !== "artifact") {
      errors.current = "Current holding location can only be set on artifacts.";
    } else if (!isValidCoordinatePair(payload.current)) {
      errors.current =
        "Current coordinates must have latitude (-90..90) and longitude (-180..180).";
    }

    if (payload.currentPrecision !== null && !VALID_PRECISIONS.has(payload.currentPrecision)) {
      errors.currentPrecision = "Invalid current coordinate precision.";
    }
  } else if (payload.currentPrecision !== null) {
    errors.currentPrecision = "Current coordinate precision requires current coordinates.";
  }

  if (
    payload.originSource &&
    payload.originSource.trim() &&
    !isSafeExternalUrl(payload.originSource)
  ) {
    errors.originSource = "Origin source must be a valid HTTP or HTTPS URL.";
  }

  if (
    payload.currentSource &&
    payload.currentSource.trim() &&
    !isSafeExternalUrl(payload.currentSource)
  ) {
    errors.currentSource = "Current location source must be a valid HTTP or HTTPS URL.";
  }

  payload.media.forEach((item, index) => {
    if (!item.imageUrl.trim() || !isSafeExternalUrl(item.imageUrl)) {
      errors[`media.${index}.imageUrl`] = "Image URL must be a valid HTTP or HTTPS URL.";
    }
    if (item.sourceUrl.trim() && !isSafeExternalUrl(item.sourceUrl)) {
      errors[`media.${index}.sourceUrl`] = "Media source URL must be a valid HTTP or HTTPS URL.";
    }
    if (item.licenseUrl && item.licenseUrl.trim() && !isSafeExternalUrl(item.licenseUrl)) {
      errors[`media.${index}.licenseUrl`] = "License URL must be a valid HTTP or HTTPS URL.";
    }
    if (!VALID_PERIODS.has(item.period)) {
      errors[`media.${index}.period`] = "Media period must be archival, modern, or unknown.";
    }
    if (!isValidYear(item.photoYear)) {
      errors[`media.${index}.photoYear`] =
        `Photo year must be an integer between ${MIN_HISTORICAL_YEAR} and ${MAX_HISTORICAL_YEAR}.`;
    }
  });

  payload.sources.forEach((source, index) => {
    if (!source.title.trim()) {
      errors[`sources.${index}.title`] = "Source title is required.";
    }
    if (!source.url.trim() || !isSafeExternalUrl(source.url)) {
      errors[`sources.${index}.url`] = "Source URL must be a valid HTTP or HTTPS URL.";
    }
  });

  return errors;
}

export function hasValidationErrors(errors: ImportValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
