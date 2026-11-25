import { describe, expect, it } from "vitest";
import {
  buildActiveFeature,
  buildArcCollection,
  buildArtifactTransferCollection,
  buildCurrentCollection,
  buildOriginCollection,
  greatCircleSegments,
} from "../src/components/map/mapFeatures";
import type { DirectedEntryLink, HistoricalEntry } from "../src/types/atlas";

function makeEntry(overrides: Partial<HistoricalEntry>): HistoricalEntry {
  return {
    id: "e-default",
    title: "Default Entry",
    slug: "default-entry",
    scope: "international",
    entryType: "place",
    era: null,
    startYear: 1500,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Somewhere",
    summary: "Summary text",
    significance: null,
    origin: { latitude: 14.5939, longitude: 120.9736 },
    current: null,
    originPrecision: "approximate",
    currentPrecision: null,
    originSource: null,
    currentSource: null,
    reviewed: true,
    ...overrides,
  };
}

describe("greatCircleSegments", () => {
  it("builds a smooth single segment for short and medium routes", () => {
    const segments = greatCircleSegments(
      { latitude: 14.5939, longitude: 120.9736 },
      { latitude: 10.3157, longitude: 123.8854 },
      24,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(25);
    expect(segments[0][0][0]).toBeCloseTo(120.9736, 4);
    expect(segments[0][0][1]).toBeCloseTo(14.5939, 4);
    expect(segments[0][24][0]).toBeCloseTo(123.8854, 4);
    expect(segments[0][24][1]).toBeCloseTo(10.3157, 4);
  });

  it("builds a smooth long route without >180 degree jumps", () => {
    const segments = greatCircleSegments(
      { latitude: 41.9028, longitude: 12.4964 },
      { latitude: 14.5869, longitude: 120.9812 },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(49);
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i += 1) {
        expect(Math.abs(segment[i][0] - segment[i - 1][0])).toBeLessThanOrEqual(180);
      }
    }
  });

  it("splits routes crossing the antimeridian into separate segments without >180 degree longitude jumps", () => {
    const segments = greatCircleSegments(
      { latitude: 35.6762, longitude: 139.6503 },
      { latitude: 37.7749, longitude: -122.4194 },
    );
    expect(segments.length).toBeGreaterThanOrEqual(2);
    for (const segment of segments) {
      expect(segment.length).toBeGreaterThan(0);
      for (let i = 1; i < segment.length; i += 1) {
        expect(Math.abs(segment[i][0] - segment[i - 1][0])).toBeLessThanOrEqual(180);
      }
    }
  });

  it("returns a single-point segment for coincident coordinates", () => {
    const segments = greatCircleSegments(
      { latitude: 14.5939, longitude: 120.9736 },
      { latitude: 14.5939, longitude: 120.9736 },
    );
    expect(segments).toEqual([[[120.9736, 14.5939]]]);
  });

  it("guards near-antipodal points against numerical instability", () => {
    expect(
      greatCircleSegments({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }),
    ).toEqual([]);
    expect(
      greatCircleSegments({ latitude: 15, longitude: 120 }, { latitude: -15, longitude: -60 }),
    ).toEqual([]);
  });
});

