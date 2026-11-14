"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, CalendarFile, fmt } from "@/lib/data";
import Icon from "@/components/Icon";
import { useInView } from "@/components/Motion";

const SEASONS = {
  rice: { label: "Rice-residue season", m0: 10, d0: 1, len: 92, note: "1 Oct to 31 Dec" },
  wheat: { label: "Wheat-residue season", m0: 3, d0: 1, len: 122, note: "1 Mar to 30 Jun" },
} as const;
const COLORS = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399"];

/** Every season's running total of fire events, raced against each other day by day. */
export default function SeasonRace({ cal, regionName }: { cal: CalendarFile; regionName: string }) {
  const [kind, setKind] = useState<keyof typeof SEASONS>("rice");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>();
  const S = SEASONS[kind];
  const v = cal.events_h ?? cal.events;
  const last = addDays(cal.start, cal.days - 1);

  const runs = useMemo(() => {
    const y0 = Number(cal.start.slice(0, 4)), y1 = Number(last.slice(0, 4));
    const out: { year: number; cum: number[]; done: boolean }[] = [];
    for (let y = y0; y <= y1; y++) {
      const start = `${y}-${String(S.m0).padStart(2, "0")}-${String(S.d0).padStart(2, "0")}`;
      const i0 = Math.round((Date.parse(start) - Date.parse(cal.start)) / 864e5);
      if (i0 < 0 || i0 >= cal.days) continue;
      const cum: number[] = [];
      let s = 0;
      for (let k = 0; k < S.len && i0 + k < cal.days; k++) {
        s += v[i0 + k];
        cum.push(s);
      }
      out.push({ year: y, cum, done: cum.length === S.len });
    }
    return out.slice(-5);
  }, [cal, S, v, last]);

  useEffect(() => {
    setT(0);
    setPlaying(false);
  }, [kind, cal]);
  useEffect(() => {
    if (seen && t === 0) setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, kind, cal]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        if (x >= S.len - 1) {
          setPlaying(false);
          return x;
        }
        return x + 1;
      });
    }, 45);
    return () => clearInterval(id);
  }, [playing, S.len]);

  const max = Math.max(1, ...runs.map((r) => r.cum[r.cum.length - 1] ?? 0));
  const W = 900, H = 300, R = 120;
  const X = (k: number) => (k / (S.len - 1)) * (W - R);
  const Y = (c: number) => H - (c / max) * (H - 10);
  const now = runs.map((r) => ({ ...r, at: r.cum[Math.min(t, r.cum.length - 1)] ?? 0, k: Math.min(t, r.cum.length - 1) }));
  const ranked = [...now].sort((a, b) => b.at - a.at);
  const cur = runs[runs.length - 1];
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const sameDay = cur && prev ? prev.cum[cur.cum.length - 1] : null;
  const pace = cur && sameDay ? cur.cum[cur.cum.length - 1] / sameDay : null;

  return (
    <section ref={ref} className="hud-card spot p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Season race · {regionName}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-white">Is this season burning faster than the last ones?</h2>
          <p className="mt-1 text-sm text-slate-400">
            Running total of harmonized fire events from the first day of the {S.label.toLowerCase()} ({S.note}), every year raced day by day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(SEASONS) as (keyof typeof SEASONS)[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs transition ${kind === k ? "border-orange-400 bg-orange-500/15 text-orange-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
            >
              {SEASONS[k].label}
            </button>
          ))}
          <button
            onClick={() => {
              if (t >= S.len - 1) setT(0);
              setPlaying(!playing);
            }}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            {playing ? <><Icon name="pause" className="h-3 w-3" /> Pause</> : <><Icon name="play" className="h-3 w-3" fill /> {t >= S.len - 1 ? "Replay" : "Play"}</>}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
        <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" role="img" aria-label={`Season race for ${regionName}`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} x2={W - R} y1={Y(max * f)} y2={Y(max * f)} stroke="#1e293b" />
              <text x={0} y={Y(max * f) + 13} fontSize={10} fill="#475569">
                {fmt(Math.round(max * f))}
              </text>
            </g>
          ))}
          {now.map((r, i) => {
            const isCur = i === now.length - 1;
            const color = isCur ? "#f43f5e" : COLORS[i % COLORS.length];
            const d = r.cum.slice(0, r.k + 1).map((c, k) => `${k ? "L" : "M"}${X(k)},${Y(c)}`).join(" ");
            return (
              <g key={r.year}>
                <path d={d} fill="none" stroke={color} strokeWidth={isCur ? 3 : 1.6} opacity={isCur ? 1 : 0.8} style={isCur ? { filter: "drop-shadow(0 0 6px rgba(244,63,94,0.8))" } : undefined} />
                <circle cx={X(r.k)} cy={Y(r.at)} r={isCur ? 5 : 3.5} fill={color} />
                {isCur ? <circle cx={X(r.k)} cy={Y(r.at)} r={5} fill="none" stroke={color} className="pulse-ring" /> : null}
                <text x={X(r.k) + 8} y={Y(r.at) + 4} fontSize={12} fill={color} fontWeight={isCur ? 700 : 400}>
                  {r.year}
                  {isCur && !r.done ? " so far" : ""}
                </text>
              </g>
            );
          })}
          <text x={0} y={H + 16} fontSize={11} fill="#64748b">
            day 1
          </text>
          <text x={W - R} y={H + 16} fontSize={11} fill="#64748b" textAnchor="end">
            day {S.len}
          </text>
        </svg>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs text-slate-500">Day {t + 1} of the season</p>
            <ol className="mt-2 space-y-1.5">
              {ranked.map((r, i) => (
                <li key={r.year} className="flex items-center justify-between text-sm transition-all duration-300">
                  <span className={r.year === cur?.year ? "font-semibold text-rose-300" : "text-slate-300"}>
                    <span className="mr-2 font-mono text-xs text-slate-500">{i + 1}</span>
                    {r.year}
                  </span>
                  <span className="font-mono text-slate-200">{fmt(Math.round(r.at))}</span>
                </li>
              ))}
            </ol>
          </div>
          {pace !== null && cur && !cur.done ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
              <p className="text-xs text-rose-200/80">Pace against last year, same day</p>
              <p className="font-display text-3xl font-bold text-rose-200">{pace.toFixed(2)}×</p>
              <p className="text-xs text-slate-400">
                {fmt(Math.round(cur.cum[cur.cum.length - 1]))} events by day {cur.cum.length}, against {fmt(Math.round(sameDay ?? 0))} in {prev?.year}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
