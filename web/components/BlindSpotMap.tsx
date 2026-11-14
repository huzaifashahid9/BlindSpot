"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { addBasemapPicker, basemap, WORKER_URL } from "@/lib/basemap";
import { fmt, getJSON, pct, Region } from "@/lib/data";

type Props = { regions: Region[]; selectedId?: string; onPick: (id: string) => void };
type BBox = [number, number, number, number];
const PAK: BBox = [60.8, 23.6, 77.9, 37.1];

function bboxOf(g: GeoJSON.Geometry): BBox {
  const b: BBox = [180, 90, -180, -90];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    } else (c as unknown[]).forEach(walk);
  };
  if ("coordinates" in g) walk(g.coordinates);
  return b;
}
const MIN_EVENTS = 200;

/** The blind-spot map: each district coloured by the share of its fires that only Suomi NPP saw. */
export default function BlindSpotMap({ regions, selectedId, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pick = useRef(onPick);
  const [hover, setHover] = useState<{ name: string; share: number | null; events: number } | null>(null);
  const feats = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const marker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<{ name: string; share: number | null; events: number; level: string } | null>(null);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current || map.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({ container: box.current, style: basemap("dark"), center: [69.5, 30.2], zoom: 4.4, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    addBasemapPicker(m);
    const byId = new Map(regions.map((r) => [r.id, r]));
    m.on("load", async () => {
      const fc = await getJSON<GeoJSON.FeatureCollection<GeoJSON.Geometry, { id: string; name: string }>>("districts.geojson");
      const data = {
        ...fc,
        features: fc.features.map((f) => {
          const r = byId.get(f.properties.id);
          const ev = r?.events ?? 0;
          return { ...f, properties: { ...f.properties, share: ev >= MIN_EVENTS ? r?.only_snpp_share ?? -1 : -1, events: ev } };
        }),
      };
      data.features.forEach((f) => feats.current.set(String(f.properties.id), f as unknown as GeoJSON.Feature));
      m.addSource("d", { type: "geojson", data });
      m.addLayer({
        id: "d-fill",
        type: "fill",
        source: "d",
        paint: {
          "fill-color": [
            "case",
            ["<", ["get", "share"], 0],
            "#1e293b",
            ["interpolate", ["linear"], ["get", "share"], 0.12, "#3b0764", 0.18, "#9d174d", 0.22, "#e11d48", 0.26, "#fb7185", 0.3, "#fecdd3"],
          ],
          "fill-opacity": ["case", ["<", ["get", "share"], 0], 0.35, 0.85],
        },
      });
      m.addLayer({ id: "d-line", type: "line", source: "d", paint: { "line-color": "#0f172a", "line-width": 0.6 } });
      m.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "sel-glow", type: "line", source: "sel", paint: { "line-color": "#fb923c", "line-width": 10, "line-blur": 8, "line-opacity": 0.7 } });
      m.addLayer({ id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#fdba74", "line-width": 2.5 } });
      m.addSource("hl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "hl", type: "line", source: "hl", paint: { "line-color": "#fff", "line-width": 2 } });
      m.on("mousemove", "d-fill", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        m.getCanvas().style.cursor = "pointer";
        const p = f.properties as { name: string; share: number; events: number };
        setHover({ name: p.name, share: p.share >= 0 ? p.share : null, events: p.events });
        (m.getSource("hl") as GeoJSONSource).setData({ type: "FeatureCollection", features: [f as unknown as GeoJSON.Feature] });
      });
      m.on("mouseleave", "d-fill", () => {
        m.getCanvas().style.cursor = "";
        setHover(null);
        (m.getSource("hl") as GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
      });
      m.on("click", "d-fill", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) pick.current(String(id));
      });
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [regions]);

  // Fly to whatever region is selected (map click, table, dropdown or search) and label it.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const r = regions.find((x) => x.id === selectedId);
    marker.current?.remove();
    marker.current = null;
    let fs: GeoJSON.Feature[] = [];
    if (r?.level === "district" && feats.current.has(r.id)) fs = [feats.current.get(r.id)!];
    else if (r?.level === "province") fs = regions.filter((x) => x.parent === r.id).map((x) => feats.current.get(x.id)).filter((f): f is GeoJSON.Feature => Boolean(f));
    (m.getSource("sel") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: fs });
    if (!r || !fs.length) {
      setPicked(null);
      m.fitBounds(PAK, { padding: 30, duration: 1200 });
      return;
    }
    const b = fs.map((f) => bboxOf(f.geometry)).reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]);
    m.fitBounds(b, { padding: { top: 90, bottom: 40, left: 40, right: 40 }, maxZoom: 8.5, duration: 1600, essential: true });
    const ev = r.events ?? 0;
    const share = ev >= MIN_EVENTS ? r.only_snpp_share ?? null : null;
    setPicked({ name: r.name, share, events: ev, level: r.level });
    const el = document.createElement("div");
    const tag = document.createElement("div");
    tag.className = "bs-map-label";
    tag.appendChild(document.createElement("span"));
    tag.appendChild(document.createTextNode(r.name));
    el.appendChild(tag);
    const t = setTimeout(() => {
      marker.current = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([(b[0] + b[2]) / 2, b[3]]).addTo(m);
    }, 900);
    return () => clearTimeout(t);
  }, [selectedId, ready, regions]);

  return (
    <div className="relative">
      <div ref={box} className="h-[480px] w-full overflow-hidden rounded-2xl border border-slate-800" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-slate-700 bg-slate-950/85 p-3 text-sm backdrop-blur">
        {hover ? (
          <>
            <p className="font-semibold text-white">{hover.name}</p>
            <p className="font-mono text-rose-300">{hover.share !== null ? `${pct(hover.share)} of fires lost` : "too few fires to say"}</p>
            <p className="text-xs text-slate-400">{fmt(hover.events)} fire events since Nov 2000</p>
          </>
        ) : (
          <p className="text-slate-300">Hover a district · click to zoom in and open it</p>
        )}
      </div>
      {picked ? (
        <div key={picked.name} className="absolute bottom-12 right-3 max-w-[16rem] rounded-xl border border-orange-400/50 bg-slate-950/90 p-3 text-sm shadow-[0_0_30px_-10px_rgba(251,146,60,0.8)] backdrop-blur [animation:fade-up_0.4s_ease_both]">
          <p className="text-[10px] uppercase tracking-wider text-orange-300">{picked.level === "province" ? "Province selected" : "District selected"}</p>
          <p className="font-display text-lg font-semibold text-white">{picked.name}</p>
          <p className="font-mono text-rose-300">{picked.share !== null ? `${pct(picked.share)} of fires only Suomi NPP saw` : "too few fires to say"}</p>
          <p className="text-xs text-slate-400">{fmt(picked.events)} fire events since Nov 2000. The whole dashboard now shows {picked.name}.</p>
          <button onClick={() => pick.current("PAK")} className="mt-2 rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-orange-400 hover:text-white">
            Back to all of Pakistan
          </button>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        share of fires only Suomi NPP saw:
        {[
          ["#3b0764", "12%"],
          ["#9d174d", "18%"],
          ["#e11d48", "22%"],
          ["#fb7185", "26%"],
          ["#fecdd3", "30%+"],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded-sm" style={{ background: c }} />
            {l}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded-sm bg-slate-800" /> fewer than {MIN_EVENTS} fires
        </span>
      </div>
    </div>
  );
}