describe("point feature collections", () => {
  it("buildOriginCollection maps valid origins, skips null/invalid coordinates, and merges activeEntry without duplicating", () => {
    const intramuros = makeEntry({ id: "e-1", title: "Intramuros" });
    const unlocated = makeEntry({ id: "e-2", title: "Unlocated", origin: null });
    const invalid = makeEntry({
      id: "e-3",
      title: "Invalid",
      origin: { latitude: 95, longitude: 10 },
    });
    const extraActive = makeEntry({
      id: "e-4",
      title: "Extra Active",
      entryType: "artifact",
      origin: { latitude: 31.4, longitude: 30.3 },
    });

    const collection = buildOriginCollection([intramuros, unlocated, invalid], extraActive);
    expect(collection.features.map((f) => f.id)).toEqual(["e-1:origin", "e-4:origin"]);
    expect(collection.features[0].geometry.coordinates).toEqual([120.9736, 14.5939]);
    expect(collection.features[0].properties.locationRole).toBe("origin");

    const noDup = buildOriginCollection([intramuros], intramuros);
    expect(noDup.features).toHaveLength(1);
  });

  it("buildCurrentCollection includes only valid current coordinates and merges activeEntry", () => {
    const place = makeEntry({ id: "e-place", current: null });
    const artifact = makeEntry({
      id: "e-art",
      entryType: "artifact",
      current: { latitude: 51.5194, longitude: -0.127 },
    });
    const invalidCurrent = makeEntry({
      id: "e-bad",
      entryType: "artifact",
      current: { latitude: 0, longitude: 200 },
    });

    const collection = buildCurrentCollection([place, invalidCurrent], artifact);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].id).toBe("e-art:current");
    expect(collection.features[0].geometry.coordinates).toEqual([-0.127, 51.5194]);
    expect(collection.features[0].properties.locationRole).toBe("current");
  });

  it("buildActiveFeature respects role and returns null when selected role lacks valid coordinates", () => {
    const place = makeEntry({ id: "e-p", current: null });
    expect(buildActiveFeature(place, "current")).toBeNull();
    expect(buildActiveFeature(place, null)?.properties.locationRole).toBe("origin");

    const artifact = makeEntry({
      id: "e-a",
      entryType: "artifact",
      current: { latitude: 14.5869, longitude: 120.9812 },
    });
    const currentFeat = buildActiveFeature(artifact, "current");
    expect(currentFeat?.id).toBe("e-a:active");
    expect(currentFeat?.geometry.coordinates).toEqual([120.9812, 14.5869]);
  });
});

describe("buildArtifactTransferCollection", () => {
  it("produces transfer segments for relocated artifacts even with zero EntryLinks", () => {
    const spoliarium = makeEntry({
      id: "e-spoliarium",
      title: "Spoliarium",
      entryType: "artifact",
      origin: { latitude: 41.9028, longitude: 12.4964 },
      current: { latitude: 14.5869, longitude: 120.9812 },
    });
    const nonRelocated = makeEntry({
      id: "e-static-artifact",
      entryType: "artifact",
      origin: { latitude: 14.6, longitude: 120.98 },
      current: null,
    });
    const place = makeEntry({
      id: "e-place",
      entryType: "place",
      origin: { latitude: 14.6, longitude: 120.98 },
      current: { latitude: 15.0, longitude: 121.0 },
    });

    const collection = buildArtifactTransferCollection([spoliarium, nonRelocated, place], spoliarium);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties).toEqual({
      entryId: "e-spoliarium",
      title: "Spoliarium",
      isActive: true,
    });
    expect(collection.features[0].geometry.coordinates.length).toBeGreaterThan(2);
  });

  it("skips artifacts with missing or identical coordinates and marks inactive transfers false", () => {
    const missingOrigin = makeEntry({
      id: "e-no-origin",
      entryType: "artifact",
      origin: null,
      current: { latitude: 14.5, longitude: 121.0 },
    });
    const sameCoords = makeEntry({
      id: "e-same",
      entryType: "artifact",
      origin: { latitude: 14.5, longitude: 121.0 },
      current: { latitude: 14.5, longitude: 121.0 },
    });
    const transPacific = makeEntry({
      id: "e-pacific",
      title: "Manila Galleon Artifact",
      entryType: "artifact",
      origin: { latitude: 14.59, longitude: 120.97 },
      current: { latitude: 16.85, longitude: -99.88 },
    });

    const collection = buildArtifactTransferCollection(
      [missingOrigin, sameCoords, transPacific],
      null,
    );
    expect(collection.features.length).toBeGreaterThanOrEqual(2);
    expect(collection.features.every((f) => f.properties.entryId === "e-pacific")).toBe(true);
    expect(collection.features.every((f) => f.properties.isActive === false)).toBe(true);
  });
});

