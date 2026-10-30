import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, Popup } from "maplibre-gl";

import type { Charger, ClassifiedSite, Recommendation, Site } from "../../types";
import { hasValidCoordinates } from "../../utils/chargerFilters";
import { getLightBasemapStyle } from "../../utils/mapStyle";
import { RECOMMENDATION_COLOR, RECOMMENDATION_INK, RECOMMENDATION_LABEL } from "../../utils/recommendations";

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  recommendation?: Recommendation;
  color?: string;
}

export interface MapFocus {
  latitude: number;
  longitude: number;
  zoom?: number;
}

export interface SiteMapProps {
  points?: MapPoint[];
  chargers?: Charger[];
  styleUrl?: string;
  onPointClick?: (id: string) => void;
  /** Fires for a click anywhere on the map that ISN'T a marker
   * (marker clicks call stopPropagation). */
  onMapClick?: (lat: number, lon: number) => void;
  interactive?: boolean;
  className?: string;
  center?: [number, number];
  zoom?: number;
  legend?: boolean;
  /** Imperative fly-to target. Changing this NEVER recreates the map. */
  focus?: MapFocus | null;
  /** The searched/clicked point, rendered as a larger, pulsing marker. */
  highlight?: MapPoint | null;
  /** Full classification result from backend /api/sites/classify for popup metrics. */
  classifiedResult?: ClassifiedSite | null;
  /** Selected candidate site for popup details. */
  selectedSite?: Site | null;
}

const BENGALURU: [number, number] = [77.5946, 12.9716];

// Bengaluru BBMP Model Bounds
const BBMP_MIN_LAT = 12.8334905;
const BBMP_MAX_LAT = 13.1426196;
const BBMP_MIN_LON = 77.4598797;
const BBMP_MAX_LON = 77.7840639;

