"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { basemap, WORKER_URL } from "@/lib/basemap";
import { addDays, fmt } from "@/lib/data";
import { getIndex, getYear, PointsIndex, SNPP_BIT } from "@/lib/points";

// The time-lapse plays the last complete rice-residue burning season on record.
const SEASON = { year: 2025, from: "2025-10-01", to: "2025-12-15" };
const TRAIL = 5; // days a fire stays visible

type Props = { onlySnppShare: number | null; onlySnpp: number | null };

export default function Hero({ onlySnppShare, onlySnpp }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState<PointsIndex | null>(null);
  const [days, setDays] = useState<{ d0: number; n: number; all: number[]; lost: number[] } | null>(null);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [snppOff, setSnppOff] = useState(false);

  // map
  useEffect(() => {
    if (!box.current || map.current) return;
    maplibregl.setWorkerUrl(WORKER_URL);
    const m = new maplibregl.Map({
      container: box.current,
      style: basemap("night"),
      center: [71.2, 30.6],
      zoom: 4.9,
      interactive: false,
      attributionControl: { compact: true },
    });
    m.on("load", () => {
      m.addSource("districts", { type: "geojson", data: "/data/districts.geojson" });
      m.addLayer({ id: "districts-line", type: "line", source: "districts", paint: { "line-color": "#334155", "line-width": 0.4 } });
      m.addSource("fires", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "fires-glow",
        type: "circle",
        source: "fires",
        paint: { "circle-radius": 7, "circle-color": ["case", ["==", ["get", "s"], 1], "#f43f5e", "#f97316"], "circle-blur": 1, "circle-opacity": 0 },
      });
      m.addLayer({
        id: "fires",
        type: "circle",
        source: "fires",
        paint: { "circle-radius": 1.8, "circle-color": ["case", ["==", ["get", "s"], 1], "#fda4af", "#fed7aa"], "circle-opacity": 0 },
      });
      setReady(true);
    });
    const fit = () => m.fitBounds([[61, 24], [78, 36.5]], { padding: { top: 20, bottom: 20, left: window.innerWidth > 900 ? window.innerWidth * 0.38 : 10, right: 10 }, duration: 0 });
    m.once("load", fit);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // data
  useEffect(() => {
    Promise.all([getIndex(), getYear(SEASON.year)]).then(([ix, p]) => {
      setIdx(ix);
      const d0 = Math.round((Date.parse(SEASON.from) - Date.parse(ix.start)) / 864e5);
      const d1 = Math.round((Date.parse(SEASON.to) - Date.parse(ix.start)) / 864e5);
      const n = d1 - d0 + 1;
      const all = new Array(n).fill(0), lost = new Array(n).fill(0);
      const feats: GeoJSON.Feature<GeoJSON.Point, { d: number; s: number }>[] = [];
      for (let i = 0; i < p.n; i++) {
        const d = p.day[i];
        if (d < d0 || d > d1 || p.pers[i] || p.dist[i] < 0) continue;
        const s = p.sats[i] === SNPP_BIT ? 1 : 0;
        all[d - d0]++;
        lost[d - d0] += s;
        feats.push({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lon[i] / ix.scale.lon, p.lat[i] / ix.scale.lat] }, properties: { d: d - d0, s } });
      }
      setDays({ d0, n, all, lost });
      const set = () => (map.current?.getSource("fires") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
      if (map.current?.getSource("fires")) set();
      else map.current?.once("load", () => setTimeout(set, 0));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) setCur(n - 1);
      else setPlaying(true);
    });
  }, []);

  // animation clock
  useEffect(() => {
    if (!playing || !days) return;
    const t = setInterval(() => {
      setCur((c) => {
        if (c >= days.n - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 140);
    return () => clearInterval(t);
  }, [playing, days]);

  // draw the current frame
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("fires")) return;
    const filter = ["all", ["<=", ["get", "d"], cur], [">", ["get", "d"], cur - TRAIL], ...(snppOff ? [["!=", ["get", "s"], 1]] : [])] as unknown as maplibregl.FilterSpecification;
    const fade = ["interpolate", ["linear"], ["get", "d"], cur - TRAIL, 0, cur, 1] as unknown as maplibregl.ExpressionSpecification;
    m.setFilter("fires", filter);
    m.setFilter("fires-glow", filter);
    m.setPaintProperty("fires", "circle-opacity", fade);
    m.setPaintProperty("fires-glow", "circle-opacity", ["*", 0.35, fade] as unknown as maplibregl.ExpressionSpecification);
  }, [cur, snppOff, ready]);

  const totals = useMemo(() => {
    if (!days) return { all: 0, lost: 0 };
    let all = 0, lost = 0;
    for (let i = 0; i <= cur; i++) {
      all += days.all[i];
      lost += days.lost[i];
    }
    return { all, lost };
  }, [days, cur]);

  const date = idx && days ? addDays(idx.start, days.d0 + cur) : SEASON.from;
  const shown = snppOff ? totals.all - totals.lost : totals.all;
  const nice = new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <section className="relative isolate -mx-4 overflow-hidden border-b border-slate-800 md:mx-0 md:rounded-b-3xl">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <div ref={box} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#05070d] via-[#05070d]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[#05070d] to-transparent" />

      <div className="flex min-h-[86vh] flex-col justify-between gap-10 px-4 py-8 md:px-10 md:py-12">
        <div className="max-w-xl">
          <p className="hud-label text-orange-300/90">NASA Space Apps 2026 · Harmonization of MODIS and VIIRS hot spots</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl">
            One fire record.
            <br />
            <span className="bg-gradient-to-r from-orange-300 via-orange-500 to-rose-500 bg-clip-text text-transparent">Five satellites.</span>
            <br />
            One just went dark.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            BlindSpot fuses MODIS and VIIRS hot spots into one consistent burning calendar for every district of Pakistan, and measures what the record
            lost when NASA&apos;s Suomi NPP stopped on <b className="text-white">2 November 2026</b>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#explore" className="btn-primary">
              Open the burning calendar ↓
            </a>
            <a href="#ask" className="btn-ghost">
              Ask the data
            </a>
          </div>
        </div>

        <div className="grid max-w-3xl gap-3 sm:grid-cols-[1.2fr_1fr]">
          <div className="hud-card bg-slate-950/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="hud-label">Rice-residue season, Pakistan</p>
              <button
                onClick={() => {
                  if (days && cur >= days.n - 1) setCur(0);
                  setPlaying(!playing);
                }}
                className="rounded-md border border-slate-700 px-2 py-0.5 font-mono text-xs text-slate-300 hover:bg-slate-800"
                aria-label={playing ? "Pause time-lapse" : "Play time-lapse"}
              >
                {playing ? "❚❚ pause" : "▶ play"}
              </button>
            </div>
            <p className="mt-1 font-mono text-2xl text-white">{nice}</p>
            <input
              type="range"
              min={0}
              max={days ? days.n - 1 : 0}
              value={cur}
              onChange={(e) => {
                setPlaying(false);
                setCur(Number(e.target.value));
              }}
              className="mt-2 w-full accent-orange-500"
              aria-label="Day of the season"
            />
            <p className="mt-1 text-sm text-slate-300">
              <span className="font-mono text-xl font-semibold text-orange-300">{fmt(shown)}</span> fires recorded since 1 Oct
              {snppOff ? (
                <span className="block font-mono text-rose-300">−{fmt(totals.lost)} fires no other satellite saw</span>
              ) : null}
            </p>
          </div>
          <button
            onClick={() => setSnppOff(!snppOff)}
            className={`group rounded-2xl border p-4 text-left transition ${
              snppOff ? "border-rose-400 bg-rose-500/20 shadow-[0_0_40px_-8px_rgba(244,63,94,0.7)]" : "border-rose-500/50 bg-slate-950/70 hover:bg-rose-500/10"
            } backdrop-blur`}
          >
            <p className="hud-label text-rose-300">{snppOff ? "Suomi NPP is off" : "Try it"}</p>
            <p className="mt-1 font-display text-xl font-semibold text-white">{snppOff ? "This is the record from now on" : "Switch off Suomi NPP"}</p>
            <p className="mt-1 text-sm text-slate-300">
              {snppOff ? (
                <>
                  <b className="text-rose-200">{onlySnppShare !== null ? `${(onlySnppShare * 100).toFixed(1)}%` : "1 in 5"}</b> of Pakistan&apos;s fire events
                  {onlySnpp ? ` (${fmt(onlySnpp)} since Nov 2023)` : ""} were seen by no other satellite.
                </>
              ) : (
                "Watch which fires disappear when the satellite that stopped on 2 Nov 2026 is taken out."
              )}
            </p>
          </button>
        </div>
      </div>
    </section>
  );
}
