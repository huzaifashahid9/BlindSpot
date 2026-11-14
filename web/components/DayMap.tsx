"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { basemap, GOOGLE_KINDS, googleAvailable, setGoogleBase, WORKER_URL } from "@/lib/basemap";
import { DayEvents, FireEvent, getJSON, SAT_COLOR, SAT_LABEL, toEvents } from "@/lib/data";
import Icon from "@/components/Icon";

const GIBS = (layer: string, date: string, level = 9, ext = "jpg") =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;
const IMAGERY = [
  { id: "VIIRS_Black_Marble", label: "Black Marble night lights", fixedDate: "2016-01-01", level: 8, ext: "png" },
  { id: "BlueMarble_ShadedRelief_Bathymetry", label: "Blue Marble relief", fixedDate: "2004-08-01", level: 8, ext: "jpeg" },
  { id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", label: "NOAA-20 VIIRS true colour, that day" },
  { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", label: "Aqua MODIS true colour, that day" },
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "Terra MODIS true colour, that day" },
];

type Props = {
  date: string;
  withoutSnpp: boolean;
  focus?: { lon: number; lat: number } | null;
  /** district ids of the selected region; null means the whole country */
  districtIds?: string[] | null;
  areaName?: string;
};
type DistrictFC = GeoJSON.FeatureCollection<GeoJSON.Geometry, { id: string; name: string }>;
const PAK_BOUNDS: [[number, number], [number, number]] = [[60.8, 23.6], [77.9, 37.1]];

function boundsOf(fc: DistrictFC, ids: Set<string>): [[number, number], [number, number]] | null {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  for (const f of fc.features) if (ids.has(f.properties.id) && "coordinates" in f.geometry) walk(f.geometry.coordinates);
  return x0 < x1 ? [[x0, y0], [x1, y1]] : null;
}

function toGeoJSON(events: FireEvent[], withoutSnpp: boolean, inside: Set<string> | null) {
  return {
    type: "FeatureCollection" as const,
    features: events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !(withoutSnpp && e.sats === "SNPP"))
      .map(({ e, i }) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
        properties: {
          i,
          in: !inside || (e.district !== null && inside.has(e.district)) ? 1 : 0,
          frp: e.frp,
          persistent: e.persistent,
          kind: e.sats === "SNPP" ? "only_snpp" : e.sats.includes(",") ? "multi" : "single",
          colour: e.sats === "SNPP" ? SAT_COLOR.SNPP : e.sats.includes(",") ? "#e2e8f0" : SAT_COLOR[e.sats] ?? "#e2e8f0",
        },
      })),
  };
}

