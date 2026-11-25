import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Compass, Globe, LocateFixed, Minus, Plus } from "lucide-react";
import { useAtlas } from "../../app/hooks/useAtlas";
import { getEntry, getLinks } from "../../services/entriesService";
import type { DirectedEntryLink, HistoricalEntry, ViewportBounds } from "../../types/atlas";
import {
  buildActiveFeature,
  buildArcCollection,
  buildArtifactTransferCollection,
  buildCurrentCollection,
  buildOriginCollection,
} from "./mapFeatures";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

const PHILIPPINES_CENTER: [number, number] = [121, 14];
const PHILIPPINES_ZOOM = 5.2;
const WORLD_CENTER: [number, number] = [20, 15];
const WORLD_ZOOM = 1.5;

interface AtlasMapProps {
  entries: HistoricalEntry[];
  bounds: ViewportBounds | null;
  onBoundsChange: (bounds: ViewportBounds) => void;
  activeEntry?: HistoricalEntry;
  activeLinks?: DirectedEntryLink[];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
  );
}

function buildPopupElement(props: Record<string, unknown>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "max-w-[240px]";

  const titleEl = document.createElement("p");
  titleEl.className = "font-display text-[15px] leading-snug text-ink";
  titleEl.textContent = typeof props.title === "string" ? props.title : "Historical record";
  wrapper.appendChild(titleEl);

  const metaEl = document.createElement("p");
  metaEl.className = "mt-0.5 text-[11px] text-muted";
  const typeLabel = props.entryType === "artifact" ? "Artifact" : "Place";
  const roleLabel = props.locationRole === "current" ? "Current location" : "Origin";
  metaEl.textContent = `${typeLabel} · ${roleLabel}`;
  wrapper.appendChild(metaEl);

  if (typeof props.dateLabel === "string" && props.dateLabel) {
    const dateEl = document.createElement("p");
    dateEl.className = "mt-0.5 tabular text-[11px] text-muted";
    dateEl.textContent = props.dateLabel;
    wrapper.appendChild(dateEl);
  }

  return wrapper;
}

