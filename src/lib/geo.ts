import type { Coordinates, HistoricalEntry, ViewportBounds } from "../types/atlas";

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** A wrapped viewport (minLon > maxLon) becomes two envelopes across the date line. */
export function buildViewportEnvelopes(bounds: ViewportBounds): ViewportBounds[] {
  const { minLat, minLon, maxLat, maxLon } = bounds;
  if (!isValidCoordinate(minLat, minLon) || !isValidCoordinate(maxLat, maxLon) || minLat > maxLat) {
    return [];
  }
  if (minLon <= maxLon) return [bounds];
  return [
    { minLat, minLon, maxLat, maxLon: 180 },
    { minLat, minLon: -180, maxLat, maxLon },
  ];
}

export function isPointInBounds(point: Coordinates, bounds: ViewportBounds): boolean {
  return (
    point.latitude >= bounds.minLat &&
    point.latitude <= bounds.maxLat &&
    point.longitude >= bounds.minLon &&
    point.longitude <= bounds.maxLon
  );
}

export function entryInAnyBounds(entry: HistoricalEntry, envelopes: ViewportBounds[]): boolean {
  return envelopes.some(
    (bounds) =>
      (entry.origin !== null && isPointInBounds(entry.origin, bounds)) ||
      (entry.current !== null && isPointInBounds(entry.current, bounds)),
  );
}

export function toLngLat(point: Coordinates): [number, number] | null {
  return isValidCoordinate(point.latitude, point.longitude)
    ? [point.longitude, point.latitude]
    : null;
}