describe("buildArcCollection", () => {
  const romeOrigin = { latitude: 41.9028, longitude: 12.4964 };
  const manilaCurrent = { latitude: 14.5869, longitude: 120.9812 };
  const cebuOrigin = { latitude: 10.2934, longitude: 123.902 };
  const unlocatedOrigin = null;

  const intramuros = makeEntry({
    id: "e-intramuros",
    title: "Intramuros",
    origin: { latitude: 14.5939, longitude: 120.9736 },
  });
  const cebu = makeEntry({ id: "e-cebu", title: "Magellan's Cross", origin: cebuOrigin });
  const unlocated = makeEntry({ id: "e-unlocated", title: "Unlocated", origin: unlocatedOrigin });
  const museum = makeEntry({
    id: "e-museum",
    title: "National Museum",
    origin: manilaCurrent,
  });
  const spoliarium = makeEntry({
    id: "e-spoliarium",
    title: "Spoliarium",
    entryType: "artifact",
    origin: romeOrigin,
    current: manilaCurrent,
  });

  const catalog = new Map([intramuros, cebu, unlocated, museum, spoliarium].map((e) => [e.id, e]));
  const resolve = (id: string) => catalog.get(id);

  it("resolves directional in/out links and deduplicates identical arc geometries", () => {
    const links: DirectedEntryLink[] = [
      {
        id: "l1",
        sourceId: "e-cebu",
        targetId: "e-intramuros",
        relationshipType: "historical_influence",
        relationshipLabel: "First link",
        description: null,
        direction: "in",
      },
      {
        id: "l2",
        sourceId: "e-intramuros",
        targetId: "e-cebu",
        relationshipType: "historical_influence",
        relationshipLabel: "Duplicate geometry same type",
        description: null,
        direction: "out",
      },
      {
        id: "l3",
        sourceId: "e-intramuros",
        targetId: "e-cebu",
        relationshipType: "cultural_exchange",
        relationshipLabel: "Different relationship type",
        description: null,
        direction: "out",
      },
      {
        id: "l4",
        sourceId: "e-intramuros",
        targetId: "e-unlocated",
        relationshipType: "related_site",
        relationshipLabel: "Missing target origin",
        description: null,
        direction: "out",
      },
      {
        id: "l5",
        sourceId: "e-intramuros",
        targetId: "e-missing-record",
        relationshipType: "related_site",
        relationshipLabel: "Unresolved entry",
        description: null,
        direction: "out",
      },
    ];

    const collection = buildArcCollection(intramuros, links, resolve);
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].properties).toEqual({
      label: "First link",
      relationshipType: "historical_influence",
      direction: "in",
    });
    expect(collection.features[1].properties).toEqual({
      label: "Different relationship type",
      relationshipType: "cultural_exchange",
      direction: "out",
    });
  });

  it("handles artifact_relocation outgoing and incoming target resolution", () => {
    const outLinks: DirectedEntryLink[] = [
      {
        id: "l-reloc-out",
        sourceId: "e-spoliarium",
        targetId: "e-museum",
        relationshipType: "artifact_relocation",
        relationshipLabel: "Painted in Rome, held in Manila",
        description: null,
        direction: "out",
      },
    ];
    const outArcs = buildArcCollection(spoliarium, outLinks, resolve);
    expect(outArcs.features).toHaveLength(1);
    const outCoords = outArcs.features[0].geometry.coordinates;
    expect(outCoords[0][0]).toBeCloseTo(romeOrigin.longitude, 3);
    expect(outCoords[outCoords.length - 1][0]).toBeCloseTo(manilaCurrent.longitude, 3);

    const inLinks: DirectedEntryLink[] = [
      {
        id: "l-reloc-in",
        sourceId: "e-spoliarium",
        targetId: "e-museum",
        relationshipType: "artifact_relocation",
        relationshipLabel: "Held at National Museum",
        description: null,
        direction: "in",
      },
    ];
    const inArcs = buildArcCollection(museum, inLinks, resolve);
    expect(inArcs.features).toHaveLength(1);
    const inCoords = inArcs.features[0].geometry.coordinates;
    expect(inCoords[0][0]).toBeCloseTo(romeOrigin.longitude, 3);
    expect(inCoords[inCoords.length - 1][0]).toBeCloseTo(manilaCurrent.longitude, 3);
  });

  it("skips coincident endpoints cleanly", () => {
    const samePoint = makeEntry({
      id: "e-same-spot",
      origin: intramuros.origin,
    });
    const arcs = buildArcCollection(
      intramuros,
      [
        {
          id: "l-same",
          sourceId: "e-intramuros",
          targetId: "e-same-spot",
          relationshipType: "related_site",
          relationshipLabel: "Coincident",
          description: null,
          direction: "out",
        },
      ],
      (id) => (id === "e-same-spot" ? samePoint : resolve(id)),
    );
    expect(arcs.features).toEqual([]);
  });
});
