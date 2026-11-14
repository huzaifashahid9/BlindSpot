"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Ask from "@/components/Ask";
import BlindClock from "@/components/BlindClock";
import Calendar from "@/components/Calendar";
import LostEyes from "@/components/LostEyes";
import { addDays, CalendarFile, fmt, getJSON, LostEyesFile, PassesFile, pct, RegionsFile } from "@/lib/data";

const DayMap = dynamic(() => import("@/components/DayMap"), { ssr: false, loading: () => <div className="h-[420px] rounded-lg bg-slate-900" /> });

const TABS = [
  { id: "calendar", label: "Burning calendar" },
  { id: "lost", label: "Lost Eyes" },
  { id: "clock", label: "Blind Clock" },
  { id: "ask", label: "Ask BlindSpot" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Dashboard() {
  const [regions, setRegions] = useState<RegionsFile | null>(null);
  const [regionId, setRegionId] = useState("PAK");
  const [cal, setCal] = useState<CalendarFile | null>(null);
  const [le, setLe] = useState<LostEyesFile | null>(null);
  const [passes, setPasses] = useState<PassesFile | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [date, setDate] = useState<string | null>(null);
  const [withoutSnpp, setWithoutSnpp] = useState(false);

  useEffect(() => {
    getJSON<RegionsFile>("regions.json").then(setRegions);
    getJSON<LostEyesFile>("lost_eyes.json").then(setLe);
    getJSON<PassesFile>("passes.json").then(setPasses);
    const h = window.location.hash.replace("#", "");
    if (TABS.some((t) => t.id === h)) setTab(h as Tab);
  }, []);

  useEffect(() => {
    setCal(null);
    getJSON<CalendarFile>(`calendar/${regionId}.json`).then((c) => {
      setCal(c);
      setDate((d) => {
        if (d) return d;
        // open on the busiest day of the latest burning season
        let best = 0;
        for (let i = Math.max(0, c.days - 120); i < c.days; i++) if (c.events[i] > c.events[best]) best = i;
        return addDays(c.start, best);
      });
    });
  }, [regionId]);

  const region = useMemo(() => regions?.regions.find((r) => r.id === regionId) ?? null, [regions, regionId]);
  const grouped = useMemo(() => {
    if (!regions) return [];
    const provs = regions.regions.filter((r) => r.level === "province");
    return provs.map((p) => ({ p, ds: regions.regions.filter((r) => r.parent === p.id).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [regions]);

  const focus = region?.level === "district" && region.lon && region.lat ? { lon: region.lon, lat: region.lat } : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-end gap-4 border-b border-slate-800 py-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Blind<span className="text-orange-400">Spot</span>
          </h1>
          <p className="mt-1 max-w-2xl text-slate-300">
            One fire record from two satellite families, and an honest map of what it misses. On 2 November 2026 NASA&apos;s Suomi NPP stopped sending
            fire data. This is what Pakistan&apos;s record lost.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link href="/method" className="text-slate-300 underline-offset-4 hover:underline">
            Method and validation
          </Link>
        </nav>
      </header>

      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <label className="text-sm text-slate-400" htmlFor="region">
          Region
        </label>
        <select id="region" value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded bg-slate-800 px-2 py-1.5 text-sm text-white">
          <option value="PAK">Pakistan (all)</option>
          {grouped.map(({ p, ds }) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id}>{p.name} (province)</option>
              {ds.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                history.replaceState(null, "", `#${t.id}`);
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${tab === t.id ? "bg-orange-500 font-semibold text-black" : "text-slate-300 hover:bg-slate-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "calendar" ? (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={withoutSnpp} onChange={() => setWithoutSnpp(!withoutSnpp)} className="h-4 w-4 accent-rose-500" />
            Switch off Suomi NPP
          </label>
        ) : null}
      </div>

      {region ? (
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Fire events (Nov 2023 to Nov 2026)" value={fmt(region.events)} />
          <Stat label="Unusual days" value={fmt(region.unusual_days)} sub={`${fmt(region.unusual_days_lost)} vanish without Suomi NPP`} />
          <Stat label="Seen only by Suomi NPP" value={pct(region.only_snpp_share)} accent />
          <Stat
            label="Trust Score (0 to 100)"
            value={region.trust_now !== undefined ? String(region.trust_now) : "district view"}
            sub={region.trust_now !== undefined ? "agreement, coverage, stability, sample size" : "pick a district"}
          />
        </section>
      ) : null}

      <main className="mt-8">
        {tab === "calendar" ? (
          <div className="space-y-8">
            <section>
              <h2 className="mb-1 text-lg font-semibold text-white">Harmonized burning-activity calendar: {region?.name}</h2>
              <p className="mb-4 text-sm text-slate-400">
                Each square is one day of fused MODIS + VIIRS fire events (persistent heat sources removed). {cal?.baseline_note}{" "}
                {withoutSnpp ? <b className="text-rose-300">Suomi NPP is switched off: this is the record from now on.</b> : null}
              </p>
              {cal ? <Calendar cal={cal} selected={date} onSelect={setDate} withoutSnpp={withoutSnpp} /> : <div className="h-64 animate-pulse rounded bg-slate-900" />}
              {cal?.seasons.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-1 font-normal">Burning season</th>
                        <th className="font-normal">Start (5%)</th>
                        <th className="font-normal">Peak day</th>
                        <th className="font-normal">End (95%)</th>
                        <th className="font-normal">Events</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {cal.seasons.map((s) => (
                        <tr key={s.season + s.year} className="border-t border-slate-800">
                          <td className="py-1">
                            {s.season} {s.year}
                          </td>
                          <td>{s.start}</td>
                          <td>
                            <button className="underline decoration-dotted" onClick={() => setDate(s.peak)}>
                              {s.peak}
                            </button>
                          </td>
                          <td>{s.end >= addDays(cal.start, cal.days - 15) ? <span className="text-amber-300">still running</span> : s.end}</td>
                          <td>{fmt(s.events)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
            {date ? (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-white">Fires on the map</h2>
                <DayMap date={date} withoutSnpp={withoutSnpp} focus={focus} />
              </section>
            ) : null}
            {cal ? <RawVsHarmonized cal={cal} /> : null}
          </div>
        ) : null}
        {tab === "lost" && le && region && regions ? (
          <LostEyes
            le={le}
            region={region}
            regions={regions.regions}
            onPickRegion={(id) => {
              setRegionId(id);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : null}
        {tab === "clock" && passes && region ? <BlindClock passes={passes} region={region} /> : null}
        {tab === "ask" ? <Ask regionId={regionId} /> : null}
      </main>

      <footer className="mt-16 border-t border-slate-800 pt-6 text-xs text-slate-500">
        Data: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m from Suomi NPP, NOAA-20, NOAA-21), imagery from NASA GIBS, boundaries from geoBoundaries
        (CC BY 4.0). Built for NASA Space Apps Challenge 2026. See <Link className="underline" href="/method">method, validation and credits</Link>.
      </footer>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-rose-500/40 bg-rose-500/10" : "border-slate-800 bg-slate-900"}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-rose-200" : "text-white"}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function RawVsHarmonized({ cal }: { cal: CalendarFile }) {
  // weekly totals: raw MODIS detections, raw VIIRS detections, harmonized events
  const weeks: { m: number; v: number; e: number; d: string }[] = [];
  for (let i = 0; i < cal.days; i += 7) {
    let m = 0, v = 0, e = 0;
    for (let k = i; k < Math.min(cal.days, i + 7); k++) {
      m += cal.raw_modis[k];
      v += cal.raw_viirs[k];
      e += cal.events[k];
    }
    weeks.push({ m, v, e, d: addDays(cal.start, i) });
  }
  const max = Math.max(1, ...weeks.map((w) => w.v));
  const W = 720, H = 160;
  const line = (k: "m" | "v" | "e") => weeks.map((w, i) => `${i ? "L" : "M"}${(i / (weeks.length - 1)) * W},${H - (w[k] / max) * H}`).join(" ");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-white">Same fires, three different answers</h2>
      <p className="mb-3 text-sm text-slate-400">
        Weekly raw MODIS detections, raw VIIRS detections (three satellites, many duplicates), and BlindSpot&apos;s harmonized fire events. Without
        harmonization, &quot;how much burned?&quot; depends on which satellite you ask.
      </p>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full">
        <path d={line("v")} fill="none" stroke="#a78bfa" strokeWidth={1.5} />
        <path d={line("e")} fill="none" stroke="#fb923c" strokeWidth={2.5} />
        <path d={line("m")} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
        {weeks.map((w, i) =>
          w.d.slice(5, 7) === "01" && Number(w.d.slice(8)) <= 7 ? (
            <text key={w.d} x={(i / (weeks.length - 1)) * W} y={H + 16} fontSize={11} fill="#64748b">
              {w.d.slice(0, 4)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-slate-400">
        <span className="text-violet-300">raw VIIRS detections</span>
        <span className="text-sky-300">raw MODIS detections</span>
        <span className="font-semibold text-orange-300">harmonized fire events</span>
      </div>
    </section>
  );
}
