"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { addDays, CalendarFile, fmt, Region } from "@/lib/data";
import { Area, districtSet, download, getIndex, loadYears, toCSV } from "@/lib/points";

const AreaPicker = dynamic(() => import("@/components/AreaPicker"), { ssr: false, loading: () => <div className="h-[360px] rounded-xl bg-slate-900" /> });

export type Circle = { lat: number; lon: number; km: number };

type Props = {
  region: Region;
  regions: Region[];
  cal: CalendarFile;
  custom: Circle | null;
  onApply: (c: Circle | null) => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AreaExport({ region, regions, cal, custom, onApply }: Props) {
  const [c, setC] = useState<Circle>(custom ?? { lat: region.lat ?? 31.55, lon: region.lon ?? 74.35, km: 50 });
  const last = addDays(cal.start, cal.days - 1);
  const [from, setFrom] = useState(addDays(cal.start, Math.max(0, cal.days - 365)));
  const [to, setTo] = useState(last);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const slug = (custom ? `area_${custom.lat}_${custom.lon}_${custom.km}km` : region.name).replace(/[^A-Za-z0-9_.-]+/g, "_");
  const series = cal.events_h ?? cal.events;

  async function exportEvents() {
    setBusy(true);
    setMsg("Loading fire events…");
    try {
      const idx = await getIndex();
      const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
      const years = await loadYears(idx.years.filter((y) => y >= y0 && y <= y1));
      const area: Area = custom ? { kind: "circle", ...custom } : { kind: "region", region, districtIdx: districtSet(region, regions, idx) };
      const names = Object.fromEntries(regions.map((r) => [r.id, r.name]));
      const { csv, n } = toCSV(years, idx, area, from, to, names);
      download(`blindspot_fires_${slug}_${from}_${to}.csv`, csv);
      setMsg(`Downloaded ${fmt(n)} fire events.`);
    } catch (e) {
      setMsg(`Could not export: ${String(e).slice(0, 100)}`);
    } finally {
      setBusy(false);
    }
  }

  function exportDaily() {
    const rows = ["date,harmonized_events,events,events_without_suomi_npp,frp_mw,modis,viirs,unusual_day,percentile_vs_other_years"];
    for (let i = 0; i < cal.days; i++) {
      const d = addDays(cal.start, i);
      if (d < from || d > to) continue;
      rows.push([d, series[i], cal.events[i], cal.events_no_snpp[i], cal.frp[i], cal.raw_modis[i], cal.raw_viirs[i], cal.unusual[i], cal.pctl[i] ?? ""].join(","));
    }
    download(`blindspot_daily_${slug}_${from}_${to}.csv`, rows.join("\n"));
    setMsg(`Downloaded ${fmt(rows.length - 1)} days.`);
  }

  function exportMonthly() {
    const m = new Map<string, { h: number; e: number; f: number; u: number }>();
    for (let i = 0; i < cal.days; i++) {
      const d = addDays(cal.start, i);
      if (d < from || d > to) continue;
      const k = d.slice(0, 7);
      const x = m.get(k) ?? { h: 0, e: 0, f: 0, u: 0 };
      x.h += series[i];
      x.e += cal.events[i];
      x.f += cal.frp[i];
      x.u += cal.unusual[i];
      m.set(k, x);
    }
    const rows = ["month,month_name,harmonized_events,events,frp_mw,unusual_days"];
    m.forEach((x, k) => rows.push([k, MONTHS[Number(k.slice(5, 7)) - 1], x.h.toFixed(1), x.e, x.f.toFixed(1), x.u].join(",")));
    download(`blindspot_monthly_${slug}_${from}_${to}.csv`, rows.join("\n"));
    setMsg(`Downloaded ${fmt(rows.length - 1)} months.`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="hud-card p-5">
        <p className="hud-label">01 · Your area of interest</p>
        <h3 className="font-display text-xl font-semibold text-white">Click the map, or type a point and a radius</h3>
        <p className="mb-3 mt-1 text-sm text-slate-400">
          Every chart on this site (calendar, history, unusual days, Lost Eyes) is then recomputed for that circle, in your browser, from every fused fire
          event.
        </p>
        <AreaPicker lat={c.lat} lon={c.lon} km={c.km} onPick={(lat, lon) => setC({ ...c, lat, lon })} />
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <label className="block">
            <span className="hud-label">Latitude</span>
            <input type="number" step="0.01" value={c.lat} onChange={(e) => setC({ ...c, lat: Number(e.target.value) })} className="hud-input" />
          </label>
          <label className="block">
            <span className="hud-label">Longitude</span>
            <input type="number" step="0.01" value={c.lon} onChange={(e) => setC({ ...c, lon: Number(e.target.value) })} className="hud-input" />
          </label>
          <label className="block">
            <span className="hud-label">Radius: {c.km} km</span>
            <input type="range" min={5} max={250} step={5} value={c.km} onChange={(e) => setC({ ...c, km: Number(e.target.value) })} className="mt-3 w-full accent-orange-500" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => onApply(c)} className="btn-primary">
            Analyse this area
          </button>
          {custom ? (
            <button onClick={() => onApply(null)} className="btn-ghost">
              Back to districts
            </button>
          ) : null}
        </div>
      </section>

      <section className="hud-card p-5">
        <p className="hud-label">02 · Download</p>
        <h3 className="font-display text-xl font-semibold text-white">{custom ? `Circle of ${custom.km} km at ${custom.lat}, ${custom.lon}` : region.name}</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="hud-label">From</span>
            <input type="date" value={from} min={cal.start} max={to} onChange={(e) => setFrom(e.target.value)} className="hud-input" />
          </label>
          <label>
            <span className="hud-label">To</span>
            <input type="date" value={to} min={from} max={last} onChange={(e) => setTo(e.target.value)} className="hud-input" />
          </label>
        </div>
        <div className="mt-5 space-y-2">
          <button disabled={busy} onClick={exportEvents} className="btn-primary w-full justify-between">
            <span>Every fire event (CSV)</span>
            <span className="text-xs font-normal opacity-80">location, time, harmonized FRP, satellites</span>
          </button>
          <button onClick={exportDaily} className="btn-ghost w-full justify-between">
            <span>Daily burning calendar (CSV)</span>
            <span className="text-xs opacity-70">harmonized, raw, unusual days</span>
          </button>
          <button onClick={exportMonthly} className="btn-ghost w-full justify-between">
            <span>Monthly summary (CSV)</span>
            <span className="text-xs opacity-70">for reports</span>
          </button>
        </div>
        <p className="mt-3 h-5 text-sm text-emerald-300">{msg}</p>
        <p className="mt-4 text-xs text-slate-500">
          Fire events are fused MODIS + VIIRS detections (750 m, same Pakistan day). FRP is on the VIIRS scale. &quot;harmonized_weight&quot; is how many
          events of today&apos;s five-satellite record each event stands for in its era (1.00 from Nov 2023).
        </p>
      </section>
    </div>
  );
}
