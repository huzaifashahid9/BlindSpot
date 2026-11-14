"use client";

import { useMemo, useState } from "react";
import { addDays, CalendarFile, fmt, HarmonizationFile } from "@/lib/data";
import { heat, inkOn } from "@/lib/ramp";
import Outlook from "@/components/Outlook";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Props = { cal: CalendarFile; harm: HarmonizationFile | null; regionName: string; outlook?: boolean };

function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function History({ cal, harm, regionName, outlook = true }: Props) {
  const [metric, setMetric] = useState<"h" | "raw">("h");
  const [hover, setHover] = useState<{ y: number; m: number } | null>(null);
  const series = metric === "h" && cal.events_h ? cal.events_h : cal.events;

  const data = useMemo(() => {
    // month x year totals, and which days exist (to mark partial months)
    const tot = new Map<string, number>();
    const cnt = new Map<string, number>();
    const days = new Map<string, number>();
    const years = new Set<number>();
    for (let i = 0; i < cal.days; i++) {
      const d = addDays(cal.start, i);
      const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1;
      const k = `${y}-${m}`;
      years.add(y);
      tot.set(k, (tot.get(k) ?? 0) + series[i]);
      cnt.set(k, (cnt.get(k) ?? 0) + cal.events[i]);
      days.set(k, (days.get(k) ?? 0) + 1);
    }
    const ys = [...years].sort((a, b) => a - b);
    const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const full = (y: number, m: number) => (days.get(`${y}-${m}`) ?? 0) === dim(y, m);
    // months when Terra was the only satellite: harmonized counts there rest on one sensor and are rough
    const firstMulti = cal.constellation?.find(([, k]) => k !== "Terra")?.[0];
    const terraEnd = firstMulti !== undefined && cal.constellation?.[0]?.[1] === "Terra" ? addDays(cal.start, firstMulti) : null;
    const terraOnly = (y: number, m: number) => terraEnd !== null && `${y}-${String(m + 1).padStart(2, "0")}-${String(dim(y, m)).padStart(2, "0")}` < terraEnd;
    const medByMonth = MONTHS.map((_, m) => median(ys.filter((y) => full(y, m)).map((y) => tot.get(`${y}-${m}`) ?? 0)));
    const solid = (k: string) => full(Number(k.split("-")[0]), Number(k.split("-")[1])) && !terraOnly(Number(k.split("-")[0]), Number(k.split("-")[1]));
    const max = Math.max(1, ...[...tot.entries()].filter(([k]) => solid(k)).map(([, v]) => v));
    const yearTot = ys.map((y) => MONTHS.reduce((a, _, m) => a + (tot.get(`${y}-${m}`) ?? 0), 0));

    // this month so far vs the same days of the same month in earlier years
    const last = addDays(cal.start, cal.days - 1);
    const ly = Number(last.slice(0, 4)), lm = Number(last.slice(5, 7)) - 1, ld = Number(last.slice(8, 10));
    const sameDays = (y: number) => {
      let s = 0, ok = 0;
      for (let dd = 1; dd <= ld; dd++) {
        const date = `${y}-${String(lm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        const i = Math.round((Date.parse(date) - Date.parse(cal.start)) / 864e5);
        if (i >= 0 && i < cal.days) {
          s += series[i];
          ok++;
        }
      }
      return ok === ld ? s : null;
    };
    const now = sameDays(ly) ?? 0;
    const past = ys.filter((y) => y < ly).map((y) => ({ y, v: sameDays(y) })).filter((x): x is { y: number; v: number } => x.v !== null);
    const pastMed = median(past.map((p) => p.v));
    const rank = [...past.map((p) => p.v), now].sort((a, b) => b - a).indexOf(now) + 1;

    let best = { k: "", v: -1 };
    tot.forEach((v, k) => {
      if (v > best.v && solid(k)) best = { k, v };
    });
    return { tot, cnt, ys, full, medByMonth, max, yearTot, ly, lm, ld, now, past, pastMed, rank, best, terraOnly, terraEnd };
  }, [cal, series]);

  const eraOfYear = (y: number) => {
    if (!cal.constellation?.length) return "";
    const i = Math.round((Date.parse(`${y}-07-01`) - Date.parse(cal.start)) / 864e5);
    let k = cal.constellation[0][1];
    for (const [s, key] of cal.constellation) if (s <= Math.max(0, i)) k = key;
    return k;
  };
  const satCount = (k: string) => (k ? k.split(",").length : 0);

  const ratio = data.pastMed > 0 ? data.now / data.pastMed : NaN;
  const h = hover ? data.tot.get(`${hover.y}-${hover.m}`) ?? null : null;

  return (
    <div className="space-y-8">
      {outlook ? <Outlook cal={cal} regionName={regionName} /> : null}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="hud-card md:col-span-2 p-5">
          <p className="hud-label">
            {MONTHS[data.lm]} 1 to {data.ld}, {data.ly} · {regionName}
          </p>
          <p className="mt-2 font-display text-5xl font-bold text-white">
            {Number.isFinite(ratio) ? `${ratio.toFixed(1)}×` : "n/a"}
            <span className="ml-3 align-middle text-base font-normal text-slate-400">the historical median</span>
          </p>
          <p className="mt-2 text-slate-300">
            {fmt(Math.round(data.now))} harmonized fire events so far this month, against a median of {fmt(Math.round(data.pastMed))} for the same days in{" "}
            {data.past.length} earlier year{data.past.length === 1 ? "" : "s"} ({data.past.map((p) => p.y).join(", ") || "none on record yet"}). Rank{" "}
            <b className="text-white">
              {data.rank} of {data.past.length + 1}
            </b>
            .
          </p>
          <div className="mt-4 flex items-end gap-1.5">
            {[...data.past, { y: data.ly, v: data.now }].map((p) => {
              const mx = Math.max(1, data.now, ...data.past.map((x) => x.v));
              return (
                <div key={p.y} className="flex flex-col items-center gap-1">
                  <div
                    className="w-8 rounded-t"
                    style={{ height: `${Math.max(2, (p.v / mx) * 80)}px`, background: p.y === data.ly ? "#f97316" : "#475569" }}
                    title={`${p.y}: ${fmt(Math.round(p.v))}`}
                  />
                  <span className="font-mono text-[10px] text-slate-500">{String(p.y).slice(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="hud-card p-5">
          <p className="hud-label">On record</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Busiest month</dt>
              <dd className="font-display text-xl text-white">
                {data.best.k ? `${MONTHS[Number(data.best.k.split("-")[1])]} ${data.best.k.split("-")[0]}` : "n/a"}{" "}
                <span className="text-sm text-slate-400">{fmt(Math.round(data.best.v))} events</span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Typical peak month</dt>
              <dd className="font-display text-xl text-white">
                {MONTHS[data.medByMonth.indexOf(Math.max(...data.medByMonth.filter(Number.isFinite)))] ?? "n/a"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Years on record</dt>
              <dd className="font-display text-xl text-white">
                {data.ys[0]} to {data.ys[data.ys.length - 1]}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <p className="hud-label">Fire history, month by month</p>
            <h3 className="font-display text-xl font-semibold text-white">Which months and years burned most in {regionName}</h3>
          </div>
          <div className="flex rounded-lg border border-slate-700 p-0.5 text-xs">
            {(
              [
                ["h", "Harmonized"],
                ["raw", "Raw count"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} className={`rounded-md px-3 py-1.5 ${metric === k ? "bg-orange-500 font-semibold text-black" : "text-slate-300"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 max-w-3xl text-sm text-slate-400">
          {metric === "h"
            ? "Harmonized: every month is put on the scale of the full five-satellite constellation, so a satellite starting or stopping does not fake a rise or fall."
            : "Raw: plain event counts. Compare with Harmonized: whenever the set of satellites changes, the raw count jumps for reasons that have nothing to do with fire."}
        </p>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="w-14" />
                {MONTHS.map((m) => (
                  <th key={m} className="w-16 font-normal text-slate-500">
                    {m}
                  </th>
                ))}
                <th className="pl-2 text-left font-normal text-slate-500">Year</th>
              </tr>
            </thead>
            <tbody>
              {data.ys.map((y, yi) => {
                const era = eraOfYear(y);
                return (
                  <tr key={y}>
                    <td className="pr-1 text-right font-mono text-slate-400">
                      {y}
                      {era ? (
                        <span className="ml-1 inline-flex gap-px align-middle" title={era.split(",").join(" + ")}>
                          {Array.from({ length: satCount(era) }).map((_, k) => (
                            <span key={k} className="inline-block h-2 w-0.5 bg-cyan-400/70" />
                          ))}
                        </span>
                      ) : null}
                    </td>
                    {MONTHS.map((_, m) => {
                      const k = `${y}-${m}`;
                      const v = data.tot.get(k);
                      const partial = v !== undefined && (!data.full(y, m) || data.terraOnly(y, m));
                      const isNow = y === data.ly && m === data.lm;
                      return (
                        <td
                          key={m}
                          onMouseEnter={() => setHover({ y, m })}
                          onMouseLeave={() => setHover(null)}
                          className={`h-9 rounded text-center font-mono ${isNow ? "outline outline-2 outline-white" : ""}`}
                          style={{
                            background: v === undefined ? "transparent" : heat(v, data.max),
                            color: v === undefined ? undefined : inkOn(v, data.max),
                            opacity: partial && !isNow ? 0.55 : 1,
                          }}
                        >
                          {v === undefined ? "" : v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
                        </td>
                      );
                    })}
                    <td className="pl-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded bg-orange-400/80" style={{ width: `${(data.yearTot[yi] / Math.max(...data.yearTot)) * 90}px` }} />
                        <span className="font-mono text-slate-400">{fmt(Math.round(data.yearTot[yi]))}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="pr-1 text-right text-slate-500">median</td>
                {data.medByMonth.map((v, m) => (
                  <td key={m} className="h-7 rounded border border-dashed border-slate-700 text-center font-mono text-slate-300">
                    {Number.isFinite(v) ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)) : ""}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 h-5 text-xs text-slate-400">
          {hover && h !== null
            ? `${MONTHS[hover.m]} ${hover.y}: ${fmt(Math.round(h))} ${metric === "h" ? "harmonized" : "raw"} events${
                !data.full(hover.y, hover.m) ? " (partial month)" : ""
              }${Number.isFinite(data.medByMonth[hover.m]) && data.medByMonth[hover.m] > 0 ? `, ${(h / data.medByMonth[hover.m]).toFixed(1)}× the ${MONTHS[hover.m]} median` : ""}`
            : "Hover a month. Faded = partial month; white outline = this month; cyan ticks = number of satellites flying that year."}
        </div>
        {data.terraEnd ? (
          <p className="mt-2 text-xs text-slate-500">
            Faded months before {data.terraEnd.slice(0, 7)}: Terra was the only satellite, so the harmonized count rests on one sensor and is rough (see the
            validation table below). They are left out of the colour scale and the records.
          </p>
        ) : null}
        <Legend max={data.max} />
      </section>

      {harm ? (
        <section>
          <p className="hud-label">Harmonization check</p>
          <h3 className="font-display text-xl font-semibold text-white">Can older satellites alone reproduce today&apos;s record?</h3>
          <p className="mb-3 mt-1 max-w-3xl text-sm text-slate-400">
            For each past (and future) set of satellites we hid the others inside the 2023 to 2026 window, then predicted each province&apos;s monthly
            count from what was left, fitting on two years and testing on the third. Median error per province-month:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 font-normal">Satellites flying</th>
                  <th className="font-normal">Era</th>
                  <th className="font-normal">They see</th>
                  <th className="font-normal">Raw count error</th>
                  <th className="font-normal">Harmonized error</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {harm.eras.map((e) => (
                  <tr key={e.constellation} className="border-t border-slate-800">
                    <td className="py-1.5">{e.label}</td>
                    <td className="text-slate-400">{e.era}</td>
                    <td className="font-mono">{Math.round(e.share_seen * 100)}%</td>
                    <td className="font-mono text-rose-300">{e.monthly_error_raw !== null ? `${Math.round(e.monthly_error_raw * 100)}%` : "n/a"}</td>
                    <td className="font-mono font-semibold text-emerald-300">
                      {e.monthly_error_harmonized !== null ? `${Math.round(e.monthly_error_harmonized * 100)}%` : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Legend({ max }: { max: number }) {
  const steps = [0, 0.02, 0.1, 0.3, 0.6, 1];
  return (
    <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
      fewer
      {steps.map((s) => (
        <span key={s} className="inline-block h-3 w-6 rounded-sm" style={{ background: heat(s * max, max) }} />
      ))}
      more fire events · colour-blind safe ramp
    </div>
  );
}
