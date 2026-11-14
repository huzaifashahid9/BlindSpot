"use client";

import * as maplibregl from "maplibre-gl";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { googleAvailable, setGoogleBase, WORKER_URL } from "@/lib/basemap";

/** A small satellite map of one spot, inside the page. Google satellite when the server has a key, Esri imagery otherwise. */
export default function SatelliteView({ lat, lon, className = "h-44" }: { lat: number; lon: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);

  useEffect(() => {
    if (!box.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({
      container: box.current,
      center: [lon, lat],
      zoom: 14.3,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Imagery © Esri",
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#05070d" } },
          { id: "base", type: "raster", source: "base" },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      // the 1 km cell the heat was found in
      const h = 0.005;
      m.addSource("cell", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]] },
        },
      });
      m.addLayer({ id: "cell", type: "line", source: "cell", paint: { "line-color": "#fbbf24", "line-width": 2, "line-dasharray": [2, 1] } });
      googleAvailable().then((ok) => {
        if (ok && map.current === m) setGoogleBase(m, "hybrid");
      });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [lat, lon]);

  return <div ref={box} className={`w-full overflow-hidden rounded-lg border border-slate-700 ${className}`} />;
}
