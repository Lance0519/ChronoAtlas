import { useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useAtlas } from "../src/app/hooks/useAtlas";
import { AtlasProvider } from "../src/app/providers/AtlasProvider";
import { ContextDrawer } from "../src/components/drawer/ContextDrawer";
import { PhotoGallery } from "../src/components/drawer/PhotoGallery";
import { WikiImportDialog } from "../src/components/importer/WikiImportDialog";
import { seedEntries, seedLinks, seedMedia, seedSources } from "../src/data/seed";
import type { ActiveEntryState } from "../src/hooks/useActiveEntry";
import { getComparisonPair } from "../src/lib/media";
import {
  ensureExtendedCorpusLoaded,
  getEntry,
  getProgress,
  resetOverlay,
  subscribeCorpusLoaded,
} from "../src/services/entriesService";
import type { HistoricalEntry, MediaItem } from "../src/types/atlas";

function DrawerTestHarness({
  initialEntryId,
  initialRole = "origin",
  activeEntryState,
}: {
  initialEntryId: string | null;
  initialRole?: "origin" | "current";
  activeEntryState?: ActiveEntryState;
}) {
  const { state, dispatch } = useAtlas();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return subscribeCorpusLoaded(() => setRevision((v) => v + 1));
  }, []);

  useEffect(() => {
    if (initialEntryId) {
      dispatch({ type: "selectEntry", id: initialEntryId, role: initialRole });
    }
  }, [dispatch, initialEntryId, initialRole]);

  return (
    <>
      <ContextDrawer activeEntryState={activeEntryState} corpusRevision={revision} />
      <div data-testid="active-state">{`${state.activeEntryId ?? "none"}:${state.activeLocationRole ?? "none"}`}</div>
    </>
  );
}

