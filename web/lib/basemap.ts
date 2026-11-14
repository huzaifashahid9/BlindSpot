import type { IControl, Map as MLMap, StyleSpecification } from "maplibre-gl";

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

// ---------- Google basemaps (served through /api/gmap so the key stays on the server) ----------
export const GOOGLE_KINDS = [
  { id: "dark", label: "Google Maps, dark" },
  { id: "roadmap", label: "Google Maps" },
  { id: "hybrid", label: "Google satellite with labels" },
  { id: "satellite", label: "Google satellite" },
  { id: "terrain", label: "Google terrain" },
] as const;

let googleOk: Promise<boolean> | null = null;
export function googleAvailable() {
  googleOk ??= fetch("/api/gmap/status")
    .then((r) => r.json())
    .then((j) => Boolean(j.configured))
    .catch(() => false);
  return googleOk;
}

type MapLike = MLMap;

/** Show a Google basemap under every data layer, or remove it (kind ""). */
export function setGoogleBase(m: MapLike, kind: string) {
  if (m.getLayer("gmap")) m.removeLayer("gmap");
  if (m.getSource("gmap")) m.removeSource("gmap");
  if (!kind) return;
  m.addSource("gmap", {
    type: "raster",
    tiles: [`/api/gmap/${kind}/{z}/{x}/{y}`],
    tileSize: 256,
    maxzoom: 20,
    attribution: "Map data © Google",
  });
  // right above the built-in basemap layers, below districts, fires and outlines
  const layers = m.getStyle().layers.map((l) => l.id);
  const before = layers.find((id) => !["bg", "base", "night"].includes(id));
  m.addLayer({ id: "gmap", type: "raster", source: "gmap" }, before);
}

/** A small MapLibre control: a basemap picker with the Google options. Adds itself only when the server has a key. */
export function addBasemapPicker(m: MLMap) {
  googleAvailable().then((ok) => {
    if (!ok) return;
    const ctl: IControl & { el: HTMLDivElement | null } = {
      el: null as HTMLDivElement | null,
      onAdd() {
        const el = document.createElement("div");
        el.className = "maplibregl-ctrl maplibregl-ctrl-group bs-basemap";
        const sel = document.createElement("select");
        sel.setAttribute("aria-label", "Basemap");
        [["", "Basemap: default"], ...GOOGLE_KINDS.map((k) => [k.id, k.label])].forEach(([v, l]) => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = l;
          sel.appendChild(o);
        });
        sel.onchange = () => {
          const go = () => setGoogleBase(m, sel.value);
          if (m.isStyleLoaded()) go();
          else m.once("load", go);
        };
        el.appendChild(sel);
        this.el = el;
        return el;
      },
      onRemove() {
        this.el?.remove();
      },
    };
    m.addControl(ctl, "bottom-left");
  });
}
