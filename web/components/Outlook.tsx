"use client";

import { useMemo } from "react";
import { addDays, CalendarFile, fmt } from "@/lib/data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEASONS = [
  { name: "Wheat-residue season", m0: 3, m1: 6 },
  { name: "Rice-residue season", m0: 9, m1: 12 },
];
const HORIZON = 14;

function q(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
}
const doyOf = (d: string) => Math.floor((Date.parse(d) - Date.UTC(Number(d.slice(0, 4)), 0, 1)) / 864e5) + 1;
const dateOfDoy = (y: number, doy: number) => new Date(Date.UTC(y, 0, doy)).toISOString().slice(0, 10);

/** Climatology from the region's own history: what usually happens next, and where today sits in the season. */
export function computeOutlook(cal: CalendarFile) {
  const v = cal.events_h ?? cal.events;
  const last = addDays(cal.start, cal.days - 1);
  const ly = Number(last.slice(0, 4));
  const today = doyOf(last);
  const byDoy: number[][] = Array.from({ length: 367 }, () => []);
  const thisYear: (number | null)[] = new Array(367).fill(null);
  for (let i = 0; i < cal.days; i++) {
    const d = addDays(cal.start, i);
    const k = doyOf(d);
    if (Number(d.slice(0, 4)) === ly) thisYear[k] = v[i];
    else byDoy[k].push(v[i]);
  }
  // smooth with +-7 days, as everywhere else on the site
  const med: number[] = new Array(367).fill(0), lo: number[] = new Array(367).fill(0), hi: number[] = new Array(367).fill(0);
  for (let d = 1; d <= 366; d++) {
    const pool: number[] = [];
    for (let k = -7; k <= 7; k++) pool.push(...byDoy[((d + k - 1 + 366) % 366) + 1]);
    med[d] = q(pool, 0.5);
    lo[d] = q(pool, 0.1);
    hi[d] = q(pool, 0.9);
  }
  const yearsBack = new Set<number>();
  for (let i = 0; i < cal.days; i++) {
    const y = Number(addDays(cal.start, i).slice(0, 4));
    if (y !== ly) yearsBack.add(y);
  }
  const next = Array.from({ length: HORIZON }, (_, k) => ((today + k) % 366) + 1);
  const exp = next.reduce((a, d) => a + med[d], 0);
  const expLo = next.reduce((a, d) => a + lo[d], 0);
  const expHi = next.reduce((a, d) => a + hi[d], 0);

  // last 14 days vs normal
  let recent = 0, recentNorm = 0;
  for (let k = 0; k < HORIZON; k++) {
    const d = ((today - k - 1 + 366) % 366) + 1;
    recent += thisYear[d] ?? 0;
    recentNorm += med[d];
  }

  const month = Number(last.slice(5, 7));
  const season = SEASONS.find((s) => month >= s.m0 && month <= s.m1) ?? SEASONS.find((s) => s.m0 > month) ?? SEASONS[0];
  const sd0 = doyOf(`${ly}-${String(season.m0).padStart(2, "0")}-01`);
  const sd1 = doyOf(new Date(Date.UTC(ly, season.m1, 0)).toISOString().slice(0, 10)); // last day of the season's final month
  let tot = 0, done = 0, peak = sd0;
  for (let d = sd0; d <= Math.min(366, sd1); d++) {
    tot += med[d];
    if (d <= today) done += med[d];
    if (med[d] > med[peak]) peak = d;
  }
  const inSeason = today >= sd0 && today <= sd1;
  return {
    last, ly, today, med, lo, hi, thisYear, exp, expLo, expHi, recent, recentNorm,
    season: season.name, inSeason, shareDone: tot > 0 ? done / tot : 0, peak, peakDate: dateOfDoy(ly, peak), daysToPeak: peak - today,
    years: [...yearsBack].sort(),
  };
}