export default function DayMap({ date, withoutSnpp, focus, districtIds = null, areaName }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [events, setEvents] = useState<FireEvent[]>([]);
  const [picked, setPicked] = useState<FireEvent | null>(null);
  const [imagery, setImagery] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [districts, setDistricts] = useState<DistrictFC | null>(null);
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    googleAvailable().then((ok) => {
      setGoogle(ok);
      // with a Google key, open on Google's dark map: city names and roads make the fires easy to place
      if (ok) setImagery((v) => v || "g:dark");
    });
  }, []);
  const idKey = districtIds ? districtIds.join(",") : "";
  // district names inside the selected region (events carry the district name)
  const inside = useMemo(() => {
    if (!districtIds || !districts) return null;
    const ids = new Set(districtIds);
    return new Set(districts.features.filter((f) => ids.has(f.properties.id)).map((f) => f.properties.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, districts]);

  useEffect(() => {
    if (!box.current || map.current) return;
    // The bundler cannot locate MapLibre's module worker on its own; it is copied to /public on install.
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({ container: box.current, style: basemap("dark"), center: [70.5, 30.2], zoom: 4.6, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("districts", { type: "geojson", data: "/data/districts.geojson" });
      m.addLayer({ id: "districts-line", type: "line", source: "districts", paint: { "line-color": "#475569", "line-width": 0.6 } });
      m.addLayer({ id: "area-fill", type: "fill", source: "districts", filter: ["in", ["get", "id"], ["literal", []]], paint: { "fill-color": "#f97316", "fill-opacity": 0.06 } });
      m.addLayer({ id: "area-line", type: "line", source: "districts", filter: ["in", ["get", "id"], ["literal", []]], paint: { "line-color": "#fb923c", "line-width": 1.6 } });
      m.addSource("events", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "events",
        type: "circle",
        source: "events",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["ln", ["+", 1, ["get", "frp"]]], 0, 2, 3, 4, 6, 9],
          "circle-color": ["get", "colour"],
          "circle-opacity": ["*", ["case", ["==", ["get", "in"], 1], 1, 0.22], ["case", ["==", ["get", "persistent"], 1], 0.25, 0.85]],
          "circle-stroke-width": ["case", ["==", ["get", "kind"], "only_snpp"], 1, 0],
          "circle-stroke-color": "#fff",
        },
      });
      m.on("click", "events", (ev: MapLayerMouseEvent) => {
        const f = ev.features?.[0];
        if (f) setPicked((window as unknown as { __bsEvents: FireEvent[] }).__bsEvents[f.properties.i as number]);
      });
      m.on("mouseenter", "events", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "events", () => (m.getCanvas().style.cursor = ""));
      setReady(true);
    });
    map.current = m;
    fetch("/data/districts.geojson")
      .then((r) => r.json())
      .then(setDistricts)
      .catch(() => setDistricts(null));
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    setError(null);
    setPicked(null);
    getJSON<DayEvents>(`events/${date}.json`)
      .then((d) => setEvents(toEvents(d)))
      .catch(() => {
        setEvents([]);
        setError("No fire events recorded for this day.");
      });
  }, [date]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (window as unknown as { __bsEvents: FireEvent[] }).__bsEvents = events;
    (m.getSource("events") as GeoJSONSource).setData(toGeoJSON(events, withoutSnpp, inside));
  }, [events, withoutSnpp, ready, inside]);

  // follow the region picker: outline the region and fly to it, or back to the whole country
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const filter = ["in", ["get", "id"], ["literal", districtIds ?? []]] as unknown as maplibregl.FilterSpecification;
    m.setFilter("area-fill", filter);
    m.setFilter("area-line", filter);
    setPicked(null);
    if (focus && !districtIds) {
      m.flyTo({ center: [focus.lon, focus.lat], zoom: 7.5 });
      return;
    }
    const b = districtIds && districts ? boundsOf(districts, new Set(districtIds)) : null;
    m.fitBounds(b ?? PAK_BOUNDS, { padding: 40, maxZoom: 8.5, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, districts, ready, focus?.lat, focus?.lon]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (m.getLayer("gibs")) m.removeLayer("gibs");
    if (m.getSource("gibs")) m.removeSource("gibs");
    setGoogleBase(m, imagery.startsWith("g:") ? imagery.slice(2) : "");
    if (imagery && !imagery.startsWith("g:")) {
      const l = IMAGERY.find((x) => x.id === imagery) as { fixedDate?: string; level?: number; ext?: string } | undefined;
      m.addSource("gibs", { type: "raster", tiles: [GIBS(imagery, l?.fixedDate ?? date, l?.level ?? 9, l?.ext ?? "jpg")], tileSize: 256, maxzoom: l?.level ?? 9, attribution: "Imagery: NASA GIBS" });
      m.addLayer({ id: "gibs", type: "raster", source: "gibs", paint: { "raster-opacity": 0.85 } }, "districts-line");
    }
  }, [imagery, date, ready]);


  const shown = withoutSnpp ? events.filter((e) => e.sats !== "SNPP") : events;
  const onlySnpp = events.filter((e) => e.sats === "SNPP").length;
  const inArea = inside ? shown.filter((e) => e.district !== null && inside.has(e.district)).length : null;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-white">{date}</span>
        {inArea !== null ? (
          <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-200">
            {inArea.toLocaleString()} in {areaName ?? "the selected area"}
          </span>
        ) : null}
        <span className="text-slate-400">
          {shown.length.toLocaleString()} events in Pakistan{withoutSnpp ? ` · ${onlySnpp.toLocaleString()} hidden (only Suomi NPP saw them)` : ` · ${onlySnpp.toLocaleString()} seen only by Suomi NPP`}
        </span>
        <select className="ml-auto rounded bg-slate-800 px-2 py-1 text-xs text-slate-200" value={imagery} onChange={(e) => setImagery(e.target.value)} aria-label="Satellite imagery">
          <option value="">Plain dark map</option>
          {google ? (
            <optgroup label="Google Maps">
              {GOOGLE_KINDS.map((k) => (
                <option key={k.id} value={`g:${k.id}`}>
                  {k.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="NASA imagery">
          {IMAGERY.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} (NASA GIBS)
            </option>
          ))}
          </optgroup>
        </select>
      </div>
      <div ref={box} className="h-[420px] w-full overflow-hidden rounded-lg border border-slate-800" />
      {error ? <p className="mt-2 text-xs text-slate-400">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-200" /> seen by 2+ satellites
        </span>
        {Object.entries(SAT_COLOR).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: c }} /> only {SAT_LABEL[s]}
          </span>
        ))}
        <span>faded = persistent heat source (kiln, industry)</span>
      </div>
      {picked ? (
        <div className="absolute right-2 top-12 z-10 w-72 rounded-lg border border-slate-700 bg-slate-900/95 p-4 text-sm shadow-xl">
          <div className="mb-2 flex items-start justify-between">
            <b className="text-white">Why this event looks like this</b>
            <button className="text-slate-400 hover:text-white" onClick={() => setPicked(null)} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-300">
            <dt className="text-slate-500">District</dt>
            <dd>{picked.district ?? "border buffer"}</dd>
            <dt className="text-slate-500">Seen by</dt>
            <dd>{picked.sats.split(",").map((s) => SAT_LABEL[s] ?? s).join(", ")}</dd>
            <dt className="text-slate-500">Detections</dt>
            <dd>{picked.n_det}</dd>
            <dt className="text-slate-500">Time (PKT)</dt>
            <dd>
              {picked.first_pkt}
              {picked.last_pkt !== picked.first_pkt ? ` to ${picked.last_pkt}` : ""}
            </dd>
            <dt className="text-slate-500">Raw MODIS FRP</dt>
            <dd>{picked.raw_modis_frp} MW</dd>
            <dt className="text-slate-500">Raw VIIRS FRP</dt>
            <dd>{picked.raw_viirs_frp} MW</dd>
            <dt className="text-slate-500">Harmonized FRP</dt>
            <dd className="font-semibold text-orange-300">{picked.frp} MW</dd>
            <dt className="text-slate-500">Confidence</dt>
            <dd>{Math.round(picked.conf * 100)} / 100</dd>
          </dl>
          <p className="mt-2 text-xs text-slate-400">
            Harmonized FRP is on the VIIRS scale: MODIS values are divided by the calibration ratio for their pixel size, and the event keeps its
            strongest single satellite pass so the same fire is never counted twice.
            {picked.persistent ? " Flagged as a persistent heat source, so it is left out of the calendar." : ""}
            {picked.sats === "SNPP" ? " Only Suomi NPP saw this one: after 2 Nov 2026 an event like it goes unrecorded." : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
