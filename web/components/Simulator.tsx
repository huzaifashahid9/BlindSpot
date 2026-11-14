"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, fmt, Region } from "@/lib/data";
import { Area, districtSet, getIndex, loadYears, PointsIndex, PointsYear, select, unusualFlags } from "@/lib/points";

const SATS = [
  { bit: 1, name: "Terra", kind: "MODIS", since: 1999, note: "launched 1999, drifting to a later orbit" },
  { bit: 2, name: "Aqua", kind: "MODIS", since: 2002, note: "launched 2002, far past its 6-year design life" },
  { bit: 4, name: "Suomi NPP", kind: "VIIRS", since: 2011, note: "stopped on 2 Nov 2026" },
  { bit: 8, name: "NOAA-20", kind: "VIIRS", since: 2017, note: "operational" },
  { bit: 16, name: "NOAA-21", kind: "VIIRS", since: 2022, note: "operational" },
];
const PRESETS = [
  { label: "All five flying", off: 0 },
  { label: "Today: Suomi NPP gone", off: 4 },
  { label: "Terra and Aqua retire too", off: 1 | 2 | 4 },
  { label: "MODIS only, the 2000s record", off: 4 | 8 | 16 },
  { label: "One satellite left: NOAA-21", off: 1 | 2 | 4 | 8 },
];
const BBOX = { x0: 60.8, x1: 77.9, y0: 23.6, y1: 37.1 };

type Circle = { lat: number; lon: number; km: number };
type Props = { region: Region | null; regions: Region[]; custom: Circle | null; from: string; to: string; areaName: string };
type Pts = { sats: Uint8Array; day: Uint16Array; dist: Int16Array; lat: Float32Array; lon: Float32Array; frp: Float32Array; n: number; d0: number; days: number };

function gather(years: PointsYear[], idx: PointsIndex, area: Area, from: string, to: string): Pts {
  const d0 = Math.round((Date.parse(from) - Date.parse(idx.start)) / 864e5);
  const d1 = Math.round((Date.parse(to) - Date.parse(idx.start)) / 864e5);
  const keep: [PointsYear, number][] = [];
  for (const p of years) for (const i of select(p, area, idx.scale, d0, d1)) if (!p.pers[i]) keep.push([p, i]);
  const n = keep.length;
  const out: Pts = { sats: new Uint8Array(n), day: new Uint16Array(n), dist: new Int16Array(n), lat: new Float32Array(n), lon: new Float32Array(n), frp: new Float32Array(n), n, d0, days: d1 - d0 + 1 };
  keep.forEach(([p, i], k) => {
    out.sats[k] = p.sats[i];
    out.day[k] = p.day[i] - d0;
    out.dist[k] = p.dist[i];
    out.lat[k] = p.lat[i] / idx.scale.lat;
    out.lon[k] = p.lon[i] / idx.scale.lon;
    out.frp[k] = p.frp[i] / idx.scale.frp;
  });
  return out;
}

