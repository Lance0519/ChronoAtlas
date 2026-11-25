import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAtlas } from "../src/app/hooks/useAtlas";
import { AtlasProvider } from "../src/app/providers/AtlasProvider";
import { DiscoveryFeed } from "../src/components/feed/DiscoveryFeed";
import { seedEntries } from "../src/data/seed";

function SelectionProbe() {
  const { state } = useAtlas();
  return (
    <output data-testid="selection">{`${state.activeEntryId} ${state.activeLocationRole}`}</output>
  );
}

function FilterProbe() {
  const { state } = useAtlas();
  return <output data-testid="filters">{JSON.stringify(state.filters)}</output>;
}

describe("DiscoveryFeed", () => {
  it("sets the canonical selection on card click without owning selection state", async () => {
    const user = userEvent.setup();
    render(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[seedEntries[0]]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
        />
        <SelectionProbe />
      </AtlasProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Intramuros/ }));
    expect(screen.getByTestId("selection").textContent).toBe("e-intramuros origin");
  });

  it("shows an honest empty state", () => {
    render(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
        />
      </AtlasProvider>,
    );
    expect(screen.getByText("No records in this view")).toBeTruthy();
  });

  it("applies Era presets and resets filters cleanly via Reset filters", async () => {
    const user = userEvent.setup();
    render(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[seedEntries[0]]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
        />
        <FilterProbe />
      </AtlasProvider>,
    );

    expect(screen.queryByRole("button", { name: /Reset filters/i })).toBeNull();

    const colonialBtn = screen.getByRole("button", { name: "1521–1898" });
    await user.click(colonialBtn);
    expect(colonialBtn.getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(screen.getByTestId("filters").textContent ?? "{}")).toMatchObject({
      minYear: 1521,
      maxYear: 1898,
    });

    const ancientBtn = screen.getByRole("button", { name: "Ancient (≤500)" });
    await user.click(ancientBtn);
    expect(ancientBtn.getAttribute("aria-pressed")).toBe("true");
    expect(colonialBtn.getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(screen.getByTestId("filters").textContent ?? "{}")).toMatchObject({
      minYear: null,
      maxYear: 500,
    });

    const resetBtn = screen.getByRole("button", { name: /Reset filters/i });
    await user.click(resetBtn);
    expect(JSON.parse(screen.getByTestId("filters").textContent ?? "{}")).toMatchObject({
      query: "",
      scope: "all",
      entryType: "all",
      minYear: null,
      maxYear: null,
      searchThisArea: true,
    });
    expect(screen.queryByRole("button", { name: /Reset filters/i })).toBeNull();
  });

  it("renders the No map pin badge only for unlocated entries", () => {
    const located = seedEntries[0];
    const unlocated = {
      ...seedEntries[0],
      id: "e-unlocated-test",
      title: "Unlocated Archive Record",
      origin: null,
    };

    render(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[located, unlocated]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
        />
      </AtlasProvider>,
    );

    const badges = screen.getAllByText("No map pin");
    expect(badges).toHaveLength(1);
    const unlocatedBtn = screen.getByRole("button", { name: /Unlocated Archive Record/ });
    expect(unlocatedBtn.textContent).toContain("No map pin");
  });

  it("renders Load more records pagination button, loading state, and result cap notice", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    const { rerender } = render(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[seedEntries[0], seedEntries[1]]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
          totalMatched={12}
          hasMore={true}
          loadingMore={false}
          onLoadMore={onLoadMore}
          resultCap={5}
        />
      </AtlasProvider>,
    );

    expect(screen.getByText("2 of 12 shown")).toBeTruthy();
    const loadMoreBtn = screen.getByRole("button", { name: "Load more records" });
    await user.click(loadMoreBtn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[seedEntries[0], seedEntries[1]]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
          totalMatched={12}
          hasMore={true}
          loadingMore={true}
          onLoadMore={onLoadMore}
          resultCap={5}
        />
      </AtlasProvider>,
    );

    const busyBtn = screen.getByRole("button", { name: "Loading more records…" });
    expect((busyBtn as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <AtlasProvider>
        <DiscoveryFeed
          entries={seedEntries.slice(0, 5)}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
          totalMatched={12}
          hasMore={true}
          loadingMore={false}
          onLoadMore={onLoadMore}
          resultCap={5}
        />
      </AtlasProvider>,
    );

    expect(screen.queryByRole("button", { name: /Load more/i })).toBeNull();
    expect(screen.getByText(/Display capped at 5 results/i)).toBeTruthy();
  });

  it("invokes onOpenImporter when the Import button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenImporter = vi.fn();

    render(
      <AtlasProvider>
        <DiscoveryFeed
          entries={[seedEntries[0]]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onClearArea={() => {}}
          onOpenImporter={onOpenImporter}
        />
      </AtlasProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(onOpenImporter).toHaveBeenCalledTimes(1);
  });
});
