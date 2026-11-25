import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BookMarked, List, Map as MapIcon } from "lucide-react";
import { useAtlas } from "../../app/hooks/useAtlas";

type MobilePane = "feed" | "map" | "drawer";

export function ThreePaneLayout({
  feed,
  map,
  drawer,
  headerActions,
}: {
  feed: ReactNode;
  map: ReactNode;
  drawer: ReactNode;
  headerActions?: ReactNode;
}) {
  const { state, dispatch } = useAtlas();
  const [mobilePane, setMobilePane] = useState<MobilePane>("map");
  const { activeEntryId, isContextDrawerOpen } = state;

  useEffect(() => {
    if (activeEntryId && isContextDrawerOpen) setMobilePane("drawer");
    if (!isContextDrawerOpen) {
      setMobilePane((current) => (current === "drawer" ? "map" : current));
    }
  }, [activeEntryId, isContextDrawerOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-sheet focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header
        data-tour="header"
        className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[22px] leading-none tracking-tight">ChronoAtlas</h1>
          <span className="hidden text-[11px] uppercase tracking-[0.14em] text-muted lg:inline">
            A geographical record of the past
          </span>
        </div>

        {headerActions ?? (
          <p className="flex items-center gap-2 text-[11px] text-muted">
            <span className="size-1.5 bg-ochre" aria-hidden="true" />
            Local corpus · drafts
          </p>
        )}
      </header>

      <main id="main" className="relative min-h-0 flex-1 scroll-mt-4">
        <div className="grid h-full grid-cols-1 grid-rows-1 overflow-hidden md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_420px]">
          <div
            className={`${mobilePane === "feed" ? "flex" : "hidden"} min-h-0 pb-[calc(3rem+env(safe-area-inset-bottom))] md:flex md:pb-0`}
          >
            {feed}
          </div>
          <div
            className={`${mobilePane === "map" ? "block" : "hidden"} min-h-0 pb-[calc(3rem+env(safe-area-inset-bottom))] md:block md:pb-0`}
          >
            {map}
          </div>
          {isContextDrawerOpen && (
            <div className="absolute inset-y-0 right-0 z-20 w-full max-w-[440px] border-l border-rule bg-sheet pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-0 xl:static xl:z-auto xl:w-auto xl:max-w-none">
              {drawer}
            </div>
          )}
        </div>

        <nav
          aria-label="Panes"
          data-tour="panes"
          className="absolute inset-x-0 bottom-0 z-30 flex border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <TabButton
            active={mobilePane === "feed"}
            onClick={() => {
              dispatch({ type: "closeDrawer" });
              setMobilePane("feed");
            }}
            icon={<List aria-hidden="true" size={15} strokeWidth={1.5} />}
            label="Records"
          />
          <TabButton
            active={mobilePane === "map"}
            onClick={() => {
              dispatch({ type: "closeDrawer" });
              setMobilePane("map");
            }}
            icon={<MapIcon aria-hidden="true" size={15} strokeWidth={1.5} />}
            label="Map"
          />
          <TabButton
            active={mobilePane === "drawer"}
            onClick={() => {
              dispatch({ type: "openDrawer" });
              setMobilePane("drawer");
            }}
            icon={<BookMarked aria-hidden="true" size={15} strokeWidth={1.5} />}
            label="Context"
          />
        </nav>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 text-xs ${active ? "border-ochre text-ink" : "border-transparent text-muted"}`}
    >
      {icon}
      {label}
    </button>
  );
}
