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
import ExplainDay from "@/components/ExplainDay";
import NextPass from "@/components/NextPass";
import { addDays, CalendarFile, fmt, getJSON, HarmonizationFile, LostEyesFile, PassesFile, pct, Region, RegionsFile } from "@/lib/data";
import { buildCalendar, getIndex, loadYears, lostEyesFor } from "@/lib/points";
import Icon from "@/components/Icon";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { CountUp, Reveal } from "@/components/Motion";
import type { TourStep } from "@/components/Tour";
import Term from "@/components/Term";
import { WELCOME_EVENT } from "@/components/Welcome";

const DayMap = dynamic(() => import("@/components/DayMap"), { ssr: false, loading: () => <div className="h-[420px] rounded-xl bg-slate-900" /> });
const Hero = dynamic(() => import("@/components/Hero"), { ssr: false, loading: () => <div className="-mx-4 min-h-[86vh] md:mx-0" /> });

const Simulator = dynamic(() => import("@/components/Simulator"), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-slate-900" /> });
const SeasonRace = dynamic(() => import("@/components/SeasonRace"), { ssr: false });
const Tour = dynamic(() => import("@/components/Tour"), { ssr: false });
const Welcome = dynamic(() => import("@/components/Welcome"), { ssr: false });
const PlaceSearch = dynamic(() => import("@/components/PlaceSearch"), { ssr: false });
const Industry = dynamic(() => import("@/components/Industry"), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-slate-900" /> });
const Live = dynamic(() => import("@/components/Live"), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-slate-900" /> });

const TABS = [
  { id: "live", label: "Live now" },
  { id: "calendar", label: "Burning calendar" },
  { id: "history", label: "Fire history" },
  { id: "lost", label: "Lost Eyes" },
  { id: "sim", label: "Simulator" },
  { id: "clock", label: "Blind Clock" },
  { id: "industry", label: "Industrial heat" },
  { id: "area", label: "Area & export" },
  { id: "ask", label: "Ask AI" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// One sentence per tab, for someone who has never seen a fire chart.
const PLAIN: Record<Tab, string> = {
  live: "Fires that satellites spotted in Pakistan in the last 24 hours, and which districts are burning more than they normally do at this time of year.",
  calendar: "Each small square is one day. The brighter the colour, the more fires there were that day. Click any day to see its fires on the map.",
  history: "Is this year burning more or less than past years? The bars compare years, the race compares seasons, and the outlook shows what the next two weeks usually bring.",
  lost: "One satellite, Suomi NPP, stopped on 2 November 2026. This shows the fires that only it saw, which we will now miss, and the districts that lose the most.",
  sim: "Turn satellites on and off like light switches, and see how many fires would go unseen without them.",
  clock: "Satellites pass over only at certain hours. This shows the hours when no satellite is watching, so a fire then can be missed completely.",
  industry: "Some hot spots burn almost every day of the year, like brick kilns and gas flares. They are not crop fires, so we take them out of the fire record and show them here instead.",
  area: "Draw a circle anywhere on the map and download the fire data for it as a spreadsheet.",
  ask: "Ask a question in normal words, like: Which district burned the most last November? BlindSpot AI answers from this data and checks its numbers.",
};

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
  const [placeName, setPlaceName] = useState<string | null>(null);
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
    // shareable links: ?r=<region id>&d=<YYYY-MM-DD>#<tab>
    const q = new URLSearchParams(window.location.search);
    if (q.get("r")) setRegionId(q.get("r")!);
    if (q.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(q.get("d")!)) setDate(q.get("d"));
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
    ? { id: "custom", name: placeName ? `${custom.km} km around ${placeName}` : `Custom area: ${custom.km} km around ${custom.lat}, ${custom.lon}`, level: "district", parent: null, lat: custom.lat, lon: custom.lon }
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
      // a custom area is computed in the browser from the years since the all-five window began,
      // not the whole 2000s record (that would be well over 100 MB of downloads)
      const y0 = Number(le.window.from.slice(0, 4));
      const years = await loadYears(idx.years.filter((y) => y >= y0));
      const fromDay = Math.round((Date.parse(`${y0}-01-01`) - Date.parse(idx.start)) / 864e5);
      const area = { kind: "circle" as const, ...custom };
      const reg = { id: "custom", name: "Custom area", level: "district" as const, parent: null };
      const c = buildCalendar(years, idx, area, reg, cal.days - fromDay, fromDay);
      c.constellation = cal.constellation?.map(([d, k]) => [Math.max(0, d - fromDay), k] as [number, string]);
      c.baseline_note += ` Custom areas cover ${y0} onward.`;
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
  const focus = custom && R?.lon && R?.lat ? { lon: R.lon, lat: R.lat } : null;
  const districtIds = useMemo(() => {
    if (custom || !region || !regions || region.level === "country") return null;
    if (region.level === "district") return [region.id];
    return regions.regions.filter((r) => r.parent === region.id).map((r) => r.id);
  }, [custom, region, regions]);
  const years = regions ? `${regions.data_from.slice(0, 4)} to ${regions.data_to.slice(0, 4)}` : "";

  const stats = useMemo(() => {
    if (custom) {
      if (!areaCal || !areaLe) return null;
      return {
        events: (areaCal.events_h ?? areaCal.events).reduce((a, b) => a + b, 0),
        unusual: areaCal.unusual.reduce((a, b) => a + b, 0),
        ...(() => {
          // the loss counts inside the all-five window only
          const w0 = le ? Math.round((Date.parse(le.window.from) - Date.parse(areaCal.start)) / 864e5) : 0;
          const w1 = le ? Math.round((Date.parse(le.window.to) - Date.parse(areaCal.start)) / 864e5) : areaCal.days - 1;
          let lost = 0, win = 0;
          for (let i = Math.max(0, w0); i <= Math.min(areaCal.days - 1, w1); i++) {
            if (areaCal.unusual[i]) win++;
            if (areaCal.unusual[i] && !areaCal.unusual_no_snpp[i]) lost++;
          }
          return { lost, win };
        })(),
        only: areaLe.only_share.SNPP,
        trust: undefined as number | undefined,
      };
    }
    if (!region) return null;
    return { events: region.events_h ?? region.events ?? 0, unusual: region.unusual_days ?? 0, lost: region.unusual_days_lost ?? 0, win: region.unusual_days_window ?? region.unusual_days ?? 0, only: region.only_snpp_share ?? 0, trust: region.trust_now };
  }, [custom, areaCal, areaLe, region, le]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (regionId !== "PAK") q.set("r", regionId);
    if (date) q.set("d", date);
    const qs = q.toString();
    history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}#${tab}`);
  }, [regionId, date, tab]);
  const [copied, setCopied] = useState(false);
  const [touring, setTouring] = useState(false);

  // cursor spotlight on cards
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".spot, .hud-card") as HTMLElement | null;
      if (!el) return;
      const b = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - b.left}px`);
      el.style.setProperty("--my", `${e.clientY - b.top}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const pak = regions?.regions.find((r) => r.id === "PAK");
  const topDistrict = useMemo(
    () => regions?.regions.filter((r) => r.level === "district" && (r.events ?? 0) >= 500).sort((a, b) => (b.only_snpp_share ?? 0) - (a.only_snpp_share ?? 0))[0],
    [regions],
  );
  const modisEra = harm?.eras.find((e) => /^terra\W*aqua$/i.test(e.constellation.replace(/\s/g, "")) || e.label.toLowerCase().includes("modis"));
  const facts = [
    `Suomi NPP stopped on 2 Nov 2026`,
    pak?.only_snpp_share ? `${(pak.only_snpp_share * 100).toFixed(1)}% of Pakistan's fire events were seen by Suomi NPP alone` : null,
    pak?.unusual_days ? `${pak.unusual_days_lost} of ${pak.unusual_days_window ?? pak.unusual_days} unusual burning days since Nov 2023 vanish without Suomi NPP` : null,
    topDistrict ? `${topDistrict.name} loses the most: ${((topDistrict.only_snpp_share ?? 0) * 100).toFixed(0)}% of its fires were Suomi NPP only` : null,
    modisEra?.monthly_error_raw && modisEra.monthly_error_harmonized
      ? `Harmonization cuts monthly count error in MODIS-only years from ${Math.round(modisEra.monthly_error_raw * 100)}% to ${Math.round(modisEra.monthly_error_harmonized * 100)}%`
      : null,
    pak?.events_h ? `${fmt(Math.round(pak.events_h))} harmonized fire events from five satellites` : null,
    `No satellite is watching Pakistan for hours every day: see the Blind Clock`,
  ].filter(Boolean) as string[];

  const tourSteps: TourStep[] = [
    { tab: "calendar", target: "top", title: "One fire record, five satellites", text: "BlindSpot fuses every MODIS and VIIRS hot spot over Pakistan into one consistent record. The time-lapse replays this rice season, and Suomi NPP goes dark on 2 November." },
    { tab: "calendar", target: "explore", title: "The burning calendar", text: "Every square is a day. Colours are harmonized fire events, cyan outlines mark unusual days. Pick any district at the top and everything below follows it." },
    { tab: "sim", target: "explore", title: "Switch satellites off", text: `Turn any satellite off and every fire event is recounted live. Without Suomi NPP, ${pak?.only_snpp_share ? (pak.only_snpp_share * 100).toFixed(1) + "%" : "a fifth"} of the record disappears. Try Terra and Aqua retiring too.` },
    { tab: "lost", target: "explore", title: "Lost Eyes", text: "Which fires only one satellite saw, month by month, by fire size, and which districts lose the most now that Suomi NPP is gone." },
    { tab: "history", target: "explore", title: "Season race and outlook", text: "Each season's running total races the previous ones, and a 14-day outlook says what this area's own history makes likely next." },
    { tab: "clock", target: "explore", title: "The Blind Clock", text: "The hours of the day when no satellite passes over, and a live countdown to the next pass for the selected district." },
    { tab: "industry", target: "explore", title: "Industrial heat", text: "Some spots are hot almost every day of the year: brick kilns, gas flares and factories. BlindSpot keeps them out of the crop-fire record, maps them here, and flags the ones still burning in smog season." },
    { tab: "area", target: "explore", title: "Your own area, as a spreadsheet", text: "Draw a circle anywhere in Pakistan, and every number is recounted for it. Download the fire events, the daily calendar or a monthly summary as CSV." },
    { tab: "live", target: "explore", title: "Live now", text: "Today's fires from NASA FIRMS, fused the same way, compared with each district's own history to raise alerts." },
    { tab: "ask", target: "explore", title: "Ask the data", text: "BlindSpot AI, an analyst that answers from the data with tools, and checks every number it says against the data before you see it." },
  ];
  const onTourStep = (st: TourStep) => {
    go(st.tab as Tab);
    setTimeout(() => {
      if (st.target === "top") window.scrollTo({ top: 0, behavior: "smooth" });
      else document.getElementById(st.target ?? "explore")?.scrollIntoView({ behavior: "smooth" });
    }, 120);
  };

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div className="hud-grid min-h-screen">
      <div className="aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-16">
        <Hero onlySnppShare={le?.regions.PAK.only_share.SNPP ?? null} onlySnpp={le?.regions.PAK.only.SNPP ?? null} />

        <div id="explore" className="sticky top-0 z-30 -mx-4 scroll-mt-0 border-b border-slate-800/80 bg-[#05070d]/85 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" aria-label="BlindSpot home" className="group">
              <Logo />
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
            <PlaceSearch
              areas={(regions?.regions ?? []).filter((r) => r.level !== "country").map((r) => ({ id: r.id, name: r.name, level: r.level }))}
              onRegion={(id) => {
                setCustom(null);
                setRegionId(id);
                if (tab === "area" || tab === "ask") go("calendar");
              }}
              onPick={(h) => {
                setPlaceName(h.name);
                setCustom({ lat: Math.round(h.lat * 1e4) / 1e4, lon: Math.round(h.lon * 1e4) / 1e4, km: 15 });
                if (tab === "area" || tab === "ask") go("calendar");
              }}
            />
            <nav className="flex flex-wrap gap-2" aria-label="Sections">
              {TABS.map((t, i) => {
                const on = tab === t.id;
                const live = t.id === "live";
                return (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
                    aria-current={on ? "page" : undefined}
                    className={`group inline-flex cursor-pointer items-center rounded-xl border px-3.5 py-2 text-sm font-medium shadow-sm transition duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                      on
                        ? live
                          ? "border-red-400 bg-red-500 font-semibold text-white shadow-[0_0_24px_-6px_rgba(239,68,68,0.9)]"
                          : "border-orange-400 bg-orange-500 font-semibold text-black shadow-[0_0_24px_-6px_rgba(249,115,22,0.9)]"
                        : live
                          ? "border-red-500/70 bg-red-500/15 text-red-100 hover:border-red-400 hover:bg-red-500/25 hover:shadow-[0_0_20px_-6px_rgba(239,68,68,0.8)]"
                          : "border-slate-600 bg-slate-800/70 text-slate-100 hover:border-orange-400/70 hover:bg-slate-700/80 hover:text-white hover:shadow-[0_0_18px_-8px_rgba(249,115,22,0.8)]"
                    }`}
                  >
                    {live ? (
                      <span className="relative mr-2 inline-flex h-2.5 w-2.5">
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${on ? "bg-white" : "bg-red-400"}`} />
                        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${on ? "bg-white" : "bg-red-500"}`} />
                      </span>
                    ) : (
                      <span className={`mr-1.5 font-mono text-[10px] ${on ? "text-black/60" : "text-orange-300/80"}`}>0{i}</span>
                    )}
                    {live ? "LIVE now" : t.label}
                  </button>
                );
              })}
            </nav>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {tab === "calendar" ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={withoutSnpp} onChange={() => setWithoutSnpp(!withoutSnpp)} className="h-4 w-4 accent-rose-500" />
                  Switch off Suomi NPP
                </label>
              ) : null}
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                {copied ? <><Icon name="check" /> Link copied</> : <><Icon name="link" /> Share</>}
              </button>
              {!custom ? (
                <a href={`/report?region=${regionId}`} target="_blank" rel="noopener" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
                  <Icon name="download" /> Report PDF
                </a>
              ) : null}
              {!custom ? (
                <a href={`/district/${regionId}`} target="_blank" rel="noopener" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
                  <Icon name="spark" /> Scorecard
                </a>
              ) : null}
              <button
                onClick={() => window.dispatchEvent(new Event(WELCOME_EVENT))}
                className="rounded-lg border border-orange-400/50 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-200 hover:bg-orange-500/20"
              >
                What is this?
              </button>
              <Link href="/method" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
                <Icon name="info" /> How it works
              </Link>
            </div>
          </div>
        </div>

        {facts.length ? (
          <div className="relative -mx-4 overflow-hidden border-b border-slate-800/60 bg-slate-950/40 py-2 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            <div className="marquee">
              {[0, 1].map((k) => (
                <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 1}>
                  {facts.map((f) => (
                    <span key={f} className="flex items-center whitespace-nowrap px-6 font-mono text-xs text-slate-400">
                      <span className="mr-3 inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                      {f}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stats ? (
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={<><Term k="harmonized">Harmonized</Term> <Term k="fire event">fire events</Term>, {custom ? `${le?.window.from.slice(0, 4) ?? ""} to ${regions?.data_to.slice(0, 4) ?? ""}` : years}</>} num={stats.events} format={(v) => fmt(Math.round(v))} sub={R?.name} spark={C ? (C.events_h ?? C.events) : undefined} />
            <Stat label={<Term k="unusual day">Unusual days</Term>} num={stats.unusual} format={(v) => fmt(Math.round(v))} sub={`${fmt(stats.lost)} of ${fmt(stats.win)} since Nov 2023 vanish without Suomi NPP`} />
            <Stat label={<>Seen only by <Term k="suomi npp">Suomi NPP</Term></>} num={stats.only} format={(v) => pct(v)} accent sub="lost from the record since 2 Nov 2026" />
            <Stat
              label={<><Term k="trust score">Trust Score</Term> (0 to 100)</>}
              num={stats.trust}
              format={(v) => v.toFixed(0)}
              value={custom ? "area" : "district view"}
              sub={stats.trust !== undefined ? "agreement, coverage, stability, sample size" : custom ? "scored for districts only" : "pick a district"}
            />
          </section>
        ) : (
          <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-900/60" />
        )}
        {custom && areaBusy ? <p className="mt-3 text-sm text-orange-300">Computing your area from every fire event…</p> : null}

        <main key={tab} className="tab-enter mt-8">
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] px-4 py-3">
            <span className="mt-0.5 shrink-0 rounded-md bg-sky-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300">In plain words</span>
            <p className="text-sm leading-relaxed text-slate-200">{PLAIN[tab]}</p>
          </div>
          {tab === "calendar" ? (
            <div className="space-y-10">
              <section>
                <p className="hud-label">01 · Daily burning calendar</p>
                <h2 className="font-display text-2xl font-semibold text-white">{R?.name}: every day, one square</h2>
                <p className="mb-4 mt-1 max-w-4xl text-sm text-slate-400">
                  <Term k="harmonized">Harmonized</Term> <Term k="fire event">fire events</Term> per day from <Term k="modis">MODIS</Term> + <Term k="viirs">VIIRS</Term> (persistent heat sources removed). {C?.baseline_note}{" "}
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
                  {!custom && R ? <ExplainDay date={date} regionId={regionId} regionName={R.name} /> : null}
                  <DayMap date={date} withoutSnpp={withoutSnpp} focus={focus} districtIds={districtIds} areaName={R?.name} />
                </section>
              ) : null}
              {C ? (
                <Reveal>
                  <RawVsHarmonized key={custom ? "custom" : regionId} cal={C} regionName={R?.name ?? "Pakistan"} />
                </Reveal>
              ) : null}
            </div>
          ) : null}
          {tab === "live" && passes ? (
            <div className="mb-6">
              <NextPass passes={passes} lon={R?.lon ?? 70.5} name={R && R.level !== "country" ? R.name : "Pakistan"} />
            </div>
          ) : null}
          {tab === "live" && regions ? (
            <Live
              regions={regions.regions}
              onPickRegion={(id) => {
                setCustom(null);
                setRegionId(id);
                go("calendar");
                document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          ) : null}
          {tab === "history" && C ? (
            <div className="mb-8">
              <SeasonRace cal={C} regionName={R?.name ?? "Pakistan"} />
            </div>
          ) : null}
          {tab === "history" ? (C ? <History cal={C} harm={harm} regionName={R?.name ?? ""} /> : <div className="h-64 animate-pulse rounded-2xl bg-slate-900" />) : null}
          {tab === "sim" && le && regions ? (
            <Simulator region={custom ? null : region} regions={regions.regions} custom={custom} from={le.window.from} to={le.window.to} areaName={R?.name ?? "Pakistan"} />
          ) : null}
          {tab === "lost" && leView && R && regions ? (
            <LostEyes
              le={leView}
              region={R}
              regions={regions.regions}
              onPickRegion={(id, scroll = true) => {
                setCustom(null);
                setRegionId(id);
                if (scroll) document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          ) : null}
          {tab === "clock" && passes && R ? <BlindClock passes={passes} region={R} /> : null}
          {tab === "industry" && R && regions ? (
            <Industry
              region={R}
              regions={regions.regions}
              onPickRegion={(id) => {
                setCustom(null);
                setRegionId(id);
              }}
            />
          ) : null}
          {tab === "area" && region && regions && cal ? (
            <AreaExport
              region={region}
              regions={regions.regions}
              cal={custom && areaCal ? areaCal : cal}
              custom={custom}
              onApply={(c) => {
                setPlaceName(null);
                setCustom(c);
                if (c) go("calendar");
              }}
            />
          ) : null}
          {tab === "ask" ? <Ask regionId={custom ? regionId : regionId} /> : null}
        </main>

        <Footer />
      </div>

      <Welcome onTour={() => setTouring(true)} />
      {touring ? <Tour steps={tourSteps} onStep={onTourStep} onClose={() => setTouring(false)} /> : null}
      {!touring ? (
        <button
          onClick={() => setTouring(true)}
          className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full border border-slate-600 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-white backdrop-blur transition hover:border-orange-400/70 hover:bg-slate-900"
        >
          <Icon name="play" className="h-3.5 w-3.5 text-orange-400" fill /> 60-second tour
        </button>
      ) : null}
      {tab !== "ask" && !touring ? (
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

function Stat({ label, value, num, format, sub, accent, spark }: { label: React.ReactNode; value?: string; num?: number; format?: (v: number) => string; sub?: string; accent?: boolean; spark?: number[] }) {
  // weekly sparkline of the last two years
  let path = "";
  if (spark && spark.length > 14) {
    const w: number[] = [];
    const from = Math.max(0, spark.length - 728);
    for (let i = from; i < spark.length; i += 7) w.push(spark.slice(i, i + 7).reduce((a, b) => a + b, 0));
    const m = Math.max(1, ...w);
    path = w.map((v, i) => `${i ? "L" : "M"}${(i / (w.length - 1)) * 100},${30 - (v / m) * 28}`).join(" ");
  }
  return (
    <div className={`spot lift relative overflow-hidden rounded-2xl border p-4 ${path ? "pb-9" : ""} ${accent ? "ring border-rose-500/40 bg-rose-500/10" : "border-slate-800/80 bg-slate-900/60"}`}>
      <p className="hud-label">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${accent ? "text-rose-200" : "text-white"}`}>
        {num !== undefined && format ? <CountUp value={num} format={format} /> : value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
      {path ? (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full opacity-60" aria-hidden>
          <path d={`${path} L100,32 L0,32 Z`} fill="url(#sparkfill)" />
          <path d={path} fill="none" stroke="#fb923c" strokeWidth={0.8} vectorEffect="non-scaling-stroke" className="draw" style={{ ["--len" as string]: 400 }} pathLength={400} />
          <defs>
            <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f97316" stopOpacity={0.25} />
              <stop offset="1" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      ) : null}
    </div>
  );
}

const ERA_LABEL: Record<string, string> = {
  Terra: "Terra",
  "Terra,Aqua": "Terra + Aqua (MODIS only)",
  "Terra,Aqua,SNPP": "+ Suomi NPP",
  "Terra,Aqua,SNPP,NOAA20": "+ NOAA-20",
  "Terra,Aqua,SNPP,NOAA20,NOAA21": "all five",
  "Terra,Aqua,NOAA20,NOAA21": "Suomi NPP gone",
};

function RawVsHarmonized({ cal, regionName }: { cal: CalendarFile; regionName: string }) {
  const [all, setAll] = useState(false);
  // recent: weekly over the last three years; all: monthly over the whole record
  const from = all ? 0 : Math.max(0, cal.days - 3 * 365);
  const pts: { m: number; v: number; e: number; d: string }[] = [];
  const push = (i0: number, i1: number) => {
    let m = 0, v = 0, e = 0;
    for (let k = i0; k < i1; k++) {
      m += cal.raw_modis[k];
      v += cal.raw_viirs[k];
      e += (cal.events_h ?? cal.events)[k];
    }
    pts.push({ m, v, e, d: addDays(cal.start, i0) });
  };
  if (all) {
    let i0 = 0;
    for (let i = 1; i <= cal.days; i++) {
      if (i === cal.days || addDays(cal.start, i).slice(8) === "01") {
        push(i0, i);
        i0 = i;
      }
    }
  } else for (let i = from; i < cal.days; i += 7) push(i, Math.min(cal.days, i + 7));
  // scale from the multi-satellite years: the Terra-only months (2000-02) are rough and would flatten the rest
  const firstMulti = cal.constellation?.find(([, k]) => k !== "Terra")?.[0];
  const multiFrom = firstMulti !== undefined ? addDays(cal.start, firstMulti) : "";
  const max = Math.max(1, ...pts.filter((w) => w.d >= multiFrom.slice(0, 8) + "01").map((w) => Math.max(w.v, w.e)));
  const W = 1200, H = 260, L = 56, T = 22;
  const X = (i: number) => L + (i / Math.max(1, pts.length - 1)) * (W - L - 8);
  const Y = (v: number) => T + H - (Math.min(v, max * 1.04) / max) * H;
  const tot = pts.reduce((a, w) => ({ m: a.m + w.m, v: a.v + w.v, e: a.e + w.e }), { m: 0, v: 0, e: 0 });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const line = (k: "m" | "v" | "e") => pts.map((w, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(w[k]).toFixed(1)}`).join(" ");
  const area = `${line("e")} L${X(pts.length - 1)},${T + H} L${X(0)},${T + H} Z`;
  const yearStep = all ? 2 : 1;
  // constellation eras as bands (all-years view)
  const eras: { x0: number; x1: number; label: string }[] = [];
  if (all && cal.constellation?.length) {
    const idx = (day: number) => {
      const k = pts.findIndex((p) => p.d >= addDays(cal.start, day));
      return k < 0 ? pts.length - 1 : k;
    };
    cal.constellation.forEach(([d0, k], n) => {
      const d1 = cal.constellation![n + 1]?.[0] ?? cal.days;
      eras.push({ x0: X(idx(d0)), x1: X(idx(d1)), label: ERA_LABEL[k] ?? k.split(",").join(" + ") });
    });
  }
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">03 · Why harmonize</p>
          <h2 className="mb-1 font-display text-2xl font-semibold text-white">Same fires, three different answers: {regionName}</h2>
          <p className="mb-3 max-w-3xl text-sm text-slate-400">
            Raw MODIS detections, raw VIIRS detections (several satellites, many duplicates) and BlindSpot&apos;s harmonized fire events. Without
            harmonization, &quot;how much burned?&quot; depends on which satellite you ask.
          </p>
        </div>
        <div className="mb-3 flex rounded-lg border border-slate-700 p-0.5 text-xs">
          {[
            { k: false, l: "Last 3 years, weekly" },
            { k: true, l: "Whole record, monthly" },
          ].map((o) => (
            <button key={o.l} onClick={() => setAll(o.k)} className={`rounded-md px-3 py-1.5 transition ${all === o.k ? "bg-orange-500 font-semibold text-black" : "text-slate-300 hover:bg-slate-800"}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>
      <div className="hud-card p-4">
        <svg viewBox={`0 0 ${W} ${T + H + 28}`} className="w-full" role="img" aria-label={`Detections and fire events in ${regionName}`}>
          <defs>
            <linearGradient id="hfill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fb923c" stopOpacity={0.35} />
              <stop offset="1" stopColor="#fb923c" stopOpacity={0} />
            </linearGradient>
          </defs>
          {eras.map((e, n) => (
            <g key={n}>
              <rect x={e.x0} y={T} width={Math.max(0, e.x1 - e.x0)} height={H} fill={n % 2 ? "#0f172a" : "transparent"} opacity={0.7} />
              <line x1={e.x0} x2={e.x0} y1={T - 4} y2={T + H} stroke="#334155" strokeDasharray="3 3" />
              {e.x1 - e.x0 > 70 ? (
                <text x={e.x0 + 5} y={T - 8} fontSize={11} fill="#67e8f9">
                  {e.label}
                </text>
              ) : null}
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - 8} y1={Y(t)} y2={Y(t)} stroke="#1e293b" />
              <text x={L - 8} y={Y(t) + 4} fontSize={12} fill="#64748b" textAnchor="end">
                {t >= 1000 ? `${Math.round(t / 100) / 10}k` : t}
              </text>
            </g>
          ))}
          <path d={area} fill="url(#hfill)" />
          <path d={line("v")} fill="none" stroke="#a78bfa" strokeWidth={1.4} opacity={0.9} />
          <path d={line("m")} fill="none" stroke="#38bdf8" strokeWidth={1.4} />
          <path d={line("e")} fill="none" stroke="#fb923c" strokeWidth={2.2} />
          {pts.map((w, i) => {
            const y = Number(w.d.slice(0, 4));
            const first = all ? w.d.slice(5, 7) === "01" : w.d.slice(5, 7) === "01" && Number(w.d.slice(8)) <= 7;
            return first && y % yearStep === 0 ? (
              <g key={w.d}>
                <line x1={X(i)} x2={X(i)} y1={T + H} y2={T + H + 5} stroke="#475569" />
                <text x={X(i)} y={T + H + 20} fontSize={12} fill="#64748b" textAnchor="middle">
                  {y}
                </text>
              </g>
            ) : null;
          })}
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="flex items-center gap-2 text-violet-300">
            <span className="inline-block h-0.5 w-5 bg-violet-400" /> raw VIIRS detections <b className="font-mono">{fmt(tot.v)}</b>
          </span>
          <span className="flex items-center gap-2 text-sky-300">
            <span className="inline-block h-0.5 w-5 bg-sky-400" /> raw MODIS detections <b className="font-mono">{fmt(tot.m)}</b>
          </span>
          <span className="flex items-center gap-2 font-semibold text-orange-300">
            <span className="inline-block h-1 w-5 rounded bg-orange-400" /> harmonized fire events <b className="font-mono">{fmt(Math.round(tot.e))}</b>
          </span>
          {all ? <span className="text-slate-500">Bands: which satellites were flying. The orange line stays on one scale across all of them.</span> : null}
        </div>
      </div>
    </section>
  );
}
