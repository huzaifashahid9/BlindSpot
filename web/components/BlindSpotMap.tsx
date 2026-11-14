"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { basemap, WORKER_URL } from "@/lib/basemap";
import { fmt, getJSON, pct, Region } from "@/lib/data";

type Props = { regions: Region[]; onPick: (id: string) => void };
const MIN_EVENTS = 200;

/** The blind-spot map: each district coloured by the share of its fires that only Suomi NPP saw. */
export default function BlindSpotMap({ regions, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pick = useRef(onPick);
  const [hover, setHover] = useState<{ name: string; share: number | null; events: number } | null>(null);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current || map.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({ container: box.current, style: basemap("dark"), center: [69.5, 30.2], zoom: 4.4, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [regions]);

  return (
    <div className="relative">
      <div ref={box} className="h-[480px] w-full overflow-hidden rounded-2xl border border-slate-800" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-slate-700 bg-slate-950/85 p-3 text-sm backdrop-blur">
        {hover ? (
          <>
            <p className="font-semibold text-white">{hover.name}</p>
            <p className="font-mono text-rose-300">{hover.share !== null ? `${pct(hover.share)} of fires lost` : "too few fires to say"}</p>
            <p className="text-xs text-slate-400">{fmt(hover.events)} fire events, Nov 2023 to Nov 2026</p>
          </>
        ) : (
          <p className="text-slate-300">Hover a district · click to open it</p>
        )}
      </div>
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
