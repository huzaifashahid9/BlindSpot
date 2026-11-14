"use client";

import { useMemo, useState } from "react";
import { addDays, CalendarFile, fmt } from "@/lib/data";

type Props = {
  cal: CalendarFile;
  selected: string | null;
  onSelect: (date: string) => void;
  withoutSnpp: boolean;
};

const CELL = 12;
const GAP = 2;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function colour(v: number, max: number) {
  if (v <= 0) return "#1e293b";
  const t = Math.min(1, Math.sqrt(v / max));
  // dark amber -> orange -> near white
  const stops = [
    [69, 26, 3],
    [194, 65, 12],
    [249, 115, 22],
    [253, 186, 116],
    [255, 247, 237],
  ];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
}

export default function Calendar({ cal, selected, onSelect, withoutSnpp }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const values = withoutSnpp ? cal.events_no_snpp : cal.events;
  const flags = withoutSnpp ? cal.unusual_no_snpp : cal.unusual;
  const max = useMemo(() => Math.max(1, ...cal.events), [cal]);

  const years = useMemo(() => {
    const out = new Map<number, { i: number; date: string; week: number; dow: number; month: number }[]>();
    for (let i = 0; i < cal.days; i++) {
      const date = addDays(cal.start, i);
      const d = new Date(date + "T00:00:00Z");
      const y = d.getUTCFullYear();
      const jan1 = new Date(Date.UTC(y, 0, 1));
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      const week = Math.floor(((d.getTime() - jan1.getTime()) / 864e5 + ((jan1.getUTCDay() + 6) % 7)) / 7);
      if (!out.has(y)) out.set(y, []);
      out.get(y)!.push({ i, date, week, dow, month: d.getUTCMonth() });
    }
    return [...out.entries()];
  }, [cal]);

  const h = hover !== null ? hover : null;
  const W = 54 * (CELL + GAP) + 40;

  return (
    <div>
      <div className="mb-2 h-10 text-sm text-slate-300">
        {h !== null ? (
          <span>
            <b className="text-white">{addDays(cal.start, h)}</b> · {fmt(values[h])} fire events · {fmt(cal.frp[h])} MW total
            fire power · raw: {fmt(cal.raw_modis[h])} MODIS / {fmt(cal.raw_viirs[h])} VIIRS detections
            {flags[h] ? <span className="ml-2 rounded bg-cyan-500/20 px-1.5 text-cyan-300">unusual day</span> : null}
          </span>
        ) : (
          <span className="text-slate-400">Hover a day for numbers, click to open it on the map.</span>
        )}
      </div>
      <div className="overflow-x-auto">
        {years.map(([y, cells]) => (
          <div key={y} className="mb-3">
            <svg width={W} height={7 * (CELL + GAP) + 26} className="block">
              <text x={0} y={10 + 3.5 * (CELL + GAP)} fill="#94a3b8" fontSize={12} fontWeight={600}>
                {y}
              </text>
              {MONTHS.map((m, k) => {
                const first = cells.find((c) => c.month === k);
                if (!first) return null;
                return (
                  <text key={m} x={40 + first.week * (CELL + GAP)} y={9} fill="#64748b" fontSize={10}>
                    {m}
                  </text>
                );
              })}
              {cells.map((c) => {
                const crit = cal.critical_weeks.includes(isoWeek(new Date(c.date + "T00:00:00Z")));
                const x = 40 + c.week * (CELL + GAP);
                const yy = 14 + c.dow * (CELL + GAP);
                const sel = selected === c.date;
                return (
                  <g key={c.i} onMouseEnter={() => setHover(c.i)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(c.date)} style={{ cursor: "pointer" }}>
                    {crit && c.dow === 0 ? <rect x={x} y={12} width={CELL} height={7 * (CELL + GAP)} fill="#22d3ee" opacity={0.07} /> : null}
                    <rect x={x} y={yy} width={CELL} height={CELL} rx={2} fill={colour(values[c.i], max)} />
                    {flags[c.i] ? <rect x={x + 0.75} y={yy + 0.75} width={CELL - 1.5} height={CELL - 1.5} rx={2} fill="none" stroke="#22d3ee" strokeWidth={1.5} /> : null}
                    {sel ? <rect x={x - 1.5} y={yy - 1.5} width={CELL + 3} height={CELL + 3} rx={3} fill="none" stroke="#fff" strokeWidth={2} /> : null}
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          less
          {[0, 3, 30, 300, max].map((v) => (
            <span key={v} className="inline-block h-3 w-3 rounded-sm" style={{ background: colour(v, max) }} />
          ))}
          more fire events
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border-2 border-cyan-400" /> unusual day
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-cyan-400/20" /> critical burning weeks
        </span>
      </div>
    </div>
  );
}
