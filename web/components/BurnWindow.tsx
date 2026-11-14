"use client";

import { useEffect, useMemo, useState } from "react";
import {
  minToHHMM,
  PassesFile,
  pktWindows,
  Region,
  SAT_COLOR,
  SAT_LABEL,
} from "@/lib/data";

// The fleet that is actually flying after 2 Nov 2026
const FLEET = ["Terra", "Aqua", "NOAA20", "NOAA21"];

type Stretch = { from: number; len: number };

const nowPKT = () => {
  const d = new Date();
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 300) % 1440;
};
const dur = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
    : `${m} min`;

/** Burn Window Advisor: when a fire in this district would be seen, and when it would not. */
export default function BurnWindow({
  passes,
  region,
}: {
  passes: PassesFile;
  region: Region;
}) {
  const lon = region.lon ?? 70.5;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(nowPKT());
    const t = setInterval(() => setNow(nowPKT()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { wins, owner, blind } = useMemo(() => {
    const wins = pktWindows(passes, lon, FLEET)
      .sort((a, b) => a.centre - b.centre);
    // which satellite covers each minute of the day (or null)
    const owner: (string | null)[] = new Array(1440).fill(null);
    for (const w of wins)
      for (
        let m = Math.round(w.centre - w.half);
        m <= Math.round(w.centre + w.half);
        m++
      )
        owner[((m % 1440) + 1440) % 1440] ??= w.sat;
    // blind stretches, joined across midnight
    const blind: Stretch[] = [];
    const start = owner.findIndex((o) => o !== null);
    if (start >= 0) {
      let run = 0;
      for (let k = 1; k <= 1440; k++) {
        const i = (start + k) % 1440;
        if (owner[i] === null) run++;
        else if (run) {
          blind.push({ from: (i - run + 1440) % 1440, len: run });
          run = 0;
        }
      }
    }
    blind.sort((a, b) => b.len - a.len);
    return { wins, owner, blind };
  }, [passes, lon]);

  const inStretch = (s: Stretch, m: number) =>
    (m - s.from + 1440) % 1440 < s.len;
  // how many daylight minutes (08:00 to 19:00 PKT) a stretch covers
  const daylight = (st: Stretch) => {
    let n = 0;
    for (let k = 0; k < st.len; k++) {
      const m = (st.from + k) % 1440;
      if (m >= 480 && m < 1140) n++;
    }
    return n;
  };
  const patrol = [...blind].sort((a, b) => daylight(b) - daylight(a))[0];
  const other = blind.find((st) => st !== patrol);
  const otherCoversNight = other ? [0, 60, 120, 180, 240, 300].some((m) => inStretch(other, m)) : false;
  const blindTotal = blind.reduce((a, s) => a + s.len, 0);

  // status right now
  let status: {
    watched: boolean;
    sat?: string;
    until: number;
    nextSat?: string;
  } | null = null;
  if (now !== null) {
    const o = owner[now];
    if (o) {
      let m = now;
      while (owner[(m + 1) % 1440] !== null && m - now < 1440) m++;
      status = { watched: true, sat: o, until: (m + 1) % 1440 };
    } else {
      const s = blind.find((x) => inStretch(x, now));
      const end = s ? (s.from + s.len) % 1440 : now;
      status = { watched: false, until: end, nextSat: owner[end] ?? undefined };
    }
  }

  const pctX = (m: number) => `${(m / 1440) * 100}%`;
  const minsTo = (m: number) => (now === null ? 0 : (m - now + 1440) % 1440);

  return (
    <section className="hud-card mt-8 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hud-label">Burn Window Advisor · {region.name}</p>
          <h3 className="mt-1 font-display text-2xl font-semibold text-white">
            When would a fire here go unseen?
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Using the four satellites still flying after 2 November 2026. A fire
            that is lit and put out inside a grey stretch leaves no satellite
            record at all, so that is when checks on the ground matter most.
          </p>
        </div>
        {status ? (
          <div
            className={`min-w-[240px] rounded-xl border p-4 ${status.watched ? "border-emerald-400/50 bg-emerald-400/[0.07]" : "border-rose-400/50 bg-rose-400/[0.07]"}`}
            aria-live="polite"
          >
            <p
              className={`text-[11px] uppercase tracking-wider ${status.watched ? "text-emerald-300" : "text-rose-300"}`}
            >
              Right now, {minToHHMM(now ?? 0)} PKT
            </p>
            {status.watched ? (
              <>
                <p className="mt-1 font-display text-xl font-semibold text-white">
                  Watched
                </p>
                <p className="text-sm text-slate-300">
                  {SAT_LABEL[status.sat!]} is overhead until about{" "}
                  {minToHHMM(status.until)}.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 font-display text-xl font-semibold text-white">
                  Blind for {dur(minsTo(status.until))}
                </p>
                <p className="text-sm text-slate-300">
                  Next look at about {minToHHMM(status.until)}
                  {status.nextSat ? ` by ${SAT_LABEL[status.nextSat]}` : ""}.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* 24-hour strip */}
      <div className="mt-6">
        <div className="relative h-12 overflow-hidden rounded-lg border border-slate-700 bg-[repeating-linear-gradient(135deg,#1e293b_0_6px,#0f172a_6px_12px)]">
          {wins.map((w, i) => {
            const a = (((w.centre - w.half) % 1440) + 1440) % 1440;
            const len = w.half * 2;
            const parts =
              a + len > 1440
                ? [
                    [a, 1440 - a],
                    [0, a + len - 1440],
                  ]
                : [[a, len]];
            return parts.map(([x, l], j) => (
              <div
                key={`${i}-${j}`}
                title={`${SAT_LABEL[w.sat]}: about ${minToHHMM(w.centre - w.half)} to ${minToHHMM(w.centre + w.half)}`}
                className="absolute inset-y-0"
                style={{
                  left: pctX(x),
                  width: pctX(l),
                  background: SAT_COLOR[w.sat],
                  opacity: 0.85,
                }}
              />
            ));
          })}
          {now !== null ? (
            <div
              className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_#fff]"
              style={{ left: pctX(now) }}
              aria-hidden
            >
              <span className="absolute -top-0.5 left-1 rounded bg-white px-1 text-[10px] font-semibold text-slate-900">
                now
              </span>
            </div>
          ) : null}
        </div>
        <div className="relative mt-1 h-4 text-[10px] text-slate-500">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: pctX(h * 60) }}
            >
              {String(h % 24).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          {FLEET.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: SAT_COLOR[s] }}
              />
              {SAT_LABEL[s]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,#475569_0_2px,#0f172a_2px_4px)]" />
            no satellite overhead
          </span>
        </div>
      </div>

      {/* advice */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {patrol ? (
          <div className="rounded-xl border border-rose-400/40 bg-rose-400/[0.06] p-4">
            <p className="text-[11px] uppercase tracking-wider text-rose-300">
              Best hours for field checks
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">
              {minToHHMM(patrol.from)} to {minToHHMM(patrol.from + patrol.len)}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              The longest stretch of daylight with no satellite overhead (
              {dur(patrol.len)} in all). A fire seen in these hours will not show
              up in any satellite alert, so report it.
            </p>
          </div>
        ) : null}
        {other ? (
          <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">
              {otherCoversNight ? "Night to morning gap" : "Second gap"}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">
              {minToHHMM(other.from)} to {minToHHMM(other.from + other.len)}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {dur(other.len)} unwatched. A fire lit and put out in these hours
              can be missed, unless it is still burning at the next pass.
            </p>
          </div>
        ) : null}
        <div className="rounded-xl border border-sky-400/30 bg-sky-400/[0.06] p-4">
          <p className="text-[11px] uppercase tracking-wider text-sky-300">
            The whole day
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">
            {Math.round((blindTotal / 1440) * 100)}% unwatched
          </p>
          <p className="mt-1 text-sm text-slate-300">
            About {dur(1440 - blindTotal)} of every day has a satellite
            overhead. Big fires that burn for hours are usually still caught;
            short ones are not.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Windows are learned from when each satellite has actually reported fires
        at this longitude, with Terra and Aqua moved to where their drifting
        orbits put them this year. They are typical times, not exact schedules: a
        pass can come up to half an hour early or late. Cloud, haze and thick
        smoke can also hide a fire during a pass. In 2024, news reports from
        Indian Punjab said some farmers had started burning after the afternoon
        satellite pass. This view is meant to close that gap.
      </p>
    </section>
  );
}
