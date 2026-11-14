"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { basemap, WORKER_URL } from "@/lib/basemap";

type Props = { lat: number; lon: number; km: number; onPick: (lat: number, lon: number) => void };

function circle(lat: number, lon: number, km: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]);
  }
  return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [pts] }, properties: {} };
}

export default function AreaPicker({ lat, lon, km, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current || map.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({ container: box.current, style: basemap("dark"), center: [lon, lat], zoom: 5.2, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("districts", { type: "geojson", data: "/data/districts.geojson" });
      m.addLayer({ id: "districts-line", type: "line", source: "districts", paint: { "line-color": "#475569", "line-width": 0.6 } });
      m.addSource("area", { type: "geojson", data: circle(lat, lon, km) });
      m.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#f97316", "fill-opacity": 0.15 } });
      m.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#fb923c", "line-width": 2 } });
    });
    m.on("click", (e) => pick.current(Math.round(e.lngLat.lat * 1e4) / 1e4, Math.round(e.lngLat.lng * 1e4) / 1e4));
    m.getCanvas().style.cursor = "crosshair";
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const src = m.getSource("area") as GeoJSONSource | undefined;
    if (src) src.setData(circle(lat, lon, km));
  }, [lat, lon, km]);

  return <div ref={box} className="h-[360px] w-full overflow-hidden rounded-xl border border-slate-800" />;
}
