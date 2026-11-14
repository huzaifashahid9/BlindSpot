"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { addBasemapPicker, basemap, WORKER_URL } from "@/lib/basemap";
import { fmt, getJSON, Region } from "@/lib/data";
import Term from "@/components/Term";

type Site = { lat: number; lon: number; days: number; months: number; first: number; last: number; years: number; frp: number; smog_last: number; smog_now: number; dist: number };
type IndustryFile = { note: string; rule: { min_days: number; min_months: number }; season_last: number; season_now: number; last_year: number; districts: string[]; sites: Site[] };
type Filter = "all" | "smog" | "now";

const PAK: [number, number, number, number] = [60.8, 23.6, 77.9, 37.1];

/** Year-round hot spots taken out of the burning calendar, shown as their own layer. */
export default function Industry({ region, regions, onPickRegion }: { region: Region; regions: Region[]; onPickRegion: (id: string) => void }) {
  const [data, setData] = useState<IndustryFile | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pick, setPick] = useState<Site | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getJSON<IndustryFile>("industry.json").then(setData).catch(() => setData(null));
  }, []);

  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const distOf = (s: Site) => (data ? byId.get(data.districts[s.dist]) : undefined);
  // sites inside the selected region
  const inRegion = useMemo(() => {
    if (!data) return [] as Site[];
    if (region.level === "country" || region.id === "custom") return data.sites;
    return data.sites.filter((s) => {
      const d = byId.get(data.districts[s.dist]);
      return d && (d.id === region.id || d.parent === region.id);
    });
  }, [data, region, byId]);
  const shown = inRegion.filter((s) => (filter === "smog" ? s.smog_last > 0 : filter === "now" ? data && s.last === data.last_year : true));

  const topDistricts = useMemo(() => {
    if (!data) return [];
    const c = new Map<string, number>();
    data.sites.forEach((s) => {
      const id = data.districts[s.dist];
      if (id) c.set(id, (c.get(id) ?? 0) + 1);
    });
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ id, n, name: byId.get(id)?.name ?? id }));
  }, [data, byId]);

  // map
  useEffect(() => {
    if (!box.current || map.current || !data) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({ container: box.current, style: basemap("dark"), bounds: PAK, fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    addBasemapPicker(m);
    m.on("load", () => {
      m.addSource("ind", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "ind-glow",
        type: "circle",
        source: "ind",
        paint: { "circle-radius": ["*", 2.2, ["get", "r"]], "circle-color": ["get", "c"], "circle-opacity": 0.18, "circle-blur": 0.8 },
      });
      m.addLayer({
        id: "ind",
        type: "circle",
        source: "ind",
        paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-opacity": 0.9, "circle-stroke-color": "#0b0f1a", "circle-stroke-width": 1 },
      });
      m.on("click", "ind", (e: MapLayerMouseEvent) => {
        const k = Number(e.features?.[0]?.properties?.k);
        if (Number.isFinite(k)) setPick(data.sites[k]);
      });
      m.on("mouseenter", "ind", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "ind", () => (m.getCanvas().style.cursor = ""));
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [data]);

  // data on the map follows the filter and region
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !data) return;
    const idx = new Map(data.sites.map((s, i) => [s, i]));
    (m.getSource("ind") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { k: idx.get(s), r: Math.min(14, 3 + Math.sqrt(s.days) / 4), c: s.smog_last > 0 ? "#f43f5e" : "#fbbf24" },
      })),
    });
    if (region.level === "country" || region.id === "custom" || !inRegion.length) m.fitBounds(PAK, { padding: 20, duration: 900 });
    else {
      const lons = inRegion.map((s) => s.lon), lats = inRegion.map((s) => s.lat);
      m.fitBounds([Math.min(...lons) - 0.15, Math.min(...lats) - 0.15, Math.max(...lons) + 0.15, Math.max(...lats) + 0.15], { padding: 40, maxZoom: 10, duration: 1200 });
    }
    setPick(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data, filter, region.id]);

  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-slate-900" />;
  const smogN = inRegion.filter((s) => s.smog_last > 0).length;
  const nowN = inRegion.filter((s) => s.last === data.last_year).length;
  const seasonLabel = `Nov ${data.season_last} to Jan ${data.season_last + 1}`;
  const pd = pick ? distOf(pick) : undefined;

  return (
    <div className="space-y-6">
      <section>
        <p className="hud-label">Industrial heat layer · {region.name}</p>
        <h2 className="mt-1 font-display text-3xl font-semibold text-white">The fires that never go out</h2>
        <p className="mt-2 max-w-4xl text-sm text-slate-400">
          Some hot spots burn all year: the same 1 km spot is hot on {data.rule.min_days}+ days spread across {data.rule.min_months}+ months of the year. Crop burning
          is seasonal, so year-round heat almost always means a <b className="text-slate-200">brick kiln, a gas flare or a factory</b>. BlindSpot takes these out
          of the burning calendar so they do not pose as crop fires, and shows them here instead.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { k: "all" as Filter, n: inRegion.length, l: "year-round hot spots since 2000", c: "border-amber-400/60 text-amber-300" },
          { k: "now" as Filter, n: nowN, l: `still hot in ${data.last_year}`, c: "border-orange-400/60 text-orange-300" },
          { k: "smog" as Filter, n: smogN, l: `hot during the smog season, ${seasonLabel}`, c: "border-rose-400/60 text-rose-300" },
        ].map((x) => (
          <button
            key={x.k}
            onClick={() => setFilter(x.k)}
            className={`hud-card lift p-4 text-left transition ${filter === x.k ? `ring-1 ${x.c.split(" ")[0]} bg-slate-900` : "opacity-80 hover:opacity-100"}`}
          >
            <p className={`font-display text-4xl font-bold ${x.c.split(" ")[1]}`}>{fmt(x.n)}</p>
            <p className="mt-1 text-sm text-slate-300">{x.l}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">{filter === x.k ? "showing on the map" : "tap to show"}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative">
          <div ref={box} className="h-[520px] w-full overflow-hidden rounded-2xl border border-slate-800" />
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-slate-700 bg-slate-950/85 p-3 text-xs text-slate-300 backdrop-blur">
            <p className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" /> hot in the last smog season
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> other year-round hot spots
            </p>
            <p className="mt-1 text-slate-500">bigger = hot on more days · tap a dot</p>
          </div>
          {pick ? (
            <div className="absolute bottom-12 right-3 w-72 rounded-xl border border-amber-400/50 bg-slate-950/95 p-4 text-sm shadow-2xl backdrop-blur [animation:fade-up_0.3s_ease_both]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-300">Year-round hot spot</p>
                  <p className="font-display text-lg font-semibold text-white">{pd?.name ?? "Pakistan"}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {pick.lat.toFixed(3)}, {pick.lon.toFixed(3)}
                  </p>
                </div>
                <button onClick={() => setPick(null)} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-slate-500">Hot on</dt>
                  <dd className="font-mono text-white">{fmt(pick.days)} days</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Months of the year</dt>
                  <dd className="font-mono text-white">{pick.months} of 12</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Seen from / to</dt>
                  <dd className="font-mono text-white">
                    {pick.first} to {pick.last}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">
                    Average <Term k="frp">FRP</Term>
                  </dt>
                  <dd className="font-mono text-white">{pick.frp} MW</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Smog season {seasonLabel}</dt>
                  <dd className="font-mono text-white">{pick.smog_last ? `hot on ${pick.smog_last} days` : "not detected"}</dd>
                </div>
              </dl>
              <a
                href={`https://www.google.com/maps/@${pick.lat},${pick.lon},700m/data=!3m1!1e3`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-400 hover:text-white"
              >
                See this spot on satellite imagery
              </a>
            </div>
          ) : null}
        </div>
        <aside className="space-y-3">
          <div className="hud-card p-4">
            <p className="hud-label">Most year-round hot spots</p>
            <ul className="mt-2 space-y-1">
              {topDistricts.map((d) => (
                <li key={d.id}>
                  <button onClick={() => onPickRegion(d.id)} className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-800 ${region.id === d.id ? "bg-slate-800 text-white" : "text-slate-300"}`}>
                    <span>{d.name}</span>
                    <span className="font-mono text-amber-300">{d.n}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Big industrial cities and oil, gas and cement areas lead the list. Tap a district to zoom in.</p>
          </div>
          <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-4 text-xs leading-relaxed text-slate-300">
            <p className="font-semibold text-sky-300">Why this matters</p>
            <p className="mt-1">
              Punjab restricts brick kilns during smog season. This layer shows which year-round heat sources were still hot from November to January, a starting
              list for inspectors.
            </p>
            <p className="mt-2 text-slate-500">
              A satellite sees heat, not what makes it. These are likely industrial sources, not confirmed violations: check on the ground before acting.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