function buildRecommendationPopupHTML(data: {
  name: string;
  latitude: number;
  longitude: number;
  recommendation?: Recommendation;
  site_score?: number;
  demand_score?: number;
  grid_capacity_score?: number;
  accessibility_score?: number;
  charger_gap_score?: number;
  nearest_candidate?: { name: string; distance_km: number } | null;
}): string {
  const ink = data.recommendation ? RECOMMENDATION_INK[data.recommendation] : "#166534";
  const label = data.recommendation ? RECOMMENDATION_LABEL[data.recommendation] : "ASSESSED LOCATION";
  const formattedTitle = data.name.replace(" (demo)", "");
  const coords = `${data.latitude.toFixed(4)}°N, ${data.longitude.toFixed(4)}°E`;

  let scoreBadge = "";
  if (typeof data.site_score === "number") {
    scoreBadge = `<div style="font-family:monospace;font-weight:700;font-size:13px;color:${ink}">${data.site_score.toFixed(1)}/100</div>`;
  }

  let factorsGrid = "";
  if (typeof data.grid_capacity_score === "number") {
    factorsGrid = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11px">
        <div><span style="color:#64748b">Grid Headroom:</span> <b style="color:#0f172a">${Math.round(data.grid_capacity_score)}</b></div>
        <div><span style="color:#64748b">EV Demand:</span> <b style="color:#0f172a">${Math.round(data.demand_score ?? 0)}</b></div>
        <div><span style="color:#64748b">Accessibility:</span> <b style="color:#0f172a">${Math.round(data.accessibility_score ?? 0)}</b></div>
        <div><span style="color:#64748b">Charger Gap:</span> <b style="color:#0f172a">${Math.round(data.charger_gap_score ?? 0)}</b></div>
      </div>
    `;
  }

  let nearestInfo = "";
  if (data.nearest_candidate) {
    nearestInfo = `
      <div style="margin-top:6px;font-size:10.5px;color:#64748b">
        Nearest station: <span style="color:#334155;font-weight:600">${data.nearest_candidate.name.replace(" (demo)", "")}</span> (${data.nearest_candidate.distance_km.toFixed(1)} km)
      </div>
    `;
  }

  return `
    <div style="min-width:220px;max-width:270px;font-family:var(--font-sans, sans-serif);padding:2px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.05em;background:${ink}18;color:${ink};border:1px solid ${ink}44">
          ● ${label}
        </span>
        ${scoreBadge}
      </div>
      <div style="font-weight:700;font-size:13px;color:#0f172a;margin-top:4px;line-height:1.2">
        ${formattedTitle}
      </div>
      <div style="font-family:monospace;font-size:10px;color:#64748b;margin-top:2px">
        ${coords}
      </div>
      ${factorsGrid}
      ${nearestInfo}
    </div>
  `;
}

function buildChargerPopupHTML(charger: Charger): string {
  const availability =
    charger.availability === true
      ? { text: charger.provenance === "REAL" ? "Operational" : "Available", color: "#7FA58A", dot: "#7FA58A" }
      : charger.availability === false
        ? { text: charger.provenance === "REAL" ? "Reported down" : "In use", color: "#C5A66A", dot: "#C5A66A" }
        : { text: "Status unknown", color: "#667085", dot: "#9AA5B1" };
  const powerText = charger.power_kw != null ? `${charger.power_kw} kW` : "Unknown";
  const priceText = charger.price_per_kwh != null ? `₹${charger.price_per_kwh}/kWh` : "Unknown";
  const connectorText = charger.connector_type?.trim() ? charger.connector_type : "Unknown";

  return `
    <div style="min-width:190px;max-width:230px;font-family:var(--font-sans, sans-serif);padding:2px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="height:7px;width:7px;border-radius:9999px;background:${availability.dot}"></span>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${availability.color}">
          ${availability.text}
        </span>
      </div>
      <div style="font-weight:700;font-size:12.5px;color:#1f2937;line-height:1.2">
        ${charger.name}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;font-size:10.5px">
        <div><span style="color:#667085">Power:</span> <b style="color:#1f2937">${powerText}</b></div>
        <div><span style="color:#667085">Rate:</span> <b style="color:#1f2937">${priceText}</b></div>
        <div style="grid-column:span 2"><span style="color:#667085">Connector:</span> <b style="color:#1f2937">${connectorText}</b></div>
      </div>
    </div>
  `;
}

export function SiteMap({
  points = [],
  chargers = [],
  styleUrl,
  onPointClick,
  onMapClick,
  interactive = true,
  className = "h-full w-full",
  center = BENGALURU,
  zoom = 11.5,
  legend = false,
  focus = null,
  highlight = null,
  classifiedResult = null,
  selectedSite = null,
}: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const chargerMarkersRef = useRef<Marker[]>([]);
  const siteMarkersRef = useRef<Marker[]>([]);
  const highlightMarkerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [clickedCharger, setClickedCharger] = useState<Charger | null>(null);
  const onPointClickRef = useRef(onPointClick);
  const chargersByIdRef = useRef<Map<string, Charger>>(new Map());

  const activeStyle = styleUrl ?? getLightBasemapStyle();
  const initialViewRef = useRef({ center, zoom });
  const chargerMarkerKey = chargers.map((charger) => charger.id).join("|");
  const siteMarkerKey = points.map((point) => point.id).join("|");
  const pointsRef = useRef(points);
  const chargersListRef = useRef(chargers);

  chargersByIdRef.current = new Map(chargers.map((charger) => [charger.id, charger]));
  pointsRef.current = points;
  chargersListRef.current = chargers;

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  // --- Map lifecycle: created ONCE.
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const map = new MapLibreMap({
      container: containerRef.current,
      style: activeStyle,
      center: initialViewRef.current.center,
      zoom: initialViewRef.current.zoom,
      maxBounds: [
        [77.38, 12.78],
        [77.86, 13.20],
      ],
      attributionControl: { compact: true },
      interactive,
    });
    mapRef.current = map;
    map.getCanvas().style.cursor = "default";

    const isCurrent = () => mapRef.current === map;

    const handleResize = () => {
      if (isCurrent()) {
        map.resize();
      }
    };

    map.once("load", handleResize);

    // Dynamic container resize observer to prevent 0x0 / blank canvas issues
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    map.on("click", (event) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest("[data-charger-id], [data-site-id], [data-highlight-marker]")) {
        return;
      }
      const lat = event.lngLat.lat;
      const lon = event.lngLat.lng;
      setClickedCharger(null);
      // Ensure clicked point is within the supported BBMP model region before dispatching
      if (lat >= BBMP_MIN_LAT && lat <= BBMP_MAX_LAT && lon >= BBMP_MIN_LON && lon <= BBMP_MAX_LON) {
        onMapClickRef.current?.(lat, lon);
      }
    });

    return () => {
      resizeObserver.disconnect();
      chargerMarkersRef.current.forEach((marker) => marker.remove());
      chargerMarkersRef.current = [];
      siteMarkersRef.current.forEach((marker) => marker.remove());
      siteMarkersRef.current = [];
      highlightMarkerRef.current?.remove();
      highlightMarkerRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;

      if (isCurrent()) {
        map.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStyle, interactive]);

  // --- Candidate / recommended site markers: REMOVED per requirements.
  // The map only renders existing charging stations.
  useEffect(() => {
    siteMarkersRef.current.forEach((marker) => marker.remove());
    siteMarkersRef.current = [];
  }, [siteMarkerKey]);

  // --- Existing charger pins (info markers). Renders ONLY existing chargers.
  // Outer element has zero hover transform to ensure absolute geographic anchor stability.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const paintChargers = () => {
      chargerMarkersRef.current.forEach((marker) => marker.remove());
      chargerMarkersRef.current = [];

      chargersListRef.current.forEach((charger) => {
        if (!hasValidCoordinates(charger)) {
          return;
        }
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.chargerId = charger.id;
        // Outer wrapper MUST NOT have CSS hover transforms (e.g. hover:scale) so MapLibre's marker positioning transform is 100% stable!
        el.className = "group cursor-pointer border-none bg-transparent p-0 m-0 outline-none z-10 block";
        el.setAttribute("aria-label", charger.name);
        el.setAttribute("title", charger.name);
        // Inner element receives color & hover highlight
        el.innerHTML = `
          <span class="flex h-6 w-6 items-center justify-center rounded-full bg-[#4F6F9F] text-white border-2 border-white shadow-xs group-hover:bg-[#3F5F8F] transition-colors">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </span>
        `;

        el.addEventListener("mousedown", (event) => {
          event.stopPropagation();
        });
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = el.dataset.chargerId;
          const match = (id ? chargersByIdRef.current.get(id) : null) ?? null;
          setClickedCharger(match);
        });

        chargerMarkersRef.current.push(new Marker({ element: el, offset: [0, 0] }).setLngLat([charger.longitude, charger.latitude]).addTo(map));
      });
    };

    if (map.loaded()) {
      paintChargers();
    } else {
      map.once("load", paintChargers);
    }
  }, [chargerMarkerKey]);

  // --- Highlight marker: the searched or clicked target pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !highlight || !hasValidCoordinates(highlight)) {
      highlightMarkerRef.current?.remove();
      highlightMarkerRef.current = null;
      return;
    }

    const paintHighlight = () => {
      highlightMarkerRef.current?.remove();
      const color = highlight.color ?? (highlight.recommendation ? RECOMMENDATION_COLOR[highlight.recommendation] : "#0284c7");
      const el = document.createElement("div");
      el.className = "relative flex h-8 w-8 items-center justify-center cursor-pointer z-20";
      el.setAttribute("data-highlight-marker", "true");
      el.setAttribute("aria-label", highlight.name);
      el.innerHTML = `
        <span class="absolute h-8 w-8 animate-ping rounded-full" style="background:${color}44"></span>
        <span class="relative h-5 w-5 rounded-full border-2 border-white shadow-lg" style="background:${color}"></span>
      `;
      highlightMarkerRef.current = new Marker({ element: el }).setLngLat([highlight.longitude, highlight.latitude]).addTo(map);
    };

    if (map.loaded()) {
      paintHighlight();
    } else {
      map.once("load", paintHighlight);
    }
  }, [highlight]);

  // --- Anchored MapLibre Popup for Recommendation assessment or Charger details
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const updatePopup = () => {
      // 1. Existing Charger Popup takes priority if clicked
      if (clickedCharger && hasValidCoordinates(clickedCharger)) {
        const html = buildChargerPopupHTML(clickedCharger);
        if (!popupRef.current) {
          popupRef.current = new Popup({ closeButton: true, closeOnClick: false, focusAfterOpen: false, offset: [0, -12], maxWidth: "230px" });
        }
        popupRef.current
          .setLngLat([clickedCharger.longitude, clickedCharger.latitude])
          .setHTML(html)
          .addTo(map);
        return;
      }

      // 2. Selected candidate site (stable site id) before leftover classify results
      if (selectedSite && hasValidCoordinates(selectedSite)) {
        const html = buildRecommendationPopupHTML({
          name: selectedSite.name,
          latitude: selectedSite.latitude,
          longitude: selectedSite.longitude,
          recommendation: selectedSite.recommendation,
          site_score: selectedSite.site_score,
          demand_score: selectedSite.demand_score,
          grid_capacity_score: selectedSite.grid_capacity_score,
          accessibility_score: selectedSite.accessibility_score,
          charger_gap_score: selectedSite.charger_gap_score,
        });
        if (!popupRef.current) {
          popupRef.current = new Popup({ closeButton: true, closeOnClick: false, focusAfterOpen: false, offset: [0, -12], maxWidth: "260px" });
        }
        popupRef.current
          .setLngLat([selectedSite.longitude, selectedSite.latitude])
          .setHTML(html)
          .addTo(map);
        return;
      }

      // 3. Location assessment popup for search / map-click classify
      const activeTarget = classifiedResult || (highlight && highlight.recommendation ? highlight : null);

      if (activeTarget && hasValidCoordinates(activeTarget)) {
        const html = buildRecommendationPopupHTML({
          name: activeTarget.name || `${activeTarget.latitude.toFixed(4)}, ${activeTarget.longitude.toFixed(4)}`,
          latitude: activeTarget.latitude,
          longitude: activeTarget.longitude,
          recommendation: activeTarget.recommendation,
          site_score: classifiedResult?.site_score,
          demand_score: classifiedResult?.demand_score,
          grid_capacity_score: classifiedResult?.grid_capacity_score,
          accessibility_score: classifiedResult?.accessibility_score,
          charger_gap_score: classifiedResult?.charger_gap_score,
          nearest_candidate: classifiedResult?.nearest_candidate,
        });

        if (!popupRef.current) {
          popupRef.current = new Popup({ closeButton: true, closeOnClick: false, focusAfterOpen: false, offset: [0, -12], maxWidth: "260px" });
        }
        popupRef.current
          .setLngLat([activeTarget.longitude, activeTarget.latitude])
          .setHTML(html)
          .addTo(map);
      } else {
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      }
    };

    if (map.loaded()) {
      updatePopup();
    } else {
      map.once("load", updatePopup);
    }
  }, [classifiedResult, selectedSite, highlight, clickedCharger]);

  // --- Imperative fly-to camera movement
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) {
      return;
    }
    const flyTo = () => {
      map.flyTo({ center: [focus.longitude, focus.latitude], zoom: focus.zoom ?? 14, duration: 1200 });
    };
    if (map.loaded()) {
      flyTo();
    } else {
      map.once("load", flyTo);
    }
  }, [focus]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {legend && classifiedResult ? <MapLegend result={classifiedResult} /> : null}
    </div>
  );
}

function MapLegend({ result }: { result: ClassifiedSite }) {
  const color = result.recommendation ? RECOMMENDATION_COLOR[result.recommendation] : "#10b981";
  const label = result.recommendation ? RECOMMENDATION_LABEL[result.recommendation] : "ASSESSED";

  return (
    <div className="absolute bottom-4 left-4 rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2 text-[11px] text-slate-800 shadow-lg backdrop-blur z-10 font-sans">
      <p className="mb-0.5 tracking-[0.14em] text-slate-400 font-mono text-[10px] uppercase font-bold">LAST ASSESSMENT</p>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-bold text-slate-900">{result.name.replace(" (demo)", "")}</span>
        <span className="font-mono text-xs font-bold" style={{ color }}>{result.site_score.toFixed(1)}/100 ({label})</span>
      </div>
    </div>
  );
}

export function SiteMarker({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border-2 border-white shadow-sm"
      style={{ background: color }}
    />
  );
}
