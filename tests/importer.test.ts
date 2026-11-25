import { describe, expect, it, vi } from "vitest";
import { seedEntries } from "../src/data/seed";
import { sanitizePlainText } from "../src/lib/validators";
import {
  exportOverlayJson,
  getEntry,
  getMedia,
  getOverlayStats,
  getSources,
  resetOverlay,
  saveImportedEntry,
  toggleEntryReviewed,
} from "../src/services/entriesService";
import {
  findDuplicateCandidates,
  normalizeComparableUrl,
  normalizeComparisonTitle,
} from "../src/services/import/duplicateDetection";
import {
  buildImportDraftPayload,
  inferImportScope,
  isPhilippineCoordinates,
} from "../src/services/import/importPayloadBuilder";
import {
  classifyMediaPeriod,
  extractPhotoYear,
  fetchWikimediaImageMetadata,
} from "../src/services/import/wikimediaService";
import {
  fetchWikiJsonWithRetry,
  fetchWikipediaArticle,
  type WikipediaFetchedArticle,
} from "../src/services/import/wikipediaService";
import { isAllowedWikipediaHost, parseWikipediaUrl } from "../src/services/import/wikiUrlParser";
import { hasValidationErrors, validateImportPayload } from "../src/services/import/wikiValidator";
import type { HistoricalEntry, ImportDraftPayload, SourceRef } from "../src/types/atlas";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeDraft(overrides: Partial<ImportDraftPayload> = {}): ImportDraftPayload {
  return {
    title: "Banaue Rice Terraces Heritage Site",
    slug: "banaue-rice-terraces-heritage-site",
    scope: "local",
    entryType: "place",
    era: "Pre-colonial",
    startYear: 1000,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Ifugao, Philippines",
    summary: "Terraced rice fields carved into the mountains of Ifugao.",
    significance: "Living cultural landscape of northern Luzon.",
    origin: { latitude: 16.923, longitude: 121.055 },
    current: null,
    originPrecision: "approximate",
    currentPrecision: null,
    originSource: "https://en.wikipedia.org/wiki/Banaue_Rice_Terraces",
    currentSource: null,
    reviewed: false,
    media: [
      {
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/example.jpg",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
        caption: "Banaue terraces",
        period: "modern",
        photoYear: 2012,
        creator: "Photographer",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        attributionText: "Photographer · CC BY-SA 4.0",
        comparisonGroup: null,
      },
    ],
    sources: [
      {
        title: "Banaue Rice Terraces (EN Wikipedia)",
        url: "https://en.wikipedia.org/wiki/Banaue_Rice_Terraces",
        publisher: "Wikipedia (en)",
        sourceType: "encyclopedia",
        notes: "Imported from Wikipedia; requires human curator review.",
      },
    ],
    ...overrides,
  };
}

