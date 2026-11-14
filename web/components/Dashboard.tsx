"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import AreaExport, { Circle } from "@/components/AreaExport";
import Ask from "@/components/Ask";
import BlindClock from "@/components/BlindClock";
import Calendar from "@/components/Calendar";
import History from "@/components/History";
import LostEyes from "@/components/LostEyes";
import { addDays, CalendarFile, fmt, getJSON, HarmonizationFile, LostEyesFile, PassesFile, pct, Region, RegionsFile } from "@/lib/data";
import { buildCalendar, getIndex, loadYears, lostEyesFor } from "@/lib/points";

const DayMap = dynamic(() => import("@/components/DayMap"), { ssr: false, loading: () => <div className="h-[420px] rounded-xl bg-slate-900" /> });
const Hero = dynamic(() => import("@/components/Hero"), { ssr: false, loading: () => <div className="-mx-4 min-h-[86vh] md:mx-0" /> });

const TABS = [
  { id: "calendar", label: "Burning calendar" },
  { id: "history", label: "Fire history" },
  { id: "lost", label: "Lost Eyes" },
  { id: "clock", label: "Blind Clock" },
  { id: "area", label: "Area & export" },
  { id: "ask", label: "Ask AI" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Dashboard() {
  const [regions, setRegions] = useState<RegionsFile | null>(null);
  const [regionId, setRegionId] = useState("PAK");
  const [cal, setCal] = useState<CalendarFile | null>(null);
  const [le, setLe] = useState<LostEyesFile | null>(null);
  const [passes, setPasses] = useState<PassesFile | null>(null);
  const [harm, setHarm] = useState<HarmonizationFile | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [date, setDate] = useState<string | null>(null);
  const [withoutSnpp, setWithoutSnpp] = useState(false);
  const [custom, setCustom] = useState<Circle | null>(null);
  const [areaCal, setAreaCal] = useState<CalendarFile | null>(null);
  const [areaLe, setAreaLe] = useState<LostEyesFile["regions"][string] | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);

  useEffect(() => {
    getJSON<RegionsFile>("regions.json").then(setRegions);
    getJSON<LostEyesFile>("lost_eyes.json").then(setLe);
    getJSON<PassesFile>("passes.json").then(setPasses);
    getJSON<HarmonizationFile>("harmonization.json").then(setHarm).catch(() => null);
    const h = window.location.hash.replace("#", "");
    if (TABS.some((t) => t.id === h)) setTab(h as Tab);
    const onHash = () => {
      const x = window.location.hash.replace("#", "");
      if (TABS.some((t) => t.id === x)) {
        setTab(x as Tab);
        document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
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
  const customRegion: Region | null = custom
    ? { id: "custom", name: `Custom area: ${custom.km} km around ${custom.lat}, ${custom.lon}`, level: "district", parent: null, lat: custom.lat, lon: custom.lon }
    : null;

  // custom area: rebuild the calendar and Lost Eyes in the browser
  useEffect(() => {
    if (!custom || !cal || !le) {
      setAreaCal(null);
      setAreaLe(null);
      return;
    }
    let live = true;
    setAreaBusy(true);
    (async () => {
      const idx = await getIndex();
      const years = await loadYears(idx.years);
      const area = { kind: "circle" as const, ...custom };
      const reg = { id: "custom", name: "Custom area", level: "district" as const, parent: null };
      const c = buildCalendar(years, idx, area, reg, cal.days);
      c.constellation = cal.constellation;
      const l = lostEyesFor(years, idx, area, le.window.from, le.window.to);
      if (live) {
        setAreaCal(c);
        setAreaLe(l);
        setAreaBusy(false);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, cal?.days, le]);

  const grouped = useMemo(() => {
    if (!regions) return [];
    const provs = regions.regions.filter((r) => r.level === "province");
    return provs.map((p) => ({ p, ds: regions.regions.filter((r) => r.parent === p.id).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [regions]);

  const R = custom ? customRegion : region;
  const C = custom ? areaCal : cal;
  const leView: LostEyesFile | null = le && custom && areaLe ? { ...le, regions: { ...le.regions, custom: areaLe } } : le;
  const focus = R && R.level === "district" && R.lon && R.lat ? { lon: R.lon, lat: R.lat } : null;
  const years = regions ? `${regions.data_from.slice(0, 4)} to ${regions.data_to.slice(0, 4)}` : "";

  const stats = useMemo(() => {
    if (custom) {
      if (!areaCal || !areaLe) return null;
      return {
        events: (areaCal.events_h ?? areaCal.events).reduce((a, b) => a + b, 0),
        unusual: areaCal.unusual.reduce((a, b) => a + b, 0),
        lost: areaCal.unusual.reduce((a, b, i) => a + (b && !areaCal.unusual_no_snpp[i] ? 1 : 0), 0),
        only: areaLe.only_share.SNPP,
        trust: undefined as number | undefined,
      };
    }
    if (!region) return null;
    return { events: region.events_h ?? region.events ?? 0, unusual: region.unusual_days ?? 0, lost: region.unusual_days_lost ?? 0, only: region.only_snpp_share ?? 0, trust: region.trust_now };
  }, [custom, areaCal, areaLe, region]);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div className="hud-grid min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 pb-16">
        <Hero onlySnppShare={le?.regions.PAK.only_share.SNPP ?? null} onlySnpp={le?.regions.PAK.only.SNPP ?? null} />

        <div id="explore" className="sticky top-0 z-30 -mx-4 scroll-mt-0 border-b border-slate-800/80 bg-[#05070d]/85 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="font-display text-lg font-bold tracking-tight text-white">
              Blind<span className="text-orange-400">Spot</span>
            </Link>
            <select
              id="region"
              aria-label="Region"
              value={custom ? "custom" : regionId}
              onChange={(e) => {
                if (e.target.value === "custom") return go("area");
                setCustom(null);
                setRegionId(e.target.value);
              }}
              className="max-w-[16rem] rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
            >
              <option value="PAK">Pakistan (all)</option>
              <option value="custom">{custom ? `Custom area (${custom.km} km)` : "Custom area…"}</option>
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
            <nav className="flex flex-wrap gap-1">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${tab === t.id ? "bg-orange-500 font-semibold text-black" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  <span className={`mr-1.5 font-mono text-[10px] ${tab === t.id ? "text-black/60" : "text-slate-500"}`}>0{i + 1}</span>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              {tab === "calendar" ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={withoutSnpp} onChange={() => setWithoutSnpp(!withoutSnpp)} className="h-4 w-4 accent-rose-500" />
                  Switch off Suomi NPP
                </label>
              ) : null}
              <Link href="/method" className="text-sm text-slate-400 hover:text-white">
                Method
              </Link>
            </div>
          </div>
        </div>

        {stats ? (
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={`Harmonized fire events, ${years}`} value={fmt(Math.round(stats.events))} sub={R?.name} />
            <Stat label="Unusual days" value={fmt(stats.unusual)} sub={`${fmt(stats.lost)} vanish without Suomi NPP`} />
            <Stat label="Seen only by Suomi NPP" value={pct(stats.only)} accent sub="lost from the record since 2 Nov 2026" />
            <Stat
              label="Trust Score (0 to 100)"
              value={stats.trust !== undefined ? String(stats.trust) : custom ? "area" : "district view"}
              sub={stats.trust !== undefined ? "agreement, coverage, stability, sample size" : custom ? "scored for districts only" : "pick a district"}
            />
          </section>
        ) : (
          <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-900/60" />
        )}
        {custom && areaBusy ? <p className="mt-3 text-sm text-orange-300">Computing your area from every fire event…</p> : null}

        <main className="mt-8">
          {tab === "calendar" ? (
            <div className="space-y-10">
              <section>
                <p className="hud-label">01 · Daily burning calendar</p>
                <h2 className="font-display text-2xl font-semibold text-white">{R?.name}: every day, one square</h2>
                <p className="mb-4 mt-1 max-w-4xl text-sm text-slate-400">
                  Harmonized fire events per day from MODIS + VIIRS (persistent heat sources removed). {C?.baseline_note}{" "}
                  {withoutSnpp ? <b className="text-rose-300">Suomi NPP is switched off: this is the record from now on.</b> : null}
                </p>
                {C ? <Calendar cal={C} selected={date} onSelect={setDate} withoutSnpp={withoutSnpp} /> : <div className="h-64 animate-pulse rounded-2xl bg-slate-900" />}
                {C?.seasons.length ? (
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
                        {C.seasons.slice(-6).map((s) => (
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
                            <td>{s.end >= addDays(C.start, C.days - 15) ? <span className="text-amber-300">still running</span> : s.end}</td>
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
                  <p className="hud-label">02 · The day on the map</p>
                  <h2 className="mb-3 font-display text-2xl font-semibold text-white">Every fire, and which satellites saw it</h2>
                  <DayMap date={date} withoutSnpp={withoutSnpp} focus={focus} />
                </section>
              ) : null}
              {C ? <RawVsHarmonized cal={C} /> : null}
            </div>
          ) : null}
          {tab === "history" ? (C ? <History cal={C} harm={harm} regionName={R?.name ?? ""} /> : <div className="h-64 animate-pulse rounded-2xl bg-slate-900" />) : null}
          {tab === "lost" && leView && R && regions ? (
            <LostEyes
              le={leView}
              region={R}
              regions={regions.regions}
              onPickRegion={(id) => {
                setCustom(null);
                setRegionId(id);
                document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          ) : null}
          {tab === "clock" && passes && R ? <BlindClock passes={passes} region={R} /> : null}
          {tab === "area" && region && regions && cal ? (
            <AreaExport
              region={region}
              regions={regions.regions}
              cal={custom && areaCal ? areaCal : cal}
              custom={custom}
              onApply={(c) => {
                setCustom(c);
                if (c) go("calendar");
              }}
            />
          ) : null}
          {tab === "ask" ? <Ask regionId={custom ? regionId : regionId} /> : null}
        </main>

        <footer className="mt-20 border-t border-slate-800 pt-6 text-xs text-slate-500">
          Data: NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m from Suomi NPP, NOAA-20, NOAA-21), imagery from NASA GIBS, boundaries from geoBoundaries
          (CC BY 4.0). Built for NASA Space Apps Challenge 2026. See <Link className="underline" href="/method">method, validation and credits</Link>.
        </footer>
      </div>

      {tab !== "ask" ? (
        <button
          onClick={() => {
            go("ask");
            document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-orange-400/60 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_40px_-10px_rgba(249,115,22,0.9)] backdrop-blur hover:bg-slate-900"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-orange-400" /> Ask BlindSpot AI
        </button>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-rose-500/40 bg-rose-500/10" : "border-slate-800/80 bg-slate-900/60"}`}>
      <p className="hud-label">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${accent ? "text-rose-200" : "text-white"}`}>{value}</p>
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
      e += (cal.events_h ?? cal.events)[k];
    }
    weeks.push({ m, v, e, d: addDays(cal.start, i) });
  }
  const max = Math.max(1, ...weeks.map((w) => w.v));
  const W = 720, H = 160;
  const line = (k: "m" | "v" | "e") => weeks.map((w, i) => `${i ? "L" : "M"}${(i / (weeks.length - 1)) * W},${H - (w[k] / max) * H}`).join(" ");
  return (
    <section>
      <p className="hud-label">03 · Why harmonize</p>
      <h2 className="mb-1 font-display text-2xl font-semibold text-white">Same fires, three different answers</h2>
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
