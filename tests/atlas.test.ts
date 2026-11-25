import { describe, expect, it } from "vitest";
import {
  atlasReducer,
  defaultFilters,
  filtersFromUrl,
  filtersToSearch,
  initialAtlasState,
} from "../src/app/store/atlasStore";
import { seedEntries, seedLinks, seedMedia } from "../src/data/seed";
import { unescoMedia } from "../src/data/unescoMedia";
import { unescoEntries } from "../src/data/unescoSeed";
import { formatCoordinate, formatYear, formatYearRange } from "../src/lib/format";
import { buildViewportEnvelopes, entryInAnyBounds, isValidCoordinate } from "../src/lib/geo";
import { getComparisonPair } from "../src/lib/media";
import { normalizeSlug } from "../src/lib/validators";
import {
  ensureExtendedCorpusLoaded,
  getMedia,
  getProgress,
  listEntries,
  listEntriesPage,
  patchProgress,
  queryEntriesPage,
} from "../src/services/entriesService";
import type { HistoricalEntry, MediaItem } from "../src/types/atlas";

function makeEntry(overrides: Partial<HistoricalEntry> = {}): HistoricalEntry {
  return {
    id: "x",
    title: "x",
    slug: "x",
    scope: "local",
    entryType: "artifact",
    era: null,
    startYear: null,
    endYear: null,
    dateIsApproximate: false,
    locationName: null,
    summary: "",
    significance: null,
    origin: { latitude: 0, longitude: 0 },
    current: null,
    originPrecision: "unknown",
    currentPrecision: null,
    originSource: null,
    currentSource: null,
    reviewed: false,
    ...overrides,
  };
}

describe("date and coordinate formatting", () => {
  it("uses astronomical year numbering for BCE and supports approximate prefix", () => {
    expect(formatYear(-499)).toBe("500 BCE");
    expect(formatYear(0)).toBe("1 BCE");
    expect(formatYear(1)).toBe("1 CE");
    expect(formatYear(null)).toBe("Date unknown");
    expect(formatYear(-499, true)).toBe("c. 500 BCE");
    expect(formatYear(1571, true)).toBe("c. 1571 CE");
  });

  it("formats single-year, same-year, unknown, and approximate ranges cleanly", () => {
    expect(formatYearRange(-3000, -1500, true)).toBe("c. 3001 BCE – 1501 BCE");
    expect(formatYearRange(1571, null)).toBe("1571 CE");
    expect(formatYearRange(1884, 1884, true)).toBe("c. 1884 CE");
    expect(formatYearRange(null, 1900)).toBe("Date unknown");
  });

  it("labels coordinate precision and hemispheres cleanly", () => {
    expect(formatCoordinate(14.5939, 120.9736, "area_centroid")).toBe(
      "14.5939° N, 120.9736° E · area centroid",
    );
    expect(formatCoordinate(-16.5547, -68.6733, "exact")).toBe("16.5547° S, 68.6733° W");
    expect(formatCoordinate(41.9028, 12.4964, "approximate")).toBe(
      "41.9028° N, 12.4964° E · approximate",
    );
  });
});

describe("viewport bounds", () => {
  it("keeps unwrapped bounds as a single envelope", () => {
    const envelopes = buildViewportEnvelopes({
      minLat: 4,
      minLon: 116,
      maxLat: 21,
      maxLon: 127,
    });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toEqual({ minLat: 4, minLon: 116, maxLat: 21, maxLon: 127 });
  });

  it("splits a wrapped antimeridian viewport into two envelopes", () => {
    const envelopes = buildViewportEnvelopes({
      minLat: -10,
      minLon: 170,
      maxLat: 10,
      maxLon: -170,
    });
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]).toEqual({ minLat: -10, minLon: 170, maxLat: 10, maxLon: 180 });
    expect(envelopes[1]).toEqual({ minLat: -10, minLon: -180, maxLat: 10, maxLon: -170 });
  });

  it("rejects impossible or out-of-range bounds", () => {
    expect(buildViewportEnvelopes({ minLat: 20, minLon: 0, maxLat: -20, maxLon: 10 })).toEqual([]);
    expect(buildViewportEnvelopes({ minLat: -95, minLon: 0, maxLat: 10, maxLon: 10 })).toEqual([]);
    expect(buildViewportEnvelopes({ minLat: 0, minLon: 0, maxLat: 10, maxLon: 190 })).toEqual([]);
  });

  it("matches an origin or current location including across wrapped bounds", () => {
    const manilaEnvelopes = buildViewportEnvelopes({
      minLat: 10,
      minLon: 120,
      maxLat: 20,
      maxLon: 130,
    });
    expect(isValidCoordinate(14.59, 120.97)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(
      entryInAnyBounds(
        makeEntry({
          origin: { latitude: 0, longitude: 0 },
          current: { latitude: 14.59, longitude: 120.97 },
          originPrecision: "unknown",
          currentPrecision: "exact",
        }),
        manilaEnvelopes,
      ),
    ).toBe(true);

    const antimeridianEnvelopes = buildViewportEnvelopes({
      minLat: -25,
      minLon: 170,
      maxLat: -10,
      maxLon: -165,
    });
    expect(
      entryInAnyBounds(
        makeEntry({ origin: { latitude: -13.83, longitude: -171.75 } }),
        antimeridianEnvelopes,
      ),
    ).toBe(true);
    expect(
      entryInAnyBounds(
        makeEntry({ origin: { latitude: -18.14, longitude: 178.44 } }),
        antimeridianEnvelopes,
      ),
    ).toBe(true);
    expect(
      entryInAnyBounds(
        makeEntry({ origin: { latitude: -15, longitude: 0 } }),
        antimeridianEnvelopes,
      ),
    ).toBe(false);
    expect(entryInAnyBounds(makeEntry({ origin: null, current: null }), manilaEnvelopes)).toBe(
      false,
    );
  });
});

