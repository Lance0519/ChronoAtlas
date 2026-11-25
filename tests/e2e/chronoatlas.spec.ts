import { expect, test, type Page } from "@playwright/test";

const MINIMAL_STYLE_JSON = JSON.stringify({
  version: 8,
  name: "ChronoAtlas E2E Empty Style",
  sources: {},
  layers: [],
});

const STUB_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90">
  <rect width="120" height="90" fill="#e5e0d4"/>
  <rect x="6" y="6" width="108" height="78" fill="none" stroke="#9a5b24" stroke-width="1"/>
  <text x="60" y="49" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#55524a">Archive Media</text>
</svg>`;

const WIKI_TEST_URL = "https://en.wikipedia.org/wiki/Pasig_River_Heritage_Test";

async function installOfflineMocks(page: Page) {
  await page.route("https://tiles.openfreemap.org/styles/liberty", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: MINIMAL_STYLE_JSON,
    });
  });

  await page.route("https://tiles.openfreemap.org/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/styles/liberty")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: MINIMAL_STYLE_JSON,
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "" });
  });

  await page.route("https://fonts.googleapis.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });

  await page.route("https://fonts.gstatic.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "font/woff2", body: "" });
  });

  await page.route("https://thumb.wikimedia.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: STUB_IMAGE_SVG,
    });
  });

  await page.route("https://upload.wikimedia.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: STUB_IMAGE_SVG,
    });
  });

  await page.route("https://en.wikipedia.org/api/rest_v1/page/summary/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "standard",
        title: "Pasig River Heritage Test",
        description: "Historic river corridor in Metro Manila",
        extract:
          "Pasig River Heritage Test is a synthetic historical record used to verify Wikipedia import in ChronoAtlas.",
        wikibase_item: "Q99999999",
        coordinates: { lat: 14.5764, lon: 121.0851 },
        thumbnail: {
          source: "https://upload.wikimedia.org/wikipedia/commons/pasig-test-thumb.jpg",
        },
        content_urls: {
          desktop: { page: WIKI_TEST_URL },
        },
      }),
    });
  });

  await page.route("https://en.wikipedia.org/w/api.php**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: {
          pages: [
            {
              title: "Pasig River Heritage Test",
              fullurl: WIKI_TEST_URL,
              pageimage: "Pasig_River_Heritage_Test.jpg",
              thumbnail: {
                source: "https://upload.wikimedia.org/wikipedia/commons/pasig-test-thumb.jpg",
              },
              coordinates: [{ lat: 14.5764, lon: 121.0851 }],
              pageprops: { wikibase_item: "Q99999999" },
            },
          ],
        },
      }),
    });
  });

  await page.route("https://commons.wikimedia.org/w/api.php**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: {
          pages: [
            {
              title: "File:Pasig_River_Heritage_Test.jpg",
              imageinfo: [
                {
                  thumburl: "https://upload.wikimedia.org/wikipedia/commons/pasig-test-commons.jpg",
                  descriptionurl:
                    "https://commons.wikimedia.org/wiki/File:Pasig_River_Heritage_Test.jpg",
                  extmetadata: {
                    Artist: { value: "ChronoAtlas Field Photographer" },
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                    LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                    Attribution: { value: "ChronoAtlas Field Photographer · CC BY-SA 4.0" },
                    ImageDescription: { value: "Pasig River stone embankment test image" },
                    DateTimeOriginal: { value: "2021-05-10" },
                  },
                },
              ],
            },
          ],
        },
      }),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
}

test.describe("ChronoAtlas critical user journeys", () => {
  test("desktop load, filter/search, Then-vs-Now compare, relocated artifacts, relationships, notes reload persistence, and Wikipedia importer", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await installOfflineMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "ChronoAtlas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
    await expect(page.locator('section[aria-label="Map canvas"] canvas.maplibregl-canvas')).toBeVisible();
    await expect(page.getByText("Loading basemap…")).toHaveCount(0);
    await expect(page.locator('button[data-entry-id]').first()).toBeVisible();
    await expect(page.locator('section[aria-label="Context drawer"]')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // 1. Search & filter composition + card->drawer sync + Then-vs-Now comparison slider
    const areaCheckbox = page.getByLabel("Search this map area");
    await areaCheckbox.uncheck();

    const searchInput = page.locator("#feed-search");
    await searchInput.fill("Intramuros");

    const intramurosCard = page.locator('button[data-entry-id="e-intramuros"]');
    await expect(intramurosCard).toBeVisible();
    await intramurosCard.click();

    const drawer = page.locator('section[aria-label="Context drawer"]');
    await expect(drawer.getByRole("heading", { name: "Intramuros" })).toBeVisible();

    await drawer.getByRole("button", { name: "Compare" }).click();
    const compareSlider = drawer.locator("#compare-position");
    await expect(compareSlider).toBeVisible();
    await expect(compareSlider).toHaveAttribute("aria-valuetext", "50% archival, 50% modern");

    await compareSlider.fill("20");
    await expect(compareSlider).toHaveAttribute("aria-valuetext", "20% archival, 80% modern");

    await drawer.getByRole("button", { name: /Centre/i }).click();
    await expect(compareSlider).toHaveAttribute("aria-valuetext", "50% archival, 50% modern");

    // 2. Relocated artifact tracking (Origin site <-> Current location)
    await searchInput.fill("Spoliarium");
    const spoliariumCard = page.locator('button[data-entry-id="e-spoliarium"]');
    await expect(spoliariumCard).toBeVisible();
    await spoliariumCard.click();

    await expect(drawer.getByRole("heading", { name: "Spoliarium" })).toBeVisible();
    await expect(drawer.getByText("Origin site", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Current location", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Context · origin", { exact: true })).toBeVisible();

    const goCurrentBtn = drawer.getByRole("button", { name: "Go to current location" });
    await goCurrentBtn.click();
    await expect(drawer.getByText("Context · current location", { exact: true })).toBeVisible();
    await expect(goCurrentBtn).toHaveAttribute("aria-pressed", "true");

    // 3. Relationship navigation
    await drawer.getByRole("button", { name: /National Museum of Fine Arts/ }).click();
    await expect(drawer.getByRole("heading", { name: "National Museum of Fine Arts" })).toBeVisible();
    await expect(drawer.getByText("Context · origin", { exact: true })).toBeVisible();

    // 4. Private progress persistence (visited + 600ms debounced notes) across reload
    const visitedCheckbox = drawer.getByLabel("Marked as visited");
    await visitedCheckbox.check();

    const notesInput = drawer.locator("#personal-notes");
    await notesInput.fill("Observed neoclassical facade and main gallery.");
    await expect(drawer.getByText("Saved locally")).toBeVisible();

    await page.reload();
    await expect(page.locator('button[data-entry-id]').first()).toBeVisible();

    await page.getByLabel("Search this map area").uncheck();
    await page.locator("#feed-search").fill("National Museum of Fine Arts");
    const museumCardAfterReload = page.locator('button[data-entry-id="e-national-museum"]');
    await expect(museumCardAfterReload).toBeVisible();
    await museumCardAfterReload.click();

    await expect(drawer.getByRole("heading", { name: "National Museum of Fine Arts" })).toBeVisible();
    await expect(drawer.getByLabel("Marked as visited")).toBeChecked();
    await expect(drawer.locator("#personal-notes")).toHaveValue(
      "Observed neoclassical facade and main gallery.",
    );

    // 5. Wikipedia Importer & Local Overlay flow
    await page.getByRole("button", { name: "Import Wikipedia" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import from Wikipedia" });
    await expect(importDialog).toBeVisible();

    await importDialog.locator("#wiki-url-input").fill(WIKI_TEST_URL);
    await importDialog.getByRole("button", { name: "Fetch article" }).click();

    await expect(importDialog.locator("#import-title")).toHaveValue("Pasig River Heritage Test");
    await importDialog.locator("#import-era").fill("Postwar heritage");
    await importDialog.locator("#import-location-name").fill("Pasig, Metro Manila");
    await importDialog.getByRole("button", { name: "Save Record" }).click();

    await expect(importDialog).toHaveCount(0);
    await expect(drawer.getByRole("heading", { name: "Pasig River Heritage Test" })).toBeVisible();
    await expect(drawer.getByText("Postwar heritage")).toBeVisible();
    await expect(drawer.getByText("Draft · unreviewed")).toBeVisible();

    await page.getByRole("button", { name: /Local archive/i }).click();
    const archiveDialog = page.getByRole("dialog", { name: "Local Curator Overlay" });
    await expect(archiveDialog).toBeVisible();
    await expect(archiveDialog.locator("dl")).toContainText("Imported entries1");
    await expect(archiveDialog.locator("dl")).toContainText("Imported media1");
    await expect(archiveDialog.locator("dl")).toContainText("Imported sources1");
    await archiveDialog.getByRole("button", { name: "Close workspace dialog" }).click();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("tablet (800px) and mobile (375px) responsive layouts with zero console errors and zero overflow", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await installOfflineMocks(page);

    // Tablet layout (800x746): feed + map side by side, no mobile tab bar, no overflow
    await page.setViewportSize({ width: 800, height: 746 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
    await expect(page.locator('section[aria-label="Map canvas"] canvas.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('nav[aria-label="Panes"]')).toBeHidden();
    await expect(page.locator('button[data-entry-id]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.locator('button[data-entry-id]').first().click();
    const drawer = page.locator('section[aria-label="Context drawer"]');
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await drawer.getByRole("button", { name: "Close context drawer" }).click();

    // Mobile layout (375x746): bottom tab bar switches Records, Map, and Context with zero overflow
    await page.setViewportSize({ width: 375, height: 746 });
    const mobileTabs = page.locator('nav[aria-label="Panes"]');
    await expect(mobileTabs).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await mobileTabs.getByRole("button", { name: "Records" }).click();
    await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
    await expect(page.locator('section[aria-label="Map canvas"]')).toBeHidden();
    await page.getByLabel("Search this map area").uncheck();
    await expectNoHorizontalOverflow(page);

    await page.locator('button[data-entry-id]').first().click();
    await expect(drawer).toBeVisible();
    await expect(mobileTabs.getByRole("button", { name: "Context" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expectNoHorizontalOverflow(page);

    await mobileTabs.getByRole("button", { name: "Map" }).click();
    await expect(page.locator('section[aria-label="Map canvas"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