describe("parseWikipediaUrl and allowlist", () => {
  it("accepts supported Wikipedia editions, mobile hosts, index.php, and unicode titles", () => {
    expect(isAllowedWikipediaHost("en.wikipedia.org")).toBe(true);
    expect(isAllowedWikipediaHost("tl.wikipedia.org")).toBe(true);
    expect(isAllowedWikipediaHost("en.m.wikipedia.org")).toBe(true);
    expect(isAllowedWikipediaHost("commons.wikipedia.org")).toBe(false);

    expect(parseWikipediaUrl("https://en.wikipedia.org/wiki/Intramuros")).toEqual({
      ok: true,
      lang: "en",
      title: "Intramuros",
      normalizedUrl: "https://en.wikipedia.org/wiki/Intramuros",
    });

    expect(parseWikipediaUrl("https://tl.wikipedia.org/wiki/Maynila")).toEqual({
      ok: true,
      lang: "tl",
      title: "Maynila",
      normalizedUrl: "https://tl.wikipedia.org/wiki/Maynila",
    });

    expect(parseWikipediaUrl("https://en.m.wikipedia.org/wiki/Fort_Santiago#History")).toEqual({
      ok: true,
      lang: "en",
      title: "Fort Santiago",
      normalizedUrl: "https://en.wikipedia.org/wiki/Fort_Santiago",
    });

    expect(
      parseWikipediaUrl("https://en.wikipedia.org/w/index.php?title=Rizal_Park&action=view"),
    ).toEqual({
      ok: true,
      lang: "en",
      title: "Rizal Park",
      normalizedUrl: "https://en.wikipedia.org/wiki/Rizal_Park",
    });

    const unicode = parseWikipediaUrl("https://en.wikipedia.org/wiki/Jos%C3%A9_Rizal");
    expect(unicode).toEqual({
      ok: true,
      lang: "en",
      title: "José Rizal",
      normalizedUrl: "https://en.wikipedia.org/wiki/Jos%C3%A9_Rizal",
    });
  });

  it("rejects non-Wikipedia hosts, localhost, dangerous schemes, ports, credentials, and special namespaces", () => {
    const rejected = [
      "",
      "https://example.com/wiki/Intramuros",
      "http://localhost/wiki/Intramuros",
      "javascript:alert(1)",
      "https://en.wikipedia.org:8443/wiki/Intramuros",
      "https://user:pass@en.wikipedia.org/wiki/Intramuros",
      "https://commons.wikimedia.org/wiki/File:Test.jpg",
      "https://en.wikipedia.org/wiki/Special:RecentChanges",
      "https://en.wikipedia.org/wiki/File:Intramuros.jpg",
      "https://en.wikipedia.org/wiki/Category:Manila",
      "https://en.wikipedia.org/wiki/Talk:Intramuros",
      "https://en.wikipedia.org/wiki/",
      "https://en.wikipedia.org/wiki/Bad%ZZEncoding",
    ];

    for (const candidate of rejected) {
      const result = parseWikipediaUrl(candidate);
      expect(result.ok, `Expected rejection for: ${candidate}`).toBe(false);
    }
  });
});