describe("media comparison eligibility", () => {
  const item = (id: string, period: MediaItem["period"], group: string | null): MediaItem => ({
    id,
    entryId: "e",
    imageUrl: "",
    sourceUrl: "",
    caption: "",
    period,
    photoYear: null,
    creator: null,
    license: null,
    comparisonGroup: group,
  });

  it("requires an archival and a modern image in the same reviewed group", () => {
    expect(getComparisonPair([item("a", "archival", "g"), item("b", "unknown", "g")])).toBeNull();
    expect(getComparisonPair([item("a", "archival", null), item("b", "modern", null)])).toBeNull();
    expect(
      getComparisonPair([item("a", "archival", "g"), item("b", "modern", "g")])?.modern.id,
    ).toBe("b");
    expect(
      getComparisonPair([item("a", "archival", "g"), item("b", "modern", "other")]),
    ).toBeNull();
  });

  it("includes multiple reviewed archival and modern comparison pairs in seed media", () => {
    const pairsFound = seedEntries
      .map((entry) => getComparisonPair(seedMedia.filter((m) => m.entryId === entry.id)))
      .filter((pair) => pair !== null);

    expect(pairsFound.length).toBeGreaterThanOrEqual(10);
  });
});

describe("state rules", () => {
  it("sets the canonical id and role on selection and keeps selection after filters change", () => {
    const selected = atlasReducer(initialAtlasState, {
      type: "selectEntry",
      id: "e-1",
      role: "current",
    });
    expect(selected.activeEntryId).toBe("e-1");
    expect(selected.activeLocationRole).toBe("current");
    expect(selected.isContextDrawerOpen).toBe(true);

    const filtered = atlasReducer(selected, {
      type: "setFilter",
      patch: { scope: "international" },
    });
    expect(filtered.activeEntryId).toBe("e-1");

    const roleUpdated = atlasReducer(filtered, { type: "setRole", role: "origin" });
    expect(roleUpdated.activeLocationRole).toBe("origin");

    const closed = atlasReducer(roleUpdated, { type: "closeDrawer" });
    expect(closed.isContextDrawerOpen).toBe(false);
    expect(closed.activeEntryId).toBe("e-1");

    const reopened = atlasReducer(closed, { type: "openDrawer" });
    expect(reopened.isContextDrawerOpen).toBe(true);

    const reset = atlasReducer(reopened, { type: "resetFilters" });
    expect(reset.filters).toEqual(defaultFilters);

    const cleared = atlasReducer(reset, { type: "clearSelection" });
    expect(cleared.activeEntryId).toBeNull();
    expect(cleared.activeLocationRole).toBeNull();
  });

  it("reads and serializes filters via URL search params", () => {
    const filters = filtersFromUrl("?q=stone&scope=international&type=place&from=-3000&area=false");
    expect(filters.query).toBe("stone");
    expect(filters.scope).toBe("international");
    expect(filters.entryType).toBe("place");
    expect(filters.minYear).toBe(-3000);
    expect(filters.maxYear).toBeNull();
    expect(filters.searchThisArea).toBe(false);

    const search = filtersToSearch(filters);
    expect(filtersFromUrl(search)).toEqual(filters);
    expect(filtersToSearch(defaultFilters)).toBe("");
  });
});

