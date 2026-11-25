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

function wrapLongitude(value: number): number {
  if (value >= -180 && value <= 180) return value;
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

/**
 * A wrapped viewport (minLon > maxLon) becomes two envelopes across the date line.
 * MapLibre can report longitudes past ±180, so normalize before splitting.
 */
export function buildViewportEnvelopes(bounds: ViewportBounds): ViewportBounds[] {
  const { minLat, minLon, maxLat, maxLon } = bounds;
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLon) ||
    minLat < -90 ||
    maxLat > 90 ||
    minLat > maxLat
  ) {
    return [];
  }
  if (Math.abs(maxLon - minLon) >= 360) {
    return [{ minLat, minLon: -180, maxLat, maxLon: 180 }];
  }
  const wrappedMinLon = wrapLongitude(minLon);
  const wrappedMaxLon = wrapLongitude(maxLon);
  if (wrappedMinLon <= wrappedMaxLon) {
    return [{ minLat, minLon: wrappedMinLon, maxLat, maxLon: wrappedMaxLon }];
  }
  return [
    { minLat, minLon: wrappedMinLon, maxLat, maxLon: 180 },
    { minLat, minLon: -180, maxLat, maxLon: wrappedMaxLon },
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