describe("fetchWikipediaArticle and sanitizePlainText", () => {
  it("parses valid article metadata, coordinates, and strips HTML markup", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/api/rest_v1/page/summary/")) {
        return jsonResponse({
          type: "standard",
          title: "Intramuros",
          displaytitle: "<i>Intramuros</i><script>alert(1)</script>",
          description: "Historic walled area &ndash; Manila",
          extract: "<p>Intramuros is the historic walled core of Manila&amp;vicinity.</p>",
          wikibase_item: "Q1434624",
          coordinates: { lat: 14.59, lon: 120.97 },
          thumbnail: { source: "https://upload.wikimedia.org/thumb.jpg" },
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Intramuros" } },
        });
      }
      return jsonResponse({
        query: {
          pages: [
            {
              title: "Intramuros",
              fullurl: "https://en.wikipedia.org/wiki/Intramuros",
              extract: "Intramuros is the walled city established in 1571.",
              pageimage: "Intramuros_walls.jpg",
              thumbnail: { source: "https://upload.wikimedia.org/action-thumb.jpg" },
              coordinates: [{ lat: 14.5939, lon: 120.9736 }],
              pageprops: { wikibase_item: "Q1434624" },
            },
          ],
        },
      });
    });

    const result = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Intramuros", {
      fetchImpl: fetchMock,
      baseDelayMs: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success");
    expect(result.article.canonicalTitle).toBe("Intramuros");
    expect(result.article.coordinates).toEqual({ latitude: 14.5939, longitude: 120.9736 });
    expect(result.article.wikidataId).toBe("Q1434624");
    expect(result.article.pageImageTitle).toBe("Intramuros_walls.jpg");
    expect(result.article.thumbnailUrl).toBe("https://upload.wikimedia.org/action-thumb.jpg");
    expect(result.article.summary).toBe(
      "Intramuros is the historic walled core of Manila&vicinity.",
    );
    expect(result.article.description).toBe("Historic walled area – Manila");
  });

  it("tracks article redirects via Action API redirects and title changes", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/api/rest_v1/page/summary/")) {
        return jsonResponse({
          type: "standard",
          title: "Rizal Park",
          extract: "Urban park in Manila.",
        });
      }
      return jsonResponse({
        query: {
          redirects: [{ from: "Luneta", to: "Rizal Park" }],
          pages: [{ title: "Rizal Park", fullurl: "https://en.wikipedia.org/wiki/Rizal_Park" }],
        },
      });
    });

    const result = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Luneta", {
      fetchImpl: fetchMock,
      baseDelayMs: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected redirect article to succeed");
    expect(result.article.redirectedFrom).toBe("Luneta");
    expect(result.article.canonicalTitle).toBe("Rizal Park");
  });

  it("rejects disambiguation pages from REST or Action metadata", async () => {
    const restDisambigFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/api/rest_v1/page/summary/")) {
        return jsonResponse({
          type: "disambiguation",
          title: "San Agustin",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/San_Agustin" } },
        });
      }
      return jsonResponse({ query: { pages: [{ title: "San Agustin" }] } });
    });

    const restOutcome = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/San_Agustin", {
      fetchImpl: restDisambigFetch,
      baseDelayMs: 0,
    });
    expect(restOutcome.ok).toBe(false);
    if (restOutcome.ok) throw new Error("Expected disambiguation rejection");
    expect(restOutcome.code).toBe("disambiguation");
    expect(restOutcome.disambiguationUrl).toBe("https://en.wikipedia.org/wiki/San_Agustin");

    const actionDisambigFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/api/rest_v1/page/summary/")) {
        return jsonResponse({ type: "standard", title: "Maynila" });
      }
      return jsonResponse({
        query: {
          pages: [{ title: "Maynila", pageprops: { disambiguation: "" } }],
        },
      });
    });

    const actionOutcome = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Maynila", {
      fetchImpl: actionDisambigFetch,
      baseDelayMs: 0,
    });
    expect(actionOutcome.ok).toBe(false);
    if (actionOutcome.ok) throw new Error("Expected action disambiguation rejection");
    expect(actionOutcome.code).toBe("disambiguation");
  });

  it("handles 404 not found, 429 retry recovery, and exhausted rate limits", async () => {
    const notFoundFetch = vi.fn<typeof fetch>(async () => jsonResponse({}, 404));
    const missingResult = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/No_Such_Page", {
      fetchImpl: notFoundFetch,
      baseDelayMs: 0,
      maxRetries: 0,
    });
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) {
      expect(missingResult.code).toBe("not_found");
    }

    let restAttempts = 0;
    const retryRecoveryFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/api/rest_v1/page/summary/")) {
        restAttempts += 1;
        if (restAttempts === 1) {
          return jsonResponse({}, 429, { "Retry-After": "0" });
        }
        return jsonResponse({
          type: "standard",
          title: "Vigan",
          extract: "Historic city in Ilocos Sur.",
        });
      }
      return jsonResponse({ query: { pages: [{ title: "Vigan" }] } });
    });

    const recovered = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Vigan", {
      fetchImpl: retryRecoveryFetch,
      baseDelayMs: 0,
      maxRetries: 2,
    });
    expect(recovered.ok).toBe(true);
    expect(restAttempts).toBe(2);

    const always429 = vi.fn<typeof fetch>(async () =>
      jsonResponse({}, 429, { "Retry-After": "0" }),
    );
    const rateLimited = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Vigan", {
      fetchImpl: always429,
      baseDelayMs: 0,
      maxRetries: 1,
    });
    expect(rateLimited.ok).toBe(false);
    if (!rateLimited.ok) {
      expect(rateLimited.code).toBe("rate_limited");
    }

    const blockedHost = await fetchWikiJsonWithRetry("https://evil.example.com/api", {
      fetchImpl: always429,
    });
    expect(blockedHost.ok).toBe(false);
    if (!blockedHost.ok) {
      expect(blockedHost.code).toBe("api_error");
    }
  });

  it("strips scripts, styles, and tags in sanitizePlainText", () => {
    const cleaned = sanitizePlainText(
      `<style>.x{color:red}</style><p>Hello <b>World</b> &amp; Co.&ndash;1898</p><script>evil()</script><br/>Line 2 &#x2014; end`,
    );
    expect(cleaned).toBe("Hello World & Co.–1898\n\nLine 2 — end");
  });
});