describe("dataset helpers and enriched corpus integrity", () => {
  it("normalizes slugs", () => {
    expect(normalizeSlug("Fort Santiago")).toBe("fort-santiago");
    expect(normalizeSlug("Noli Me Tángere — Manuscript!")).toBe("noli-me-tangere-manuscript");
  });

  it("verifies enriched UNESCO and curated seed dataset integrity", async () => {
    await ensureExtendedCorpusLoaded();

    expect(seedEntries.length).toBeGreaterThanOrEqual(45);
    expect(seedLinks.length).toBeGreaterThanOrEqual(30);
    expect(unescoEntries.length).toBeGreaterThanOrEqual(2620);

    const relocatedArtifacts = seedEntries.filter(
      (entry) => entry.entryType === "artifact" && entry.current !== null,
    );
    expect(relocatedArtifacts.length).toBeGreaterThan(0);

    const rawQTitles = unescoEntries.filter((entry) => /^Q\d+$/.test(entry.title.trim()));
    expect(rawQTitles).toEqual([]);

    const placeholder = "No description is recorded in Wikidata for this item.";
    const genericWikidataFallback = "UNESCO World Heritage Site recorded in Wikidata.";
    const invalidSummaries = unescoEntries.filter(
      (entry) =>
        !entry.summary.trim() ||
        entry.summary === placeholder ||
        entry.summary === genericWikidataFallback ||
        /^UNESCO World Heritage Site in /.test(entry.summary),
    );
    expect(invalidSummaries).toEqual([]);

    const missingLocationNames = unescoEntries.filter(
      (entry) => !entry.locationName || !entry.locationName.trim(),
    );
    expect(missingLocationNames).toEqual([]);

    const entries = [...seedEntries, ...unescoEntries];
    const media = [...seedMedia, ...unescoMedia];
    const withoutSummary = entries.filter(
      (entry) => !entry.summary.trim() || entry.summary === placeholder,
    );
    const mediaIds = new Set(media.map((item) => item.entryId));
    const withoutMedia = entries.filter((entry) => !mediaIds.has(entry.id));
    expect(withoutSummary.map((entry) => entry.id)).toEqual([]);
    expect(withoutMedia.map((entry) => entry.id)).toEqual([]);
    expect(getMedia(unescoEntries[0].id)).toHaveLength(1);
  });

  it("loads the fetched Wikidata corpus, caps world results, and paginates accurately", async () => {
    await ensureExtendedCorpusLoaded();
    expect(unescoEntries.length).toBeGreaterThanOrEqual(2620);

    const worldFilters = {
      query: "",
      scope: "all" as const,
      entryType: "all" as const,
      minYear: null,
      maxYear: null,
      searchThisArea: false,
    };

    const world = listEntries(worldFilters, null);
    expect(world).toHaveLength(500);

    const expectedTotal = seedEntries.length + unescoEntries.length;
    const firstPage = listEntriesPage(worldFilters, null, { limit: 150, offset: 0 });
    expect(firstPage.entries).toHaveLength(150);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextOffset).toBe(150);
    expect(firstPage.totalMatched).toBe(expectedTotal);

    const tailOffset = expectedTotal - 20;
    const lastPage = listEntriesPage(worldFilters, null, { limit: 150, offset: tailOffset });
    expect(lastPage.entries).toHaveLength(20);
    expect(lastPage.hasMore).toBe(false);
    expect(lastPage.nextOffset).toBeNull();
    expect(lastPage.totalMatched).toBe(expectedTotal);
  });

  it("supports dual-mode queryEntriesPage in local mode", async () => {
    const page1 = await queryEntriesPage(
      {
        query: "",
        scope: "local",
        entryType: "place",
        minYear: null,
        maxYear: null,
        searchThisArea: false,
      },
      null,
      { limit: 10, offset: 0 },
    );
    expect(page1.entries.length).toBe(10);
    expect(page1.entries.every((e) => e.scope === "local" && e.entryType === "place")).toBe(true);
    expect(page1.totalMatched).toBeGreaterThan(10);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextOffset).toBe(10);

    const page2 = await queryEntriesPage(
      {
        query: "",
        scope: "local",
        entryType: "place",
        minYear: null,
        maxYear: null,
        searchThisArea: false,
      },
      null,
      { limit: 10, offset: 10 },
    );
    expect(page2.entries.length).toBeGreaterThan(0);
    expect(page2.entries[0].id).not.toBe(page1.entries[0].id);
  });

  it("composes scope, type, year, and text filters", async () => {
    await ensureExtendedCorpusLoaded();

    const filters = {
      query: "walls",
      scope: "local" as const,
      entryType: "place" as const,
      minYear: null,
      maxYear: null,
      searchThisArea: false,
    };
    expect(listEntries(filters, null).map((entry) => entry.slug)).toEqual([]);
    const byScope = listEntries({ ...filters, query: "", maxYear: 1600 }, null);
    expect(byScope.length).toBeGreaterThan(0);
    expect(byScope.every((entry) => entry.scope === "local")).toBe(true);
    expect(byScope.some((entry) => entry.startYear !== null && entry.startYear > 1600)).toBe(false);
  });

  it("merges progress patches without losing an earlier field", () => {
    const id = "e-test-merge";
    patchProgress(id, { notes: "A note" });
    patchProgress(id, { visited: true });
    expect(getProgress(id)).toEqual({ visited: true, notes: "A note" });
  });
});