async function flushMicrotasks(rounds = 4): Promise<void> {
  await act(async () => {
    for (let i = 0; i < rounds; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("ContextDrawer", () => {
  beforeAll(async () => {
    await ensureExtendedCorpusLoaded();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetOverlay();
  });

  it("renders empty state when no entry is selected", async () => {
    render(
      <AtlasProvider>
        <ContextDrawer />
      </AtlasProvider>,
    );

    await flushMicrotasks();
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });

  it("displays relocated artifact Origin site & Current location and switches location role", async () => {
    const user = userEvent.setup();
    render(
      <AtlasProvider>
        <DrawerTestHarness initialEntryId="e-spoliarium" />
      </AtlasProvider>,
    );

    await flushMicrotasks(8);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Spoliarium" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /National Museum of Fine Arts/ })).toBeTruthy();
    });
    expect(screen.getByText("Origin site")).toBeTruthy();
    expect(screen.getByText("Current location")).toBeTruthy();
    expect(screen.getByText("Context · origin")).toBeTruthy();

    const goToCurrent = screen.getByRole("button", { name: "Go to current location" });
    const goToOrigin = screen.getByRole("button", { name: "Go to origin" });
    expect(goToOrigin.getAttribute("aria-pressed")).toBe("true");

    await user.click(goToCurrent);
    expect(screen.getByText("Context · current location")).toBeTruthy();
    expect(goToCurrent.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("active-state").textContent).toBe("e-spoliarium:current");
  });

  it("supports PhotoGallery keyboard navigation, PhotoCompare slider, Centre reset, and attribution display", async () => {
    const user = userEvent.setup();
    const galleryMedia: MediaItem[] = [
      {
        id: "m-archival",
        entryId: "e-intramuros",
        imageUrl: "https://example.org/archival.jpg",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Archival.jpg",
        caption: "Gate in 1899",
        period: "archival",
        photoYear: 1899,
        creator: "Archive Photographer",
        license: "Public domain",
        licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
        attributionText: "Library Archive · Public domain",
        comparisonGroup: "gate-pair",
      },
      {
        id: "m-modern",
        entryId: "e-intramuros",
        imageUrl: "https://example.org/modern.jpg",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Modern.jpg",
        caption: "Gate in 2023",
        period: "modern",
        photoYear: 2023,
        creator: "Modern Photographer",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        attributionText: "Modern Photographer · CC BY-SA 4.0",
        comparisonGroup: "gate-pair",
      },
    ];

    render(
      <PhotoGallery
        entryId="e-intramuros"
        media={galleryMedia}
        pair={getComparisonPair(galleryMedia)}
      />,
    );

    expect(screen.getByText("Gate in 1899")).toBeTruthy();
    expect(screen.getByText("Attribution: Library Archive · Public domain")).toBeTruthy();

    const thumb1 = screen.getByRole("button", { name: /Show image 1: Gate in 1899/ });
    const thumb2 = screen.getByRole("button", { name: /Show image 2: Gate in 2023/ });
    thumb1.focus();
    fireEvent.keyDown(thumb1, { key: "ArrowRight" });
    expect(document.activeElement).toBe(thumb2);
    expect(screen.getByText("Gate in 2023")).toBeTruthy();

    fireEvent.keyDown(thumb2, { key: "Home" });
    expect(document.activeElement).toBe(thumb1);
    expect(screen.getByText("Gate in 1899")).toBeTruthy();

    fireEvent.keyDown(thumb1, { key: "End" });
    expect(document.activeElement).toBe(thumb2);
    expect(screen.getByText("Gate in 2023")).toBeTruthy();

    fireEvent.keyDown(thumb2, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(thumb1);

    await user.click(screen.getByRole("button", { name: "Compare" }));
    const slider = screen.getByRole("slider", { name: "Comparison divider position" });
    expect(slider.getAttribute("aria-valuetext")).toBe("50% archival, 50% modern");
    expect(screen.getByText("Library Archive · Public domain")).toBeTruthy();
    expect(screen.getByText("Modern Photographer · CC BY-SA 4.0")).toBeTruthy();

    fireEvent.change(slider, { target: { value: "24" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("24% archival, 76% modern");

    await user.click(screen.getByRole("button", { name: /Centre/i }));
    expect(slider.getAttribute("aria-valuetext")).toBe("50% archival, 50% modern");
  });

  it("toggles Draft unreviewed -> Mark as reviewed and persists in local overlay", async () => {
    const user = userEvent.setup();
    render(
      <AtlasProvider>
        <DrawerTestHarness initialEntryId="e-intramuros" />
      </AtlasProvider>,
    );

    await flushMicrotasks(8);
    await waitFor(() => {
      expect(screen.getByText("Draft · unreviewed")).toBeTruthy();
    });
    const markBtn = screen.getByRole("button", { name: "Mark as reviewed" });
    await user.click(markBtn);

    await waitFor(() => {
      expect(screen.getByText("Curated · reviewed")).toBeTruthy();
    });
    await flushMicrotasks();
    expect(getEntry("e-intramuros")?.reviewed).toBe(true);
    expect(screen.getByRole("button", { name: "Mark as draft" })).toBeTruthy();
  });

  it("navigates to linked entries when a relationship is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AtlasProvider>
        <DrawerTestHarness initialEntryId="e-spoliarium" />
      </AtlasProvider>,
    );

    await flushMicrotasks(8);
    const relBtn = await screen.findByRole("button", { name: /National Museum of Fine Arts/ });
    await user.click(relBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "National Museum of Fine Arts" })).toBeTruthy();
      expect(screen.getByTestId("active-state").textContent).toBe("e-national-museum:origin");
    });
    await flushMicrotasks();
  });

  it("debounces notes autosave at 600ms, shows Saved locally, and saves visited toggle", async () => {
    vi.useFakeTimers();

    const customEntry: HistoricalEntry = {
      ...seedEntries[0],
      id: "e-progress-isolated",
      title: "Progress Test Site",
      slug: "progress-test-site",
    };

    render(
      <AtlasProvider>
        <DrawerTestHarness
          initialEntryId={customEntry.id}
          activeEntryState={{
            entry: customEntry,
            media: seedMedia.filter((m) => m.entryId === "e-intramuros"),
            sources: seedSources.filter((s) => s.entryId === "e-intramuros"),
            links: seedLinks.slice(0, 1).map((l) => ({ ...l, direction: "in" })),
            loading: false,
            error: null,
            retry: () => {},
          }}
        />
      </AtlasProvider>,
    );

    await flushMicrotasks(8);

    const visitedCheckbox = screen.getByRole("checkbox", { name: "Marked as visited" });
    fireEvent.click(visitedCheckbox);
    await flushMicrotasks();
    expect(getProgress(customEntry.id).visited).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Saved locally");

    const notesBox = screen.getByLabelText("Notes");
    fireEvent.change(notesBox, { target: { value: "Measured bastion stone courses." } });

    expect(screen.getByRole("status").textContent).toBe("Unsaved edits (autosaving…)");
    expect(getProgress(customEntry.id).notes).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(599);
      await Promise.resolve();
    });
    expect(getProgress(customEntry.id).notes).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getProgress(customEntry.id)).toEqual({
      visited: true,
      notes: "Measured bastion stone courses.",
    });
    expect(screen.getByRole("status").textContent).toBe("Saved locally");
  });
});

