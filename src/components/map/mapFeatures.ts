import { formatYearRange } from "../../lib/format";
import { isValidCoordinate } from "../../lib/geo";
import type { Coordinates, DirectedEntryLink, HistoricalEntry } from "../../types/atlas";

type Position = [number, number];

interface PointProps {
  entryId: string;
  locationRole: "origin" | "current";
  entryType: string;
  title: string;
  dateLabel: string;
}

/** Spherical interpolation, split where the path crosses the International Date Line. */
export function greatCircleSegments(from: Coordinates, to: Coordinates, steps = 48): Position[][] {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const lat1 = toRad(from.latitude);
  const lon1 = toRad(from.longitude);
  const lat2 = toRad(to.latitude);
  const lon2 = toRad(to.longitude);
  const delta =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (delta < 1e-9) return [[[from.longitude, from.latitude]]];
  if (Math.abs(Math.PI - delta) < 1e-6) return [];

  const segments: Position[][] = [];
  let current: Position[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const a = Math.sin((1 - t) * delta) / Math.sin(delta);
    const b = Math.sin(t * delta) / Math.sin(delta);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDeg(Math.atan2(y, x));
    if (current.length && Math.abs(lon - current.at(-1)![0]) > 180) {
      segments.push(current);
      current = [];
    }
    current.push([lon, lat]);
  }
  if (current.length) segments.push(current);
  return segments;
}

const point = (id: string, coords: Coordinates, properties: PointProps) => ({
  type: "Feature" as const,
  id,
  geometry: {
    type: "Point" as const,
    coordinates: [coords.longitude, coords.latitude] as Position,
  },
  properties,
});

function mergeEntries(
  entries: HistoricalEntry[],
  activeEntry?: HistoricalEntry | null,
): HistoricalEntry[] {
  if (!activeEntry) return entries;
  if (entries.some((entry) => entry.id === activeEntry.id)) return entries;
  return [...entries, activeEntry];
}

function validCoords(coords: Coordinates | null): coords is Coordinates {
  return coords !== null && isValidCoordinate(coords.latitude, coords.longitude);
}

export function buildOriginCollection(
  entries: HistoricalEntry[],
  activeEntry?: HistoricalEntry | null,
) {
  const combined = mergeEntries(entries, activeEntry);
  return {
    type: "FeatureCollection" as const,
    features: combined
      .filter((entry) => validCoords(entry.origin))
      .map((entry) =>
        point(`${entry.id}:origin`, entry.origin!, {
          entryId: entry.id,
          locationRole: "origin" as const,
          entryType: entry.entryType,
          title: entry.title,
          dateLabel: formatYearRange(entry.startYear, entry.endYear, entry.dateIsApproximate),
        }),
      ),
  };
}

export function buildCurrentCollection(
  entries: HistoricalEntry[],
  activeEntry?: HistoricalEntry | null,
) {
  const combined = mergeEntries(entries, activeEntry);
  return {
    type: "FeatureCollection" as const,
    features: combined
      .filter((entry) => validCoords(entry.current))
      .map((entry) =>
        point(`${entry.id}:current`, entry.current!, {
          entryId: entry.id,
          locationRole: "current" as const,
          entryType: entry.entryType,
          title: entry.title,
          dateLabel: formatYearRange(entry.startYear, entry.endYear, entry.dateIsApproximate),
        }),
      ),
  };
}

export function buildArtifactTransferCollection(
  entries: HistoricalEntry[],
  activeEntry?: HistoricalEntry | null,
) {
  const combined = mergeEntries(entries, activeEntry);
  const features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: Position[] };
    properties: { entryId: string; title: string; isActive: boolean };
  }> = [];

  for (const entry of combined) {
    if (entry.entryType !== "artifact") continue;
    if (!validCoords(entry.origin) || !validCoords(entry.current)) continue;
    for (const coordinates of greatCircleSegments(entry.origin, entry.current)) {
      if (coordinates.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          entryId: entry.id,
          title: entry.title,
          isActive: activeEntry ? entry.id === activeEntry.id : false,
        },
      });
    }
  }

  return { type: "FeatureCollection" as const, features };
}

export function buildActiveFeature(entry: HistoricalEntry, role: "origin" | "current" | null) {
  const coords = role === "current" ? entry.current : entry.origin;
  if (!validCoords(coords)) return null;
  return point(`${entry.id}:active`, coords, {
    entryId: entry.id,
    locationRole: role ?? "origin",
    entryType: entry.entryType,
    title: entry.title,
    dateLabel: formatYearRange(entry.startYear, entry.endYear, entry.dateIsApproximate),
  });
}

function coordKey(c: Coordinates): string {
  return `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`;
}

export function buildArcCollection(
  active: HistoricalEntry,
  links: DirectedEntryLink[],
  resolve: (id: string) => HistoricalEntry | undefined,
) {
  const features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: Position[] };
    properties: { label: string; relationshipType: string; direction: "in" | "out" };
  }> = [];

  const seenGeometries = new Set<string>();

  for (const link of links) {
    const other = resolve(link.direction === "out" ? link.targetId : link.sourceId);

    let from: Coordinates | null = null;
    let to: Coordinates | null = null;

    if (link.relationshipType === "artifact_relocation") {
      if (link.direction === "out") {
        from = active.origin;
        to = active.current ?? other?.current ?? other?.origin ?? null;
      } else {
        from = other?.origin ?? null;
        to = other?.current ?? active.origin;
      }
    } else {
      if (!other) continue;
      from = active.origin;
      to = other.origin;
    }

    if (!validCoords(from) || !validCoords(to)) continue;
    if (coordKey(from) === coordKey(to)) continue;

    const dedupeKey = `${link.relationshipType}:${coordKey(from)}->${coordKey(to)}`;
    if (seenGeometries.has(dedupeKey)) continue;
    seenGeometries.add(dedupeKey);

    for (const coordinates of greatCircleSegments(from, to)) {
      if (coordinates.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          label: link.relationshipLabel,
          relationshipType: link.relationshipType,
          direction: link.direction,
        },
      });
    }
  }

  return { type: "FeatureCollection" as const, features };
}
