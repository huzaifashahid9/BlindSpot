"use client";

import { useState } from "react";
import NextPass from "@/components/NextPass";
import BurnWindow from "@/components/BurnWindow";
import { longestGap, minToHHMM, PassesFile, pktWindows, Region, SAT_COLOR, SAT_LABEL, SATS } from "@/lib/data";

type Props = { passes: PassesFile; region: Region };

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin((a / 1440) * 2 * Math.PI), cy - r * Math.cos((a / 1440) * 2 * Math.PI)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = (((a1 - a0) % 1440) + 1440) % 1440 > 720 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export default function BlindClock({ passes, region }: Props) {
  const [on, setOn] = useState<Record<string, boolean>>({ Terra: true, Aqua: true, SNPP: false, NOAA20: true, NOAA21: true });
  const lon = region.lon ?? 70.5;
  const active = SATS.filter((s) => on[s]);
  const wins = pktWindows(passes, lon, active);
  const { gap, from } = longestGap(wins);
  const withSnpp = longestGap(pktWindows(passes, lon, [...SATS])).gap;

  const S = 340, C = S / 2;
  return (
    <>
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[360px]" role="img" aria-label="24-hour clock of satellite passes">
        <circle cx={C} cy={C} r={150} fill="#0f172a" stroke="#334155" />
        {gap > 0 ? <path d={arc(C, C, 150 - 70, from, from + gap)} stroke="#f43f5e" strokeOpacity={0.25} strokeWidth={130} fill="none" /> : null}
        {SATS.map((s, k) => {
          const r = 140 - k * 14;
          return (
            <g key={s}>
              <circle cx={C} cy={C} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
              {on[s]
                ? pktWindows(passes, lon, [s]).map((w, i) => (
                    <path key={i} d={arc(C, C, r, w.centre - w.half, w.centre + w.half)} stroke={SAT_COLOR[s]} strokeWidth={10} fill="none" strokeLinecap="round" />
                  ))
                : null}
            </g>
          );
        })}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const a = (h / 24) * 2 * Math.PI;
          return (
            <text key={h} x={C + 160 * Math.sin(a) * 0.62} y={C - 160 * Math.cos(a) * 0.62 + 4} textAnchor="middle" fontSize={11} fill="#94a3b8">
              {String(h).padStart(2, "0")}:00
            </text>
          );
        })}
        <text x={C} y={C - 4} textAnchor="middle" fontSize={22} fontWeight={700} fill="#fff">
          {Math.floor(gap / 60)}h {gap % 60}m
        </text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={11} fill="#94a3b8">
          longest unwatched stretch
        </text>
      </svg>
      <div>
        <div className="mb-5">
          <NextPass passes={passes} lon={lon} name={region.name} />
        </div>
        <h3 className="font-semibold text-white">Blind Clock: when is {region.name} watched?</h3>
        <p className="mt-1 text-sm text-slate-400">
          Coloured arcs are pass windows in Pakistan time, learned from when each satellite actually reported fires, with the drifting Terra and Aqua shown at this year's times. The red wedge is the longest
          stretch with no satellite overhead: a fire that starts and ends inside it is never recorded.
        </p>
        <ul className="mt-4 space-y-2">
          {SATS.map((s) => (
            <li key={s}>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={on[s]} onChange={() => setOn({ ...on, [s]: !on[s] })} className="h-4 w-4 accent-slate-200" />
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SAT_COLOR[s] }} />
                <span className="flex-1 text-slate-200">
                  {SAT_LABEL[s]}
                  {s === "SNPP" ? <span className="ml-2 rounded bg-rose-500/20 px-1.5 text-xs text-rose-300">stopped 2 Nov 2026</span> : null}
                  {s === "Terra" ? <span className="ml-2 rounded bg-amber-500/20 px-1.5 text-xs text-amber-300">only morning pass, ending next</span> : null}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {pktWindows(passes, lon, [s])
                    .map((w) => minToHHMM(w.centre))
                    .join(" · ")}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-300">
          Unwatched now: <b className="text-white">{minToHHMM(from)}</b> to <b className="text-white">{minToHHMM(from + gap)}</b> PKT. With all five
          satellites the longest gap was {Math.floor(withSnpp / 60)}h {withSnpp % 60}m. Suomi NPP flew in the same orbit as NOAA-20 and NOAA-21, so its
          loss barely changes the clock: what it took away was a third look at the same hour, which is how small fires get caught (see Lost Eyes).
        </p>
        <h4 className="mt-6 font-semibold text-white">The old satellites are drifting</h4>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {["Terra", "Aqua"].map((s) => (
            <li key={s}>
              <span style={{ color: SAT_COLOR[s] }}>{SAT_LABEL[s]}</span> daytime pass over {region.name}:{" "}
              {passes.satellites[s].day_pass_by_year
                .map((y) => `${y.year} ${minToHHMM((((y.lst_center_min - lon * 4 + 300) % 1440) + 1440) % 1440)}`)
                .join(", then ")}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-slate-500">Mean daytime detection time per year, Pakistan time. Fires burn hardest in the afternoon, so a drifting pass changes what MODIS sees.</p>
      </div>
    </div>
    <BurnWindow passes={passes} region={region} />
    </>
  );
}
