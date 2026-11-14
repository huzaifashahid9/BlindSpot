"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Calendar from "@/components/Calendar";
import History from "@/components/History";
import Outlook from "@/components/Outlook";
import { addDays, CalendarFile, fmt, getJSON, HarmonizationFile, LostEyesFile, pct, Region, RegionsFile, SAT_LABEL, SATS } from "@/lib/data";
import Icon from "@/components/Icon";

/** One printable page per region: open /report?region=<id> and use "Save as PDF". */
export default function Report() {
  const [id, setId] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionsFile | null>(null);
  const [cal, setCal] = useState<CalendarFile | null>(null);
  const [le, setLe] = useState<LostEyesFile | null>(null);
  const [harm, setHarm] = useState<HarmonizationFile | null>(null);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("region") ?? "PAK";
    setId(r);
    getJSON<RegionsFile>("regions.json").then(setRegions);
    getJSON<CalendarFile>(`calendar/${r}.json`).then(setCal);
    getJSON<LostEyesFile>("lost_eyes.json").then(setLe);
    getJSON<HarmonizationFile>("harmonization.json").then(setHarm);
  }, []);

  const region: Region | undefined = regions?.regions.find((r) => r.id === id);
  const parent = regions?.regions.find((r) => r.id === region?.parent);
  const l = id && le ? le.regions[id] : undefined;

  const topDays = useMemo(() => {
    if (!cal) return [];
    const v = cal.events_h ?? cal.events;
    const out = [];
    for (let i = Math.max(0, cal.days - 365); i < cal.days; i++) if (cal.unusual[i]) out.push({ d: addDays(cal.start, i), v: v[i], p: cal.pctl[i] });
    return out.sort((a, b) => b.v - a.v).slice(0, 10);
  }, [cal]);

  if (!cal || !region) return <p className="p-10 text-slate-400">Preparing the report…</p>;
  const generated = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

  return (
    <div className="report mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div className="no-print flex items-center gap-3">
        <Link href="/" className="text-sm text-orange-300">
          <Icon name="back" /> Back to BlindSpot
        </Link>
        <button onClick={() => window.print()} className="btn-primary ml-auto">
          Save as PDF / Print
        </button>
      </div>

      <header className="flex flex-wrap items-end gap-4 border-b border-slate-800 pb-5">
        <div className="flex-1">
          <p className="hud-label text-orange-300">BlindSpot · district fire report</p>
          <h1 className="font-display text-4xl font-bold text-white">{region.name}</h1>
          <p className="text-slate-400">
            {region.level === "district" ? `District, ${parent?.name ?? "Pakistan"}` : region.level === "province" ? "Province" : "Country"} · data{" "}
            {regions?.data_from} to {regions?.data_to}
          </p>
        </div>
        <p className="font-mono text-xs text-slate-500">generated {generated} PKT</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Harmonized fire events", fmt(Math.round(region.events_h ?? region.events ?? 0))],
          ["Unusual days", fmt(region.unusual_days), `${fmt(region.unusual_days_lost)} of ${fmt(region.unusual_days_window ?? region.unusual_days)} since Nov 2023 lost without Suomi NPP`],
          ["Seen only by Suomi NPP", pct(region.only_snpp_share)],
          ["Trust Score now", region.trust_now !== undefined ? `${region.trust_now} / 100` : "n/a"],
        ].map(([k, v, sub]) => (
          <div key={k} className="hud-card p-4">
            <p className="hud-label">{k}</p>
            <p className="mt-1 font-display text-2xl font-bold text-white">{v}</p>
            {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
          </div>
        ))}
      </section>

      <Outlook cal={cal} regionName={region.name} />

      <section className="grid gap-6 md:grid-cols-2">
        <div className="hud-card p-5">
          <p className="hud-label">Unusual days in the last 12 months</p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {topDays.length ? (
                topDays.map((t) => (
                  <tr key={t.d} className="border-t border-slate-800">
                    <td className="py-1 font-mono">{t.d}</td>
                    <td className="text-right font-mono">{fmt(Math.round(t.v))} events</td>
                    <td className="text-right text-xs text-slate-400">{t.p !== null ? `higher than ${t.p}% of past years` : ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-2 text-slate-400">None flagged.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="hud-card p-5">
          <p className="hud-label">Which satellites see this area</p>
          {l ? (
            <ul className="mt-2 space-y-1 text-sm">
              {SATS.map((s) => (
                <li key={s} className="flex justify-between">
                  <span>Seen only by {SAT_LABEL[s]}</span>
                  <span className="font-mono">{pct(l.only_share[s])}</span>
                </li>
              ))}
              <li className="pt-2 text-xs text-slate-400">
                {fmt(l.events)} events from {le?.window.from} to {le?.window.to}. Suomi NPP stopped on 2 Nov 2026: events only it saw are now missed.
              </li>
            </ul>
          ) : null}
        </div>
      </section>

      {cal.seasons.length ? (
        <section className="hud-card p-5">
          <p className="hud-label">Burning seasons</p>
          <table className="mt-2 w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left font-normal">Season</th>
                <th className="text-left font-normal">Start</th>
                <th className="text-left font-normal">Peak</th>
                <th className="text-left font-normal">End</th>
                <th className="text-right font-normal">Events</th>
              </tr>
            </thead>
            <tbody>
              {cal.seasons.slice(-6).map((s) => (
                <tr key={s.season + s.year} className="border-t border-slate-800">
                  <td className="py-1">
                    {s.season} {s.year}
                  </td>
                  <td>{s.start}</td>
                  <td>{s.peak}</td>
                  <td>{s.end}</td>
                  <td className="text-right font-mono">{fmt(s.events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="break-before-page">
        <p className="hud-label">Daily burning calendar</p>
        <Calendar cal={cal} selected={null} onSelect={() => undefined} withoutSnpp={false} />
      </section>

      <History cal={cal} harm={harm} regionName={region.name} outlook={false} />

      <footer className="border-t border-slate-800 pt-4 text-xs text-slate-500">
        BlindSpot, NASA Space Apps Challenge 2026. Harmonized MODIS + VIIRS fire events from NASA FIRMS (MODIS C6.1; VIIRS 375 m Suomi NPP, NOAA-20,
        NOAA-21). Boundaries: geoBoundaries (CC BY 4.0). Method and validation: blindspot site, /method.
      </footer>
    </div>
  );
}