describe("WikiImportDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetOverlay();
  });

  it("rejects invalid URLs without calling fetch", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<WikiImportDialog open={true} onClose={() => {}} onImported={() => {}} />);

    await act(async () => {
      await Promise.resolve();
    });

    const input = screen.getByLabelText("Wikipedia article URL");
    fireEvent.change(input, { target: { value: "https://example.com/wiki/Intramuros" } });
    await user.click(screen.getByRole("button", { name: "Fetch article" }));

    expect(screen.getByRole("alert").textContent).toContain("*.wikipedia.org");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches mocked Wikipedia + Commons metadata, flags duplicates, and saves to local overlay", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("en.wikipedia.org/api/rest_v1/page/summary/")) {
        return new Response(
          JSON.stringify({
            type: "standard",
            title: "Intramuros",
            description: "Historic walled district in Manila",
            extract: "Intramuros is the historic walled core of Manila.",
            wikibase_item: "Q1434624",
            coordinates: { lat: 14.5939, lon: 120.9736 },
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Intramuros" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("en.wikipedia.org/w/api.php")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: [
                {
                  title: "Intramuros",
                  fullurl: "https://en.wikipedia.org/wiki/Intramuros",
                  pageimage: "Intramuros_Test.jpg",
                  coordinates: [{ lat: 14.5939, lon: 120.9736 }],
                  pageprops: { wikibase_item: "Q1434624" },
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          query: {
            pages: [
              {
                title: "File:Intramuros_Test.jpg",
                imageinfo: [
                  {
                    thumburl: "https://upload.wikimedia.org/Intramuros_Test.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Intramuros_Test.jpg",
                    extmetadata: {
                      Artist: { value: "Test Author" },
                      LicenseShortName: { value: "CC BY-SA 4.0" },
                      DateTimeOriginal: { value: "2020-04-12" },
                    },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WikiImportDialog open={true} onClose={() => {}} onImported={onImported} />);

    const urlInput = screen.getByLabelText("Wikipedia article URL");
    fireEvent.change(urlInput, { target: { value: "https://en.wikipedia.org/wiki/Intramuros" } });
    await user.click(screen.getByRole("button", { name: "Fetch article" }));

    const dupAlert = await screen.findByRole("alert");
    expect(dupAlert.textContent).toContain("Possible duplicate");
    expect(dupAlert.textContent).toContain("Exact slug match");

    const saveBtn = screen.getByRole("button", { name: "Save Record" });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    const slugInput = screen.getByLabelText("Slug *");
    fireEvent.change(slugInput, { target: { value: "intramuros-mocked-import" } });

    const ackCheckbox = screen.getByRole("checkbox", {
      name: /confirm this is a distinct record/i,
    });
    await user.click(ackCheckbox);

    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    await user.click(saveBtn);

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });
    const created = onImported.mock.calls[0][0] as HistoricalEntry;
    expect(created.slug).toBe("intramuros-mocked-import");
    expect(created.reviewed).toBe(false);
    expect(getEntry(created.id)?.title).toBe("Intramuros");
  });
});