describe("fetchWikimediaImageMetadata and period classification", () => {
  it("extracts creator, license, licenseUrl, attributionText, photoYear and classifies media period", async () => {
    expect(classifyMediaPeriod(1960)).toBe("archival");
    expect(classifyMediaPeriod(1899)).toBe("archival");
    expect(classifyMediaPeriod(1961)).toBe("unknown");
    expect(classifyMediaPeriod(1989)).toBe("unknown");
    expect(classifyMediaPeriod(1990)).toBe("modern");
    expect(classifyMediaPeriod(2024)).toBe("modern");
    expect(classifyMediaPeriod(null)).toBe("unknown");
    expect(extractPhotoYear("c. 1905-06-12")).toBe(1905);
    expect(extractPhotoYear("undated")).toBeNull();

    const buildCommonsFetch = (dateValue: string) =>
      vi.fn<typeof fetch>(async () =>
        jsonResponse({
          query: {
            pages: [
              {
                title: "File:Sample.jpg",
                imageinfo: [
                  {
                    thumburl: "https://upload.wikimedia.org/thumb/Sample.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Sample.jpg",
                    extmetadata: {
                      Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Test">Juan Dela Cruz</a>' },
                      LicenseShortName: { value: "CC BY-SA 4.0" },
                      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                      Attribution: { value: "Juan Dela Cruz (CC BY-SA 4.0)" },
                      ImageDescription: { value: "<span>Archival gate view</span>" },
                      DateTimeOriginal: { value: dateValue },
                    },
                  },
                ],
              },
            ],
          },
        }),
      );

    const archival = await fetchWikimediaImageMetadata("File:Sample.jpg", {
      fetchImpl: buildCommonsFetch("1945-02-01"),
      baseDelayMs: 0,
    });
    expect(archival).toMatchObject({
      creator: "Juan Dela Cruz",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      attributionText: "Juan Dela Cruz (CC BY-SA 4.0)",
      photoYear: 1945,
      period: "archival",
      description: "Archival gate view",
    });

    const modern = await fetchWikimediaImageMetadata("Sample.jpg", {
      fetchImpl: buildCommonsFetch("2018-08-20"),
      baseDelayMs: 0,
    });
    expect(modern?.period).toBe("modern");
    expect(modern?.photoYear).toBe(2018);

    const midCentury = await fetchWikimediaImageMetadata("Sample.jpg", {
      fetchImpl: buildCommonsFetch("1975"),
      baseDelayMs: 0,
    });
    expect(midCentury?.period).toBe("unknown");

    const undated = await fetchWikimediaImageMetadata("Sample.jpg", {
      fetchImpl: buildCommonsFetch(""),
      baseDelayMs: 0,
    });
    expect(undated?.photoYear).toBeNull();
    expect(undated?.period).toBe("unknown");
  });

  it("falls back to source language Wikipedia if Commons reports missing file", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://commons.wikimedia.org/")) {
        return jsonResponse({ query: { pages: [{ missing: true }] } });
      }
      return jsonResponse({
        query: {
          pages: [
            {
              title: "File:Local.jpg",
              imageinfo: [
                {
                  url: "https://upload.wikimedia.org/wikipedia/en/Local.jpg",
                  extmetadata: {
                    Artist: { value: "Local Archive" },
                    LicenseShortName: { value: "Public domain" },
                    DateTimeOriginal: { value: "1995" },
                  },
                },
              ],
            },
          ],
        },
      });
    });

    const result = await fetchWikimediaImageMetadata("Local.jpg", {
      fetchImpl: fetchMock,
      fallbackLang: "en",
      baseDelayMs: 0,
    });
    expect(result?.imageUrl).toBe("https://upload.wikimedia.org/wikipedia/en/Local.jpg");
    expect(result?.period).toBe("modern");
    expect(result?.attributionText).toBe("Local Archive · Public domain");
  });
});

