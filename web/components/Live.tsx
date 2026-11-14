"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { addBasemapPicker, basemap, WORKER_URL } from "@/lib/basemap";
import { fmt, getJSON, HarmonizationFile, Region, SAT_COLOR } from "@/lib/data";
import { bbox, fuse, inPoly, LiveFile } from "@/lib/live";

type Baseline = { years: [number, number]; regions: Record<string, { median: number[]; p90: number[] }> };
type DistrictFC = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; name: string; province?: string }>;

const SAT_KEYS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"];
const NOW_KEY = "Terra,Aqua,NOAA20,NOAA21";

type Props = { regions: Region[]; onPickRegion: (id: string) => void };

export default function Live({ regions, onPickRegion }: Props) {
  const [live, setLive] = useState<LiveFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [districts, setDistricts] = useState<DistrictFC | null>(null);
  const [base, setBase] = useState<Baseline | null>(null);
  const [harm, setHarm] = useState<HarmonizationFile & { factors_national?: Record<string, Record<string, number>> } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/live")
      .then(async (r) => {
        const j = (await r.json()) as LiveFile;
        if (!r.ok || j.error) setErr(j.error ?? `HTTP ${r.status}`);
        else setLive(j);
      })
      .catch((e) => setErr(String(e)));
    getJSON<DistrictFC>("districts.geojson").then(setDistricts);
    getJSON<Baseline>("baseline.json").then(setBase);
    getJSON<HarmonizationFile>("harmonization.json").then(setHarm);
  }, []);

  const result = useMemo(() => {
    if (!live || !districts || !base) return null;
    const nowMin = Date.parse(live.updated) / 60000;
    const recent = live.fires.filter((f) => f[2] >= nowMin - 1440);
    const events = fuse(recent);
    const polys = districts.features.map((f) => ({ f, b: bbox(f.geometry) }));
    const byDist = new Map<string, number>();
    const inside: typeof events = [];
    const assigned = events.map((e) => {
      const hit = polys.find(({ f, b }) => e.lon >= b[0] && e.lon <= b[2] && e.lat >= b[1] && e.lat <= b[3] && inPoly(e.lon, e.lat, f.geometry));
      if (hit) {
        byDist.set(hit.f.properties.id, (byDist.get(hit.f.properties.id) ?? 0) + 1);
        inside.push(e);
      }
      return { ...e, district: hit?.f.properties.id ?? null };
    });
    // day of year in Pakistan time
    const pk = new Date(Date.parse(live.updated) + 5 * 3600e3);
    const doy = Math.floor((pk.getTime() - Date.UTC(pk.getUTCFullYear(), 0, 1)) / 864e5) + 1;
    const month = pk.getUTCMonth() + 1;
    const k = harm?.factors_national?.[NOW_KEY]?.[String(month)] ?? 1.29;
    const rows = districts.features
      .map((f) => {
        const id = f.properties.id;
        const n = byDist.get(id) ?? 0;
        const b = base.regions[id];
        const med = b ? b.median[doy - 1] : 0, p90 = b ? b.p90[doy - 1] : 0;
        const est = n * k;
        const ratio = med > 0 ? est / med : n > 0 ? Infinity : 0;
        const level = n >= 5 && est > p90 && est >= 2 * Math.max(med, 1) ? "alert" : n >= 3 && est > p90 ? "above" : "normal";
        return { id, name: f.properties.name, province: f.properties.province ?? "", n, est, med, p90, ratio, level };
      })
      .sort((a, b) => (b.level === "alert" ? 2 : b.level === "above" ? 1 : 0) - (a.level === "alert" ? 2 : a.level === "above" ? 1 : 0) || b.est - a.est);
    const nat = base.regions.PAK;
    const natEst = inside.length * k;
    return {
      events: assigned,
      inside: inside.length,
      raw: recent.length,
      k,
      natEst,
      natMed: nat?.median[doy - 1] ?? 0,
      natP90: nat?.p90[doy - 1] ?? 0,
      rows,
      alerts: rows.filter((r) => r.level === "alert").length,
      above: rows.filter((r) => r.level !== "normal").length,
    };
  }, [live, districts, base, harm]);

  // map
  useEffect(() => {
    if (!box.current || map.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({ container: box.current, style: basemap("night"), center: [70.5, 30.2], zoom: 4.6, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    addBasemapPicker(m);
    m.on("load", () => {
      m.addSource("d", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "d-fill",
        type: "fill",
        source: "d",
        paint: {
          "fill-color": ["match", ["get", "level"], "alert", "#ef4444", "above", "#f59e0b", "#0f172a"],
          "fill-opacity": ["match", ["get", "level"], "alert", 0.45, "above", 0.3, 0.05],
        },
      });
      m.addLayer({ id: "d-line", type: "line", source: "d", paint: { "line-color": "#334155", "line-width": 0.5 } });
      m.addSource("f", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "f-glow", type: "circle", source: "f", paint: { "circle-radius": 8, "circle-color": "#f97316", "circle-blur": 1, "circle-opacity": 0.35 } });
      m.addLayer({ id: "f", type: "circle", source: "f", paint: { "circle-radius": 2.4, "circle-color": ["get", "c"], "circle-opacity": 0.95 } });
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !result || !districts) return;
    const lv = new Map(result.rows.map((r) => [r.id, r.level]));
    (m.getSource("d") as GeoJSONSource).setData({
      ...districts,
      features: districts.features.map((f) => ({ ...f, properties: { ...f.properties, level: lv.get(f.properties.id) ?? "normal" } })),
    });
    (m.getSource("f") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: result.events.map((e) => {
        const sats = SAT_KEYS.filter((_, b) => e.sats & (1 << b));
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
          properties: { c: sats.length > 1 ? "#f8fafc" : SAT_COLOR[sats[0]] ?? "#f97316" },
        };
      }),
    });
  }, [ready, result, districts]);

  const updated = live ? new Date(live.updated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" }) : "";
  const ratio = result && result.natMed > 0 ? result.natEst / result.natMed : null;

  return (
    <div className="space-y-6">
      <section className="hud-card relative overflow-hidden p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 font-mono text-xs font-semibold tracking-widest text-red-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>
          <p className="hud-label">NASA FIRMS near real time · last 24 hours · Terra, Aqua, NOAA-20, NOAA-21</p>
          {live ? <p className="ml-auto font-mono text-xs text-slate-400">updated {updated} PKT</p> : null}
        </div>
        {err ? (
          <p className="mt-4 text-amber-300">{err}</p>
        ) : !result ? (
          <p className="mt-4 animate-pulse text-slate-400">Fetching today&apos;s fires from NASA FIRMS…</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div>
              <p className="hud-label">Fire events, last 24 h</p>
              <p className="font-display text-4xl font-bold text-white">{fmt(result.inside)}</p>
              <p className="text-xs text-slate-500">
                from {fmt(result.raw)} detections · ≈ {fmt(Math.round(result.natEst))} on the harmonized scale
              </p>
            </div>
            <div>
              <p className="hud-label">Vs normal for this week</p>
              <p className={`font-display text-4xl font-bold ${ratio !== null && ratio >= 1.5 ? "text-red-300" : ratio !== null && ratio >= 1 ? "text-amber-300" : "text-emerald-300"}`}>
                {ratio !== null ? `${ratio.toFixed(1)}×` : "n/a"}
              </p>
              <p className="text-xs text-slate-500">median {fmt(Math.round(result.natMed))} per day at this time of year</p>
            </div>
            <div>
              <p className="hud-label">Districts on alert</p>
              <p className="font-display text-4xl font-bold text-red-300">{result.alerts}</p>
              <p className="text-xs text-slate-500">5+ fires, 2× normal and above their 90th percentile</p>
            </div>
            <div>
              <p className="hud-label">Above normal</p>
              <p className="font-display text-4xl font-bold text-amber-300">{result.above}</p>
              <p className="text-xs text-slate-500">above their 90th percentile for this week</p>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div ref={box} className="h-[520px] w-full overflow-hidden rounded-2xl border border-slate-800" />
        <div className="hud-card max-h-[520px] overflow-y-auto p-4">
          <p className="hud-label">Districts, today vs their own history</p>
          <ol className="mt-3 space-y-1 text-sm">
            {result?.rows
              .filter((r) => r.n > 0)
              .slice(0, 40)
              .map((r) => (
                <li key={r.id}>
                  <button onClick={() => onPickRegion(r.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800">
                    <span
                      className={`w-16 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold uppercase ${
                        r.level === "alert" ? "bg-red-500/25 text-red-200" : r.level === "above" ? "bg-amber-500/20 text-amber-200" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {r.level}
                    </span>
                    <span className="flex-1 truncate text-slate-200">
                      {r.name} <span className="text-xs text-slate-500">{r.province}</span>
                    </span>
                    <span className="font-mono text-white">{r.n}</span>
                    <span className="w-16 text-right font-mono text-xs text-slate-400">{Number.isFinite(r.ratio) ? `${r.ratio.toFixed(1)}×` : "new"}</span>
                  </button>
                </li>
              ))}
            {result && result.rows.every((r) => r.n === 0) ? <li className="text-slate-400">No fires detected in Pakistan in the last 24 hours.</li> : null}
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Normal = median and 90th percentile of harmonized daily fire events for the same ±7 days in {regions.length ? "every year on record" : ""}. Today&apos;s count
            is scaled by {result ? result.k.toFixed(2) : "1.3"} to the five-satellite scale, since Suomi NPP is gone. Click a district to open its calendar.
          </p>
        </div>
      </section>
    </div>
  );
}
