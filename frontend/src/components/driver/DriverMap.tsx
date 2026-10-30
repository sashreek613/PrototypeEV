import { Calendar, LocateFixed, Navigation, Zap, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";

import type { Charger } from "../../types";
import { hasValidCoordinates } from "../../utils/chargerFilters";
import { formatInr } from "../../utils/format";
import { centroid, haversineKm } from "../../utils/geo";
import { getLightBasemapStyle } from "../../utils/mapStyle";
import { useT } from "../../i18n";

interface DriverMapProps {
  chargers: Charger[];
  origin?: { latitude: number; longitude: number };
  rangeKm?: number | null;
  isLiveLocation?: boolean;
  selectedChargerId?: string | null;
  onSelectCharger?: (chargerId: string | null) => void;
  onMapClick?: (lat: number, lon: number) => void;
  /** Called when the "recenter" button is tapped -- the caller's job is to
   * clear any active location search (so `origin` goes back to real GPS).
   * Omit to hide the button entirely (e.g. ChargerDetailsPage's map, which
   * has no search/GPS state of its own to recenter to). */
  onRecenter?: () => void;
  /** Bump this (e.g. a counter) on every recenter tap to force the camera
   * back to `here` even when `origin` itself hasn't changed -- e.g. the
   * driver panned the map by hand with no search active, so the effect that
   * watches origin for changes never fires on its own. */
  recenterSignal?: number;
}

const RANGE_SOURCE_ID = "driver-range-circle";
const EARTH_KM = 6371;

function circlePolygonCoordinates(centerLat: number, centerLon: number, radiusKm: number, points = 64): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (centerLat * Math.PI) / 180;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const dLat = dy / EARTH_KM;
    const dLon = dx / (EARTH_KM * Math.cos(latRad));
    coords.push([centerLon + (dLon * 180) / Math.PI, centerLat + (dLat * 180) / Math.PI]);
  }
  return coords;
}

interface PolygonFeature {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}

function rangeCircleGeoJSON(centerLat: number, centerLon: number, radiusKm: number): PolygonFeature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [circlePolygonCoordinates(centerLat, centerLon, radiusKm)],
    },
  };
}

function availabilityLabel(charger: Charger, t: (key: string) => string): { text: string; className: string; dot: string } {
  if (charger.availability === true) {
    return {
      text: charger.provenance === "REAL" ? t("common.charger_status.operational") : t("common.charger_status.available"),
      className: "text-emerald-700",
      dot: "bg-emerald-500",
    };
  }
  if (charger.availability === false) {
    return {
      text: charger.provenance === "REAL" ? t("common.charger_status.reported_down") : t("common.charger_status.in_use"),
      className: "text-amber-700",
      dot: "bg-amber-500",
    };
  }
  return { text: t("common.charger_status.unknown"), className: "text-gray-500", dot: "bg-gray-400" };
}