export function AtlasMap({
  entries,
  bounds,
  onBoundsChange,
  activeEntry,
  activeLinks,
}: AtlasMapProps) {
  const { state, dispatch } = useAtlas();
  const { activeEntryId, activeLocationRole } = state;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onBoundsRef = useRef(onBoundsChange);
  const dispatchRef = useRef(dispatch);
  const resolvedActiveRef = useRef<HistoricalEntry | undefined>(undefined);

  const latestCollectionsRef = useRef<{
    origins: Parameters<maplibregl.GeoJSONSource["setData"]>[0];
    currents: Parameters<maplibregl.GeoJSONSource["setData"]>[0];
    transfers: Parameters<maplibregl.GeoJSONSource["setData"]>[0];
    active: Parameters<maplibregl.GeoJSONSource["setData"]>[0];
    arcs: Parameters<maplibregl.GeoJSONSource["setData"]>[0];
  }>({
    origins: EMPTY,
    currents: EMPTY,
    transfers: EMPTY,
    active: EMPTY,
    arcs: EMPTY,
  });

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  onBoundsRef.current = onBoundsChange;
  dispatchRef.current = dispatch;

  const resolvedActive = activeEntry ?? (activeEntryId ? getEntry(activeEntryId) : undefined);
  const resolvedLinks = useMemo(
    () => activeLinks ?? (resolvedActive ? getLinks(resolvedActive.id) : []),
    [activeLinks, resolvedActive],
  );
  resolvedActiveRef.current = resolvedActive;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: PHILIPPINES_CENTER,
      zoom: 2.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });

    const syncAllSources = () => {
      const latest = latestCollectionsRef.current;
      (map.getSource("entries-source") as maplibregl.GeoJSONSource | undefined)?.setData(
        latest.origins,
      );
      (map.getSource("current-locations-source") as maplibregl.GeoJSONSource | undefined)?.setData(
        latest.currents,
      );
      (map.getSource("artifact-transfer-source") as maplibregl.GeoJSONSource | undefined)?.setData(
        latest.transfers,
      );
      (map.getSource("active-entry-source") as maplibregl.GeoJSONSource | undefined)?.setData(
        latest.active,
      );
      (map.getSource("historical-arcs-source") as maplibregl.GeoJSONSource | undefined)?.setData(
        latest.arcs,
      );
    };

    const addLayers = () => {
      if (!map.isStyleLoaded()) return;

      if (!map.getSource("entries-source")) {
        map.addSource("entries-source", {
          type: "geojson",
          data: EMPTY,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 45,
        });
      }
      if (!map.getSource("current-locations-source")) {
        map.addSource("current-locations-source", { type: "geojson", data: EMPTY });
      }
      if (!map.getSource("artifact-transfer-source")) {
        map.addSource("artifact-transfer-source", { type: "geojson", data: EMPTY });
      }
      if (!map.getSource("historical-arcs-source")) {
        map.addSource("historical-arcs-source", { type: "geojson", data: EMPTY });
      }
      if (!map.getSource("active-entry-source")) {
        map.addSource("active-entry-source", { type: "geojson", data: EMPTY });
      }

      if (!map.getLayer("artifact-transfer-lines")) {
        map.addLayer({
          id: "artifact-transfer-lines",
          type: "line",
          source: "artifact-transfer-source",
          paint: {
            "line-color": "#35566b",
            "line-width": ["case", ["boolean", ["get", "isActive"], false], 2.2, 1.3],
            "line-dasharray": [4, 3],
            "line-opacity": ["case", ["boolean", ["get", "isActive"], false], 0.95, 0.45],
          },
        });
      }

      if (!map.getLayer("historical-arcs-solid")) {
        map.addLayer({
          id: "historical-arcs-solid",
          type: "line",
          source: "historical-arcs-source",
          filter: [
            "in",
            ["get", "relationshipType"],
            ["literal", ["historical_influence", "successor", "predecessor"]],
          ],
          paint: {
            "line-color": "#9a5b24",
            "line-width": 2,
            "line-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer("historical-arcs-dashed")) {
        map.addLayer({
          id: "historical-arcs-dashed",
          type: "line",
          source: "historical-arcs-source",
          filter: [
            "!",
            [
              "in",
              ["get", "relationshipType"],
              ["literal", ["historical_influence", "successor", "predecessor"]],
            ],
          ],
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "relationshipType"], "artifact_relocation"],
              "#35566b",
              "#9a5b24",
            ],
            "line-width": 1.8,
            "line-dasharray": [3, 2],
            "line-opacity": 0.88,
          },
        });
      }

      if (!map.getLayer("entries-clusters")) {
        map.addLayer({
          id: "entries-clusters",
          type: "circle",
          source: "entries-source",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#9a5b24",
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 40, 22],
            "circle-opacity": 0.92,
            "circle-stroke-color": "#fbf9f3",
            "circle-stroke-width": 1.5,
          },
        });
      }

      if (!map.getLayer("entries-cluster-count")) {
        map.addLayer({
          id: "entries-cluster-count",
          type: "symbol",
          source: "entries-source",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
          },
          paint: { "text-color": "#fbf9f3" },
        });
      }

      if (!map.getLayer("entries-unclustered")) {
        map.addLayer({
          id: "entries-unclustered",
          type: "circle",
          source: "entries-source",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "case",
              ["==", ["get", "entryType"], "artifact"],
              "rgba(251,249,243,0.9)",
              "#1d1c19",
            ],
            "circle-stroke-color": "#1d1c19",
            "circle-stroke-width": ["case", ["==", ["get", "entryType"], "artifact"], 2.2, 1.2],
          },
        });
      }

      if (!map.getLayer("current-circles-ring")) {
        map.addLayer({
          id: "current-circles-ring",
          type: "circle",
          source: "current-locations-source",
          paint: {
            "circle-radius": 9.5,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#35566b",
            "circle-stroke-width": 1.5,
          },
        });
      }

      if (!map.getLayer("current-circles")) {
        map.addLayer({
          id: "current-circles",
          type: "circle",
          source: "current-locations-source",
          paint: {
            "circle-radius": 5.5,
            "circle-color": "#35566b",
            "circle-stroke-color": "#fbf9f3",
            "circle-stroke-width": 1.8,
          },
        });
      }

      if (!map.getLayer("active-entry")) {
        map.addLayer({
          id: "active-entry",
          type: "circle",
          source: "active-entry-source",
          paint: {
            "circle-radius": 14,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#9a5b24",
            "circle-stroke-width": 2.4,
          },
        });
      }

      syncAllSources();
    };

    const reportBounds = () => {
      const b = map.getBounds();
      if (!b) return;
      const [[minLon, minLat], [maxLon, maxLat]] = b.toArray();
      onBoundsRef.current({ minLat, minLon, maxLat, maxLon });
    };

    const handleLoad = () => {
      addLayers();
      setStatus("ready");
      reportBounds();
    };

    const handleError = (event: maplibregl.ErrorEvent) => {
      setStatus((current) => (current === "ready" ? current : "error"));
      const message = event.error?.message ?? "";
      if (message) setNotice(message.slice(0, 180));
    };

    const handleMoveEnd = () => reportBounds();
    const handleStyleData = () => addLayers();

    const showHoverPopup = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      map.getCanvas().style.cursor = "pointer";
      const coords = feature.geometry.coordinates as [number, number];
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      popup.setLngLat(coords).setDOMContent(buildPopupElement(props)).addTo(map);
    };

    const hideHoverPopup = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };

    map.on("load", handleLoad);
    map.on("styledata", handleStyleData);
    map.on("moveend", handleMoveEnd);
    map.on("error", handleError);

    map.on("click", "entries-unclustered", (event) => {
      const id = event.features?.[0]?.properties?.entryId;
      if (typeof id === "string") {
        dispatchRef.current({ type: "selectEntry", id, role: "origin" });
      }
    });

    map.on("click", "current-circles", (event) => {
      const id = event.features?.[0]?.properties?.entryId;
      if (typeof id === "string") {
        dispatchRef.current({ type: "selectEntry", id, role: "current" });
      }
    });

    map.on("click", "entries-clusters", async (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const center = feature.geometry.coordinates as [number, number];
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource("entries-source") as maplibregl.GeoJSONSource | undefined;

      let targetZoom = Math.min(map.getZoom() + 2, 16);
      if (source && typeof clusterId === "number") {
        try {
          targetZoom = await source.getClusterExpansionZoom(clusterId);
        } catch {
          // Keep fallback zoom when cluster expansion lookup fails.
        }
      }
      map.easeTo({
        center,
        zoom: targetZoom,
        duration: prefersReducedMotion() ? 0 : 450,
      });
    });

    map.on("mouseenter", "entries-unclustered", showHoverPopup);
    map.on("mousemove", "entries-unclustered", showHoverPopup);
    map.on("mouseleave", "entries-unclustered", hideHoverPopup);

    map.on("mouseenter", "current-circles", showHoverPopup);
    map.on("mousemove", "current-circles", showHoverPopup);
    map.on("mouseleave", "current-circles", hideHoverPopup);

    map.on("mouseenter", "entries-clusters", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "entries-clusters", () => {
      map.getCanvas().style.cursor = "";
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [retry]);

  useEffect(() => {
    const origins = buildOriginCollection(entries, resolvedActive);
    const currents = buildCurrentCollection(entries, resolvedActive);
    const transfers = buildArtifactTransferCollection(entries, resolvedActive);

    latestCollectionsRef.current.origins = origins;
    latestCollectionsRef.current.currents = currents;
    latestCollectionsRef.current.transfers = transfers;

    const map = mapRef.current;
    if (!map || status !== "ready") return;
    (map.getSource("entries-source") as maplibregl.GeoJSONSource | undefined)?.setData(origins);
    (map.getSource("current-locations-source") as maplibregl.GeoJSONSource | undefined)?.setData(
      currents,
    );
    (map.getSource("artifact-transfer-source") as maplibregl.GeoJSONSource | undefined)?.setData(
      transfers,
    );
  }, [entries, resolvedActive, status]);

  useEffect(() => {
    const feature = resolvedActive ? buildActiveFeature(resolvedActive, activeLocationRole) : null;
    const activeData = feature
      ? { type: "FeatureCollection" as const, features: [feature] }
      : EMPTY;
    const arcData = resolvedActive
      ? buildArcCollection(resolvedActive, resolvedLinks, getEntry)
      : EMPTY;

    latestCollectionsRef.current.active = activeData;
    latestCollectionsRef.current.arcs = arcData;

    const map = mapRef.current;
    if (!map || status !== "ready") return;
    (map.getSource("active-entry-source") as maplibregl.GeoJSONSource | undefined)?.setData(
      activeData,
    );
    (map.getSource("historical-arcs-source") as maplibregl.GeoJSONSource | undefined)?.setData(
      arcData,
    );
  }, [resolvedActive, resolvedLinks, activeLocationRole, status]);

  const resolvedActiveId = resolvedActive?.id ?? null;

  useEffect(() => {
    const map = mapRef.current;
    const currentActive = resolvedActiveRef.current;
    if (!map || status !== "ready") return;
    if (!currentActive || !activeLocationRole) {
      setNotice(null);
      return;
    }

    const target = activeLocationRole === "current" ? currentActive.current : currentActive.origin;
    if (!target) {
      setNotice(
        activeLocationRole === "current"
          ? "No current location is recorded for this entry."
          : "No origin coordinate is recorded for this entry.",
      );
      return;
    }

    setNotice(null);
    const precision =
      activeLocationRole === "current"
        ? currentActive.currentPrecision
        : currentActive.originPrecision;
    const desiredMinZoom = precision === "exact" ? 10 : precision === "unknown" ? 6 : 8;

    map.flyTo({
      center: [target.longitude, target.latitude],
      zoom: Math.max(map.getZoom(), desiredMinZoom),
      duration: prefersReducedMotion() ? 0 : 850,
      essential: false,
    });
  }, [resolvedActiveId, activeLocationRole, status]);

  const zoomDuration = prefersReducedMotion() ? 0 : 250;
  const flyDuration = prefersReducedMotion() ? 0 : 750;

  return (
    <section
      aria-label="Map canvas"
      data-tour="map"
      className="relative h-full min-h-0 overflow-hidden bg-[#e9e4d8]"
    >
      <div ref={containerRef} className="absolute inset-0" />

      {status === "loading" && (
        <div
          className="absolute inset-0 grid place-items-center bg-paper/85 text-sm text-muted"
          role="status"
        >
          Loading basemap…
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="absolute inset-x-4 top-4 z-10 border border-[#b8835c] bg-[#f7e9e2] px-4 py-3 text-sm text-[#7a3720]"
        >
          <p>The basemap could not load. Check the network connection and try again.</p>
          {notice && <p className="mt-1 text-xs opacity-80">{notice}</p>}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-2 border border-current px-2 py-1 text-xs hover:bg-[#efd8cc]"
          >
            Retry map
          </button>
        </div>
      )}

      {notice && status === "ready" && (
        <p
          role="status"
          className="absolute inset-x-4 top-4 z-10 max-w-md border border-rule bg-sheet px-3 py-2 text-xs text-muted"
        >
          {notice}
        </p>
      )}

      <div
        aria-label="Map controls"
        className="absolute right-3 top-3 z-10 flex flex-col border border-rule bg-sheet"
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => mapRef.current?.zoomIn({ duration: zoomDuration })}
          className="grid size-11 place-items-center hover:bg-paper md:size-9"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => mapRef.current?.zoomOut({ duration: zoomDuration })}
          className="grid size-11 place-items-center border-t border-rule hover:bg-paper md:size-9"
        >
          <Minus aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Reset view to the Philippines"
          title="Reset view to the Philippines"
          onClick={() =>
            mapRef.current?.flyTo({
              center: PHILIPPINES_CENTER,
              zoom: PHILIPPINES_ZOOM,
              duration: flyDuration,
              essential: false,
            })
          }
          className="grid size-11 place-items-center border-t border-rule hover:bg-paper md:size-9"
        >
          <LocateFixed aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Reset view to World"
          title="Reset view to World"
          onClick={() =>
            mapRef.current?.flyTo({
              center: WORLD_CENTER,
              zoom: WORLD_ZOOM,
              duration: flyDuration,
              essential: false,
            })
          }
          className="grid size-11 place-items-center border-t border-rule hover:bg-paper md:size-9"
        >
          <Globe aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[270px] border border-rule bg-sheet/95 px-3 py-2 text-[11px] text-muted">
        <p className="caption-label mb-1">Legend</p>
        <p>● Filled dot · place of origin</p>
        <p>○ Hollow ring · artifact origin</p>
        <p>
          <span className="text-harbor">◎</span> Ringed blue dot · current holding location
        </p>
        <p>
          <span className="text-ochre">━━</span> Solid ochre · historical influence
        </p>
        <p>
          <span className="text-ochre">╌╌</span> Dashed ochre · exchange / association
        </p>
        <p>
          <span className="text-harbor">╌╌</span> Dashed blue · artifact relocation
        </p>
        {bounds && (
          <p className="mt-1.5 border-t border-rule pt-1 tabular">
            Viewport {bounds.minLon.toFixed(1)}, {bounds.minLat.toFixed(1)} to{" "}
            {bounds.maxLon.toFixed(1)}, {bounds.maxLat.toFixed(1)}
          </p>
        )}
      </div>

      <Compass
        aria-hidden="true"
        size={14}
        strokeWidth={1.5}
        className="pointer-events-none absolute right-3 bottom-3 text-muted"
      />
    </section>
  );
}