describe("duplicate detection, payload validation, and draft builder", () => {
  it("detects exact_slug, normalized_title, source_url, and location_similarity", () => {
    expect(normalizeComparisonTitle("Noli Me Tángere!")).toBe("noli me tangere");
    expect(normalizeComparableUrl("https://en.m.wikipedia.org/w/index.php?title=Intramuros#Wall")).toBe(
      "https://en.wikipedia.org/wiki/intramuros",
    );

    const existing: HistoricalEntry[] = [
      seedEntries[0],
      {
        ...seedEntries[0],
        id: "e-nearby",
        title: "Walls of Old Manila",
        slug: "walls-of-old-manila",
        origin: { latitude: 14.5945, longitude: 120.974 },
        originSource: null,
      },
    ];
    const existingSources: SourceRef[] = [
      {
        id: "s-1",
        entryId: seedEntries[0].id,
        title: "Intramuros Wikipedia",
        url: "https://en.wikipedia.org/wiki/Intramuros",
        publisher: "Wikipedia",
        accessedAt: "2026-01-01",
        sourceType: "encyclopedia",
      },
    ];

    const exactAndUrl = findDuplicateCandidates(
      makeDraft({
        title: "Intramuros!",
        slug: "intramuros",
        origin: { latitude: 14.5939, longitude: 120.9736 },
        originSource: "https://en.m.wikipedia.org/wiki/Intramuros",
        sources: [
          {
            title: "Intramuros (EN Wikipedia)",
            url: "https://en.wikipedia.org/wiki/Intramuros",
            publisher: "Wikipedia",
            sourceType: "encyclopedia",
            notes: null,
          },
        ],
      }),
      existing,
      existingSources,
    );

    expect(exactAndUrl[0].entry.id).toBe(seedEntries[0].id);
    expect(exactAndUrl[0].reasons).toEqual(
      expect.arrayContaining(["exact_slug", "normalized_title", "source_url", "location_similarity"]),
    );

    const nearbyOnly = findDuplicateCandidates(
      makeDraft({
        title: "Manila Bastion",
        slug: "manila-bastion",
        origin: { latitude: 14.5941, longitude: 120.9738 },
        originSource: "https://en.wikipedia.org/wiki/Manila_Bastion",
        sources: [
          {
            title: "Manila Bastion",
            url: "https://en.wikipedia.org/wiki/Manila_Bastion",
            publisher: "Wikipedia",
            sourceType: "encyclopedia",
            notes: null,
          },
        ],
      }),
      existing,
      existingSources,
    );
    expect(nearbyOnly.some((c) => c.entry.id === "e-nearby" && c.reasons.includes("location_similarity"))).toBe(
      true,
    );
  });

  it("validates import payloads and catches bad slugs, year order, place current location, and unsafe URLs", () => {
    expect(hasValidationErrors(validateImportPayload(makeDraft()))).toBe(false);

    const invalid = validateImportPayload(
      makeDraft({
        title: "   ",
        slug: "Bad_Slug!",
        summary: "",
        startYear: 1900,
        endYear: 1850,
        entryType: "place",
        current: { latitude: 14.5, longitude: 121.0 },
        currentPrecision: "exact",
        originSource: "javascript:alert(1)",
        media: [
          {
            imageUrl: "ftp://files.example.com/a.jpg",
            sourceUrl: "javascript:void(0)",
            caption: "Bad",
            period: "modern",
            photoYear: 9999,
            creator: null,
            license: null,
            licenseUrl: "data:text/html,hi",
            attributionText: null,
            comparisonGroup: null,
          },
        ],
        sources: [
          {
            title: "",
            url: "not-a-url",
            publisher: "Wikipedia",
            sourceType: "encyclopedia",
            notes: null,
          },
        ],
      }),
    );

    expect(invalid.title).toBeDefined();
    expect(invalid.slug).toBeDefined();
    expect(invalid.summary).toBeDefined();
    expect(invalid.endYear).toBeDefined();
    expect(invalid.current).toBeDefined();
    expect(invalid.originSource).toBeDefined();
    expect(invalid["media.0.imageUrl"]).toBeDefined();
    expect(invalid["media.0.sourceUrl"]).toBeDefined();
    expect(invalid["media.0.licenseUrl"]).toBeDefined();
    expect(invalid["media.0.photoYear"]).toBeDefined();
    expect(invalid["sources.0.title"]).toBeDefined();
    expect(invalid["sources.0.url"]).toBeDefined();
  });

  it("builds unreviewed draft payloads with inferred Philippine vs international scope", () => {
    expect(isPhilippineCoordinates({ latitude: 14.5939, longitude: 120.9736 })).toBe(true);
    expect(inferImportScope({ latitude: 51.5, longitude: -0.1 })).toBe("international");
    expect(inferImportScope(null)).toBe("international");

    const article: WikipediaFetchedArticle = {
      lang: "en",
      title: "Paoay",
      canonicalTitle: "Paoay Church",
      pageUrl: "https://en.wikipedia.org/wiki/Paoay_Church",
      redirectedFrom: "Paoay",
      summary: "Baroque church in Ilocos Norte.",
      description: "Historic church in the Philippines",
      extract: null,
      coordinates: { latitude: 18.0617, longitude: 120.5217 },
      pageImageTitle: "Paoay_Church.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
      wikidataId: "Q12345",
      accessedAt: "2026-11-25",
    };

    const draft = buildImportDraftPayload(article, null);
    expect(draft.scope).toBe("local");
    expect(draft.slug).toBe("paoay-church");
    expect(draft.reviewed).toBe(false);
    expect(draft.originPrecision).toBe("approximate");
    expect(draft.media).toHaveLength(1);
    expect(draft.media[0].imageUrl).toBe("https://upload.wikimedia.org/thumb.jpg");
    expect(draft.sources[0].notes).toContain('Redirected from "Paoay".');
  });
});

