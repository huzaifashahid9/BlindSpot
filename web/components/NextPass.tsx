"use client";

import { useEffect, useState } from "react";
import { minToHHMM, PassesFile, pktWindows, SAT_COLOR, SAT_LABEL } from "@/lib/data";

const ACTIVE = ["Terra", "Aqua", "NOAA20", "NOAA21"]; // Suomi NPP stopped on 2 Nov 2026

/** Live countdown to the next satellite look at a place, from the pass windows learned from detections. */
export default function NextPass({ passes, lon, name }: { passes: PassesFile; lon: number; name: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 5 * 3600e3);
      setNow(d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const wins = pktWindows(passes, lon, ACTIVE).map((w) => ({ ...w, start: (w.centre - w.half + 1440) % 1440, end: (w.centre + w.half) % 1440 }));
  const inside = (w: { start: number; end: number }) => (w.start <= w.end ? now >= w.start && now <= w.end : now >= w.start || now <= w.end);
  const active = wins.filter(inside);
  const upcoming = wins
    .map((w) => ({ ...w, wait: (w.start - now + 1440) % 1440 }))
    .filter((w) => !inside(w))
    .sort((a, b) => a.wait - b.wait);
  const next = upcoming[0];
  const h = Math.floor(next.wait / 60), m = Math.floor(next.wait % 60), s = Math.floor((next.wait * 60) % 60);

  return (
    <div className="hud-card p-4">
      <p className="hud-label">Who is watching {name} right now</p>
      {active.length ? (
        <p className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-emerald-300">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
          </span>
          {active.map((a) => SAT_LABEL[a.sat]).join(" + ")} overhead
        </p>
      ) : (
        <p className="mt-1 font-display text-2xl font-bold text-rose-300">Nobody. Unwatched.</p>
      )}
      <p className="mt-2 text-sm text-slate-300">
        Next look: <b style={{ color: SAT_COLOR[next.sat] }}>{SAT_LABEL[next.sat]}</b> in{" "}
        <span className="font-mono text-lg text-white">
          {h}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
        </span>{" "}
        <span className="text-slate-500">(≈{minToHHMM(next.start)} PKT)</span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-slate-400">
        {upcoming.slice(1, 5).map((w, i) => (
          <li key={i} className="rounded border border-slate-800 px-1.5 py-0.5">
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SAT_COLOR[w.sat] }} /> {minToHHMM(w.start)} {w.sat.replace("NOAA", "N-")}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">A fire that starts and ends while nobody is overhead is never recorded. Suomi NPP is no longer in this list.</p>
    </div>
  );
}