export function DriverMap({
  chargers,
  origin,
  rangeKm,
  isLiveLocation = false,
  selectedChargerId = null,
  onSelectCharger,
  onMapClick,
  onRecenter,
  recenterSignal,
}: DriverMapProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const chargersByIdRef = useRef<Map<string, Charger>>(new Map());
  const onSelectRef = useRef(onSelectCharger);
  const onMapClickRef = useRef(onMapClick);
  const lastOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastFocusedChargerRef = useRef<string | null>(null);
  const isFirstRecenterRef = useRef(true);
  const navigate = useNavigate();

  onSelectRef.current = onSelectCharger;
  onMapClickRef.current = onMapClick;
  chargersByIdRef.current = new Map(chargers.map((charger) => [charger.id, charger]));

  const here = origin ?? centroid(chargers);
  const selectedCharger = selectedChargerId ? (chargersByIdRef.current.get(selectedChargerId) ?? null) : null;
  const plottableCount = chargers.filter(hasValidCoordinates).length;

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const map = new MapLibreMap({
      container: ref.current,
      style: getLightBasemapStyle(),
      center: [here.longitude, here.latitude],
      zoom: 11.8,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.getCanvas().style.cursor = "default";
    lastOriginRef.current = { latitude: here.latitude, longitude: here.longitude };

    const isCurrent = () => mapRef.current === map;

    const handleResize = () => {
      if (isCurrent()) {
        map.resize();
      }
    };

    map.once("load", () => {
      handleResize();
      map.addSource(RANGE_SOURCE_ID, {
        type: "geojson",
        data: rangeCircleGeoJSON(here.latitude, here.longitude, rangeKm ?? 0),
      });
      map.addLayer({
        id: `${RANGE_SOURCE_ID}-fill`,
        type: "fill",
        source: RANGE_SOURCE_ID,
        paint: { "fill-color": "#10b981", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: `${RANGE_SOURCE_ID}-line`,
        type: "line",
        source: RANGE_SOURCE_ID,
        paint: { "line-color": "#10b981", "line-width": 1.5, "line-opacity": 0.5 },
      });
    });

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(ref.current);

    map.on("click", (event) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest("[data-charger-id], [data-origin-marker]")) {
        return;
      }
      onMapClickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (isCurrent()) {
        map.remove();
        mapRef.current = null;
      }
    };
    // Map instance is created once; origin/range updates happen in later effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const previous = lastOriginRef.current;
    if (previous && previous.latitude === here.latitude && previous.longitude === here.longitude) {
      return;
    }
    const isSmallLiveMove =
      isLiveLocation &&
      previous !== null &&
      haversineKm(previous.latitude, previous.longitude, here.latitude, here.longitude) < 0.08;
    lastOriginRef.current = { latitude: here.latitude, longitude: here.longitude };
    if (isSmallLiveMove) {
      return;
    }
    lastFocusedChargerRef.current = null;
    const fly = () => {
      map.flyTo({ center: [here.longitude, here.latitude], zoom: 12.5, duration: 800 });
    };
    if (map.loaded()) {
      fly();
    } else {
      map.once("load", fly);
    }
  }, [here.latitude, here.longitude, isLiveLocation]);

  // Recenter button: forces the camera back to `here` even when `here`
  // itself hasn't changed -- e.g. the driver dragged/pinched the map by hand
  // with no search active, so the origin-watching effect above never fires
  // on its own (it only reacts to an actual coordinate change). Skips the
  // initial mount so it doesn't double up with the map-creation effect's own
  // first flyTo.
  useEffect(() => {
    if (isFirstRecenterRef.current) {
      isFirstRecenterRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) {
      return;
    }
    lastOriginRef.current = { latitude: here.latitude, longitude: here.longitude };
    lastFocusedChargerRef.current = null;
    const fly = () => {
      map.flyTo({ center: [here.longitude, here.latitude], zoom: 13.5, duration: 600 });
    };
    if (map.loaded()) {
      fly();
    } else {
      map.once("load", fly);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // keyed only on recenterSignal: `here` is read at fire time, and adding
    // it here would make this fire on every ordinary origin change too,
    // duplicating the effect above.
  }, [recenterSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!selectedChargerId) {
      lastFocusedChargerRef.current = null;
      return;
    }
    const charger = chargersByIdRef.current.get(selectedChargerId);
    if (!map || !charger || !hasValidCoordinates(charger)) {
      return;
    }
    if (lastFocusedChargerRef.current === charger.id) {
      return;
    }
    lastFocusedChargerRef.current = charger.id;
    const pan = () => {
      map.easeTo({ center: [charger.longitude, charger.latitude], duration: 450 });
    };
    if (map.loaded()) {
      pan();
    } else {
      map.once("load", pan);
    }
  }, [selectedChargerId]);

  const chargersRef = useRef(chargers);
  chargersRef.current = chargers;
  const markerKey = chargers.map((charger) => charger.id).join("|");

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const plottable = chargersRef.current.filter(hasValidCoordinates);
    const paint = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      if (origin) {
        const you = document.createElement("div");
        you.className = "relative flex h-4 w-4 items-center justify-center z-20";
        you.setAttribute("data-origin-marker", "true");
        you.innerHTML = isLiveLocation
          ? '<span class="absolute h-8 w-8 rounded-full bg-emerald-500/35 animate-ping"></span><span class="relative h-4 w-4 rounded-full bg-slate-950 ring-4 ring-white shadow-lg"></span>'
          : '<span class="h-4 w-4 rounded-full bg-slate-950 ring-4 ring-white shadow-md"></span>';
        markersRef.current.push(new Marker({ element: you }).setLngLat([origin.longitude, origin.latitude]).addTo(map));
      }

      plottable.forEach((charger) => {
        const isSelected = selectedChargerId === charger.id;
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.chargerId = charger.id;
        el.className = "group cursor-pointer border-none bg-transparent p-0 m-0 outline-none z-10 block";
        el.setAttribute("aria-label", charger.name);
        el.setAttribute("title", charger.name);

        const statusDot =
          charger.availability === true ? "bg-[#7FA58A]" : charger.availability === false ? "bg-[#C5A66A]" : "bg-slate-400";
        el.innerHTML = `
          <span class="relative flex h-7 w-7 items-center justify-center rounded-full ${isSelected ? "bg-[#4F6F9F] text-white ring-2 ring-[#4F6F9F]" : "bg-[#4F6F9F] text-white"} border-2 border-white shadow-xs group-hover:bg-[#3F5F8F] transition-colors">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white ${statusDot}"></span>
          </span>
        `;

        el.addEventListener("mousedown", (event) => {
          event.stopPropagation();
        });
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();
          const id = el.dataset.chargerId;
          if (id) {
            onSelectRef.current?.(id);
          }
        });

        markersRef.current.push(new Marker({ element: el, offset: [0, 0] }).setLngLat([charger.longitude, charger.latitude]).addTo(map));
      });
    };

    if (map.loaded()) {
      paint();
    } else {
      map.once("load", paint);
    }
  }, [markerKey, here.latitude, here.longitude, origin, isLiveLocation, selectedChargerId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const update = () => {
      const source = map.getSource(RANGE_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) {
        return;
      }
      source.setData(rangeCircleGeoJSON(here.latitude, here.longitude, rangeKm ?? 0));
    };
    if (map.loaded()) {
      update();
    } else {
      map.once("load", update);
    }
  }, [here.latitude, here.longitude, rangeKm]);

  function handleNavigate(charger: Charger) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${here.latitude},${here.longitude}&destination=${charger.latitude},${charger.longitude}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const selectedKm = selectedCharger
    ? haversineKm(here.latitude, here.longitude, selectedCharger.latitude, selectedCharger.longitude)
    : 0;
  const selectedStatus = selectedCharger ? availabilityLabel(selectedCharger, t) : null;

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />

      {onRecenter ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRecenter();
          }}
          aria-label={t("driver_map.recenter_aria")}
          title={t("driver_map.recenter_aria")}
          className="absolute top-3 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 border border-gray-200 text-driver-ink shadow-md backdrop-blur hover:bg-white transition-colors cursor-pointer pointer-events-auto"
        >
          <LocateFixed size={16} />
        </button>
      ) : null}

      {selectedCharger && selectedStatus ? (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur text-gray-900 max-w-md mx-auto font-sans">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${selectedStatus.dot}`} />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedStatus.className}`}>
                  {selectedStatus.text}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 font-mono">{t("driver_map.km_away", { km: selectedKm.toFixed(1) })}</span>
              </div>
              <h4 className="mt-1 text-[15px] font-bold text-gray-900 leading-tight">
                {selectedCharger.name.replace(" (demo)", "")}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => onSelectCharger?.(null)}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-[12px] text-gray-600">
            <div className="flex items-center gap-1.5 font-medium">
              <Zap size={14} className="text-emerald-500" />
              <span>{selectedCharger.power_kw !== null ? `${selectedCharger.power_kw} kW` : t("common.power_unknown")}</span>
            </div>
            <div className="font-semibold text-gray-900 font-mono">
              {selectedCharger.price_per_kwh !== null ? `${formatInr(selectedCharger.price_per_kwh)}/kWh` : t("common.price_unknown")}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(selectedCharger)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#e2ebe4] border border-[#cbe4d3] py-2.5 text-[12px] font-semibold text-[#1e4530] hover:bg-[#d6e5d9] transition-colors cursor-pointer"
            >
              <Navigation size={14} />
              <span>{t("common.navigate")}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/driver/charger/${selectedCharger.id}`)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-gray-50 py-2.5 text-[12px] font-semibold text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {t("common.view_details")}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/driver/charger/${selectedCharger.id}/book`)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2e5b44] py-2.5 text-[12px] font-semibold text-white hover:bg-[#254b38] transition-colors cursor-pointer"
            >
              <Calendar size={14} />
              {t("common.book_now")}
            </button>
          </div>
        </div>
      ) : (
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/95 border border-gray-200 px-3.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-gray-700 shadow backdrop-blur font-mono">
          {t("driver_map.charger_count", { count: plottableCount })}
        </span>
      )}
    </div>
  );
}