export default function Outlook({ cal, regionName }: { cal: CalendarFile; regionName: string }) {
  const o = useMemo(() => computeOutlook(cal), [cal]);
  const W = 760, H = 150;
  const max = Math.max(1, ...o.hi.slice(1), ...o.thisYear.slice(1).map((x) => x ?? 0));
  const X = (d: number) => ((d - 1) / 365) * W;
  const Y = (v: number) => H - (Math.min(v, max) / max) * H;
  const band = [...Array.from({ length: 366 }, (_, i) => `${X(i + 1)},${Y(o.hi[i + 1])}`), ...Array.from({ length: 366 }, (_, i) => `${X(366 - i)},${Y(o.lo[366 - i])}`)].join(" ");
  const medLine = Array.from({ length: 366 }, (_, i) => `${i ? "L" : "M"}${X(i + 1)},${Y(o.med[i + 1])}`).join(" ");
  // this year, 7-day mean
  const pts: string[] = [];
  for (let d = 1; d <= o.today; d++) {
    const w = o.thisYear.slice(Math.max(1, d - 3), d + 4).filter((x): x is number => x !== null);
    if (w.length) pts.push(`${pts.length ? "L" : "M"}${X(d)},${Y(w.reduce((a, b) => a + b, 0) / w.length)}`);
  }
  const running = o.recentNorm > 0 ? o.recent / o.recentNorm : null;
  const nice = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <section className="hud-card p-5">
      <p className="hud-label">Outlook · next {HORIZON} days · {regionName}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Expected fire events, next 14 days</p>
          <p className="font-display text-3xl font-bold text-white">{fmt(Math.round(o.exp))}</p>
          <p className="text-xs text-slate-500">
            usual range {fmt(Math.round(o.expLo))} to {fmt(Math.round(o.expHi))}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Last 14 days vs normal</p>
          <p className={`font-display text-3xl font-bold ${running !== null && running >= 1.5 ? "text-red-300" : running !== null && running >= 1 ? "text-amber-300" : "text-emerald-300"}`}>
            {running !== null ? `${running.toFixed(1)}×` : "n/a"}
          </p>
          <p className="text-xs text-slate-500">
            {fmt(Math.round(o.recent))} vs a usual {fmt(Math.round(o.recentNorm))}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{o.season}</p>
          <p className="font-display text-3xl font-bold text-white">{o.inSeason ? `${Math.round(o.shareDone * 100)}% done` : "not started"}</p>
          <p className="text-xs text-slate-500">share of a typical season&apos;s fires burned by {nice(o.last)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Usual peak</p>
          <p className="font-display text-3xl font-bold text-white">{nice(o.peakDate)}</p>
          <p className="text-xs text-slate-500">{o.daysToPeak > 0 ? `in about ${o.daysToPeak} days` : o.daysToPeak === 0 ? "today" : `${-o.daysToPeak} days ago`}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="mt-4 w-full" role="img" aria-label="Typical year of fire activity with this year so far">
        <polygon points={band} fill="#f97316" opacity={0.12} />
        <path d={medLine} fill="none" stroke="#fb923c" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={pts.join(" ")} fill="none" stroke="#fff" strokeWidth={2} />
        <rect x={X(Math.max(1, o.today - 2))} y={0} width={X(o.today + HORIZON) - X(Math.max(1, o.today - 2))} height={H} fill="#22d3ee" opacity={0.12} />
        <line x1={X(o.today)} x2={X(o.today)} y1={0} y2={H} stroke="#22d3ee" strokeWidth={1.5} />
        <text x={X(o.today) + 4} y={12} fontSize={11} fill="#67e8f9">
          today
        </text>
        {MONTHS.map((m, i) => (
          <text key={m} x={X(doyOf(`2025-${String(i + 1).padStart(2, "0")}-01`))} y={H + 16} fontSize={11} fill="#64748b">
            {m}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-400">
        <span>
          <span className="mr-1 inline-block h-0.5 w-5 border-t-2 border-dashed border-orange-400 align-middle" />
          typical day ({o.years.length ? `${o.years[0]} to ${o.years[o.years.length - 1]}` : "history"})
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-5 bg-orange-500/20 align-middle" /> usual range (10th to 90th percentile)
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-5 bg-white align-middle" /> {o.ly} so far (7-day mean)
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-5 bg-cyan-400/20 align-middle" /> today and the next 14 days
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        A climatology outlook, not a weather forecast: it says what this area&apos;s own fire history makes likely for the coming two weeks.
      </p>
    </section>
  );
}