describe("localOverlay and entriesService curation actions", () => {
  it("saves imported entries, toggles review status, exports JSON, and resets overlay", async () => {
    resetOverlay();
    expect(getOverlayStats()).toEqual({
      importedEntries: 0,
      importedMedia: 0,
      importedSources: 0,
      reviewedOverrides: 0,
    });

    const draft = makeDraft();
    const created = await saveImportedEntry(draft);
    expect(created.id.startsWith("e-import-")).toBe(true);
    expect(created.reviewed).toBe(false);

    expect(getEntry(created.id)?.title).toBe(draft.title);
    expect(getMedia(created.id)).toHaveLength(1);
    expect(getSources(created.id)).toHaveLength(1);
    expect(getOverlayStats()).toEqual({
      importedEntries: 1,
      importedMedia: 1,
      importedSources: 1,
      reviewedOverrides: 1,
    });

    await expect(saveImportedEntry(draft)).rejects.toThrow(/already exists/i);

    await toggleEntryReviewed(created.id, true);
    expect(getEntry(created.id)?.reviewed).toBe(true);

    await toggleEntryReviewed("e-intramuros", true);
    expect(getEntry("e-intramuros")?.reviewed).toBe(true);

    const exported = JSON.parse(exportOverlayJson()) as {
      version: number;
      entries: HistoricalEntry[];
      reviewedOverrides: Record<string, boolean>;
    };
    expect(exported.version).toBe(1);
    expect(exported.entries).toHaveLength(1);
    expect(exported.reviewedOverrides[created.id]).toBe(true);
    expect(exported.reviewedOverrides["e-intramuros"]).toBe(true);

    resetOverlay();
    expect(getOverlayStats()).toEqual({
      importedEntries: 0,
      importedMedia: 0,
      importedSources: 0,
      reviewedOverrides: 0,
    });
    expect(getEntry(created.id)).toBeUndefined();
    expect(getEntry("e-intramuros")?.reviewed).toBe(false);
  });
});