export default function Simulator({ region, regions, custom, from, to, areaName }: Props) {
  const [idx, setIdx] = useState<PointsIndex | null>(null);
  const [years, setYears] = useState<PointsYear[] | null>(null);
  const [off, setOff] = useState(4);
  const [outline, setOutline] = useState<number[][][] | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getIndex().then(async (ix) => {
      setIdx(ix);
      setYears(await loadYears(ix.years));
    });
    fetch("/data/districts.geojson")
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection) => {
        const rings: number[][][] = [];
        for (const f of g.features) {
          const geom = f.geometry;
          if (geom.type === "Polygon") rings.push(...(geom.coordinates as number[][][]));
          else if (geom.type === "MultiPolygon") (geom.coordinates as number[][][][]).forEach((p) => rings.push(...p));
        }
        setOutline(rings);
      })
      .catch(() => setOutline(null));
  }, []);

  const pts = useMemo(() => {
    if (!idx || !years) return null;
    const area: Area = custom
      ? { kind: "circle", ...custom }
      : { kind: "region", region: region!, districtIdx: region ? districtSet(region, regions, idx) : null };
    if (!custom && !region) return null;
    return gather(years, idx, area, from, to);
  }, [idx, years, region, regions, custom, from, to]);

  // full record: daily counts and unusual days, computed once per area
  const base = useMemo(() => {
    if (!pts) return null;
    const daily = new Array(pts.days).fill(0);
    let frp = 0;
    for (let k = 0; k < pts.n; k++) {
      daily[pts.day[k]]++;
      frp += pts.frp[k];
    }
    return { daily, frp, unusual: unusualFlags(from, daily, daily).flags };
  }, [pts, from]);

  const sim = useMemo(() => {
    if (!pts || !base || !idx) return null;
    const alive = 31 & ~off;
    const daily = new Array(pts.days).fill(0);
    let lost = 0, frpLost = 0;
    const byDist = new Map<number, { all: number; lost: number }>();
    for (let k = 0; k < pts.n; k++) {
      const gone = (pts.sats[k] & alive) === 0;
      if (gone) {
        lost++;
        frpLost += pts.frp[k];
      } else daily[pts.day[k]]++;
      const d = byDist.get(pts.dist[k]) ?? { all: 0, lost: 0 };
      d.all++;
      if (gone) d.lost++;
      byDist.set(pts.dist[k], d);
    }
    const u = unusualFlags(from, daily, daily).flags;
    let unusual = 0, missed = 0;
    base.unusual.forEach((f: number, i: number) => {
      if (f) {
        unusual++;
        if (!u[i]) missed++;
      }
    });
    // the worst single day: the most fires that would have gone unrecorded
    let worst = 0;
    for (let i = 1; i < pts.days; i++) if (base.daily[i] - daily[i] > base.daily[worst] - daily[worst]) worst = i;
    const names = Object.fromEntries(regions.map((r) => [r.id, r.name]));
    const districts = [...byDist.entries()]
      .filter(([d, v]) => d >= 0 && v.all >= 150)
      .map(([d, v]) => ({ name: names[idx.districts[d]] ?? "?", all: v.all, lost: v.lost, share: v.lost / v.all }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 8);
    return {
      lost,
      share: pts.n ? lost / pts.n : 0,
      frpShare: base.frp ? frpLost / base.frp : 0,
      unusual,
      missed,
      daily,
      worst: { date: addDays(from, worst), lost: base.daily[worst] - daily[worst], all: base.daily[worst] },
      districts,
      alive,
    };
  }, [pts, base, off, idx, regions, from]);

  // draw every fire event: kept in dim amber, lost in bright rose
  useEffect(() => {
    const c = canvas.current;
    if (!c || !pts || !sim) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    const s = Math.min(W / (BBOX.x1 - BBOX.x0), H / ((BBOX.y1 - BBOX.y0) * 1.15));
    const ox = (W - (BBOX.x1 - BBOX.x0) * s) / 2, oy = (H - (BBOX.y1 - BBOX.y0) * 1.15 * s) / 2;
    const X = (lon: number) => ox + (lon - BBOX.x0) * s;
    const Y = (lat: number) => oy + (BBOX.y1 - lat) * 1.15 * s;
    if (outline) {
      g.strokeStyle = "rgba(100,116,139,0.35)";
      g.lineWidth = 0.6;
      for (const ring of outline) {
        g.beginPath();
        ring.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
    }
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(251,146,60,0.07)";
    for (let k = 0; k < pts.n; k++) if (pts.sats[k] & sim.alive) g.fillRect(X(pts.lon[k]) - 0.7, Y(pts.lat[k]) - 0.7, 1.4, 1.4);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(244,63,94,0.2)";
    for (let k = 0; k < pts.n; k++) if (!(pts.sats[k] & sim.alive)) g.fillRect(X(pts.lon[k]) - 0.8, Y(pts.lat[k]) - 0.8, 1.6, 1.6);
    g.globalCompositeOperation = "source-over";
  }, [pts, sim, outline]);

  const toggle = (bit: number) => setOff((o) => (o ^ bit) === 31 ? o : o ^ bit);
  const level = sim ? (sim.share >= 0.5 ? "text-rose-300" : sim.share >= 0.15 ? "text-amber-300" : "text-emerald-300") : "";

  return (
    <section className="space-y-5">
      <div>
        <p className="hud-label">Satellite failure simulator · {areaName}</p>
        <h2 className="mt-1 font-display text-3xl font-semibold text-white">Switch satellites off. Watch the fire record disappear.</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Every fire event from {from} to {to}, when all five satellites flew, carries the list of satellites that saw it. Turn any of them off and BlindSpot
          recounts, in your browser, which fires no remaining satellite would have recorded, and which unusual burning days would no longer stand out.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {SATS.map((s) => {
          const on = !(off & s.bit);
          return (
            <button
              key={s.bit}
              onClick={() => toggle(s.bit)}
              aria-pressed={on}
              className={`rounded-xl border p-3 text-left transition ${
                on ? "border-slate-700 bg-slate-900/70 hover:border-slate-500" : "border-rose-500/60 bg-rose-500/10 shadow-[0_0_30px_-10px_rgba(244,63,94,0.8)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-widest text-slate-500">{s.kind}</span>
                <span className={`relative h-4 w-7 rounded-full transition ${on ? "bg-emerald-500/70" : "bg-slate-700"}`}>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
                </span>
              </div>
              <p className={`mt-1 font-display text-lg font-semibold ${on ? "text-white" : "text-rose-200 line-through decoration-rose-400/60"}`}>{s.name}</p>
              <p className="text-xs text-slate-500">{s.note}</p>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setOff(p.off)}
            className={`rounded-full border px-3 py-1 text-xs transition ${off === p.off ? "border-orange-400 bg-orange-500/15 text-orange-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!sim ? (
        <div className="h-80 animate-pulse rounded-2xl bg-slate-900" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="hud-card relative overflow-hidden p-0">
            <canvas ref={canvas} className="h-[440px] w-full" aria-label="Map of fire events kept and lost" role="img" />
            <div className="pointer-events-none absolute left-4 top-4 text-xs text-slate-400">
              <p>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-400/60 align-middle" /> still recorded
              </p>
              <p>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" /> lost: no remaining satellite saw it
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="hud-card p-4">
              <p className="text-xs text-slate-500">Fire events that vanish from the record</p>
              <p className={`font-display text-5xl font-bold ${level}`}>{(sim.share * 100).toFixed(1)}%</p>
              <p className="text-sm text-slate-400">
                {fmt(sim.lost)} of {fmt(pts!.n)} events, and {(sim.frpShare * 100).toFixed(1)}% of the fire energy (FRP)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="hud-card p-4">
                <p className="text-xs text-slate-500">Unusual days missed</p>
                <p className="font-display text-3xl font-bold text-white">
                  {sim.missed}
                  <span className="text-base text-slate-500"> / {sim.unusual}</span>
                </p>
                <p className="text-xs text-slate-500">alerts that would no longer fire</p>
              </div>
              <div className="hud-card p-4">
                <p className="text-xs text-slate-500">Worst single day</p>
                <p className="font-display text-3xl font-bold text-white">{fmt(sim.worst.lost)}</p>
                <p className="text-xs text-slate-500">
                  fires unrecorded on {sim.worst.date} (of {fmt(sim.worst.all)})
                </p>
              </div>
            </div>
            {sim.districts.length && !custom && region?.level !== "district" ? (
              <div className="hud-card p-4">
                <p className="mb-2 text-xs text-slate-500">Hardest-hit districts (150+ events)</p>
                <ul className="space-y-1.5">
                  {sim.districts.map((d) => (
                    <li key={d.name} className="text-sm">
                      <div className="flex justify-between text-slate-300">
                        <span>{d.name}</span>
                        <span className="font-mono text-rose-300">{(d.share * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded bg-slate-800">
                        <div className="h-1 rounded bg-gradient-to-r from-orange-500 to-rose-500" style={{ width: `${Math.max(2, d.share * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {sim && base ? <Strip full={base.daily} kept={sim.daily} from={from} /> : null}
    </section>
  );
}

/** Weekly fire events, full record against what the remaining satellites would have caught. */
function Strip({ full, kept, from }: { full: number[]; kept: number[]; from: string }) {
  const wk = (a: number[]) => Array.from({ length: Math.ceil(a.length / 7) }, (_, i) => a.slice(i * 7, i * 7 + 7).reduce((x, y) => x + y, 0));
  const F = wk(full), K = wk(kept);
  const max = Math.max(1, ...F);
  const W = 900, H = 120;
  const x = (i: number) => (i / Math.max(1, F.length - 1)) * W;
  const area = (a: number[]) => `M0,${H} ${a.map((v, i) => `L${x(i)},${H - (v / max) * H}`).join(" ")} L${W},${H} Z`;
  return (
    <div className="hud-card p-4">
      <p className="mb-2 text-xs text-slate-500">Weekly fire events: the full record (rose) and what the remaining satellites would have recorded (amber)</p>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Weekly fire events, full and simulated">
        <path d={area(F)} fill="#f43f5e" opacity={0.35} />
        <path d={area(K)} fill="#fb923c" opacity={0.85} />
        {F.map((_, i) => {
          const d = addDays(from, i * 7);
          return d.slice(5, 7) === "01" && Number(d.slice(8)) <= 7 ? (
            <text key={i} x={x(i)} y={H + 14} fontSize={11} fill="#64748b">
              {d.slice(0, 4)}
            </text>
          ) : null;
        })}
      </svg>
    </div>
  );
}
