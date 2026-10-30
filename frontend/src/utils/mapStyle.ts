import type { StyleSpecification } from "maplibre-gl";

/**
 * OSM raster tiles — no API key, CORS-enabled, MapLibre-compatible.
 *
 * OpenFreeMap vector styles (positron/liberty) load attribution but do not
 * paint features in MapLibre 6 because their layer filters still use
 * `["geometry-type"]`, which no longer matches after MapLibre v5. CARTO
 * Voyager/light raster tiles paint, but watermark "API KEY REQUIRED".
 */
function osmRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    },
    layers: [
      {
        id: "osm-tiles",
        type: "raster",
        source: "osm",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };
}

function cartoVoyagerStyle(apiKey: string): StyleSpecification {
  const query = `?key=${encodeURIComponent(apiKey)}`;
  return {
    version: 8,
    sources: {
      "carto-voyager": {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${query}`,
          `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${query}`,
          `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${query}`,
          `https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${query}`,
        ],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
      },
    },
    layers: [
      {
        id: "carto-voyager-tiles",
        type: "raster",
        source: "carto-voyager",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };
}

let cachedStyle: string | StyleSpecification | null = null;

/**
 * Shared light basemap for Driver and Planner MapLibre maps.
 * Prefer an explicit style URL, then an optional CARTO key, then OSM raster.
 * Never hardcode a key. Cached so object-style results stay identity-stable.
 */
export function getLightBasemapStyle(): string | StyleSpecification {
  if (cachedStyle) {
    return cachedStyle;
  }
  const configured = import.meta.env.VITE_MAP_STYLE_LIGHT?.trim();
  if (configured) {
    cachedStyle = configured;
    return cachedStyle;
  }
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY?.trim();
  if (cartoKey) {
    cachedStyle = cartoVoyagerStyle(cartoKey);
    return cachedStyle;
  }
  cachedStyle = osmRasterStyle();
  return cachedStyle;
}
