import type { StyleSpecification } from "maplibre-gl";

// Keyless basemaps. CARTO now asks for an API key outside localhost, so we use Esri's dark canvas
// and NASA GIBS imagery. If tiles fail to load, the dark background, districts and fires still draw.
export function basemap(kind: "dark" | "night" = "dark"): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
        attribution: "Basemap © Esri",
      },
      night: {
        type: "raster",
        tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"],
        tileSize: 256,
        maxzoom: 8,
        attribution: "Night lights: NASA Black Marble (GIBS)",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#05070d" } },
      { id: "base", type: "raster", source: "base", paint: { "raster-opacity": kind === "night" ? 0.5 : 1 } },
      ...(kind === "night" ? [{ id: "night", type: "raster" as const, source: "night", paint: { "raster-opacity": 0.75 } }] : []),
    ],
  };
}

// The bundler cannot locate MapLibre's module worker on its own; it is copied to /public on install.
export const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
