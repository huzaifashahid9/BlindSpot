// Every fused fire event, per year, in a compact columnar form (written by pipeline/04_products.py).
// Used for custom areas, the hero time-lapse and CSV downloads, all in the browser.
import { addDays, CalendarFile, getJSON, Region } from "@/lib/data";

export type PointsIndex = {
  start: string;
  years: number[];
  districts: string[];
  sat_bits: Record<string, number>;
  scale: { lat: number; lon: number; frp: number; conf: number; w: number };
};

export type PointsYear = {
  year: number;
  n: number;
  day: number[];
  lat: number[];
  lon: number[];
  frp: number[];
  conf: number[];
  sats: number[];
  ndet: number[];
  t: number[];
  dist: number[];
  pers: number[];
  w: number[];
};

export type Area =
  | { kind: "region"; region: Region; districtIdx: Set<number> | null } // null = all of Pakistan
  | { kind: "circle"; lat: number; lon: number; km: number };

export const SNPP_BIT = 4; // Terra 1, Aqua 2, SNPP 4, NOAA20 8, NOAA21 16
export const MODIS_BITS = 1 | 2;
export const VIIRS_BITS = 4 | 8 | 16;

export const getIndex = () => getJSON<PointsIndex>("points/index.json");
export const getYear = (y: number) => getJSON<PointsYear>(`points/${y}.json`);

export async function loadYears(years: number[]) {
  return Promise.all(years.map(getYear));
}

/** Districts belonging to a region (country -> null meaning everything inside Pakistan). */
export function districtSet(region: Region, all: Region[], idx: PointsIndex): Set<number> | null {
  if (region.level === "country") return null;
  const ids = region.level === "district" ? [region.id] : all.filter((r) => r.parent === region.id).map((r) => r.id);
  const s = new Set<number>();
  ids.forEach((id) => {
    const k = idx.districts.indexOf(id);
    if (k >= 0) s.add(k);
  });
  return s;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Indices of events inside an area for one year file. */
export function select(p: PointsYear, area: Area, scale: PointsIndex["scale"], dayFrom = -Infinity, dayTo = Infinity): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.n; i++) {
    const d = p.day[i];
    if (d < dayFrom || d > dayTo) continue;
    if (area.kind === "region") {
      if (area.districtIdx === null ? p.dist[i] < 0 : !area.districtIdx.has(p.dist[i])) continue;
    } else {
      const lat = p.lat[i] / scale.lat, lon = p.lon[i] / scale.lon;
      if (Math.abs(lat - area.lat) > area.km / 100 + 0.1) continue;
      if (haversineKm(lat, lon, area.lat, area.lon) > area.km) continue;
    }
    out.push(i);
  }
  return out;
}

const DOY_WINDOW = 7;

function doy(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
}

/** Same rule as the pipeline: above the 90th pct of +-7 days in other years, above the median active day, 3+ events. */
export function unusualFlags(start: string, vals: number[], counts: number[]) {
  const n = vals.length;
  const doys = new Array(n), yrs = new Array(n);
  for (let i = 0; i < n; i++) {
    const ds = addDays(start, i);
    doys[i] = doy(ds);
    yrs[i] = Number(ds.slice(0, 4));
  }
  const pos = vals.filter((v) => v > 0).sort((a, b) => a - b);
  const floor = pos.length ? pos[Math.floor(pos.length / 2)] : 0;
  const byDoy = new Map<number, number[]>();
  doys.forEach((d, i) => (byDoy.get(d) ?? byDoy.set(d, []).get(d)!).push(i));
  const flags = new Array(n).fill(0);
  const pctl: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const base: number[] = [];
    for (let dd = -DOY_WINDOW; dd <= DOY_WINDOW; dd++) {
      const d = ((doys[i] + dd - 1 + 366) % 366) + 1;
      for (const j of byDoy.get(d) ?? []) if (yrs[j] !== yrs[i]) base.push(vals[j]);
    }
    if (base.length < 10) continue;
    base.sort((a, b) => a - b);
    const pos90 = (base.length - 1) * 0.9;
    const thr = base[Math.floor(pos90)] + (base[Math.ceil(pos90)] - base[Math.floor(pos90)]) * (pos90 - Math.floor(pos90));
    pctl[i] = Math.round((base.filter((b) => b < vals[i]).length / base.length) * 100);
    flags[i] = vals[i] > thr && vals[i] >= floor && counts[i] >= 3 ? 1 : 0;
  }
  return { flags, pctl };
}

/** Build a calendar (same shape the pipeline writes) for any area, from the event points. */
export function buildCalendar(years: PointsYear[], idx: PointsIndex, area: Area, region: Region, days: number): CalendarFile {
  const z = () => new Array(days).fill(0);
  const events = z(), events_h = z(), frp = z(), events_no_snpp = z(), events_h_no_snpp = z(), raw_modis = z(), raw_viirs = z();
  for (const p of years) {
    for (const i of select(p, area, idx.scale)) {
      if (p.pers[i]) continue;
      const d = p.day[i];
      if (d < 0 || d >= days) continue;
      events[d] += 1;
      events_h[d] += p.w[i] / idx.scale.w;
      frp[d] += p.frp[i] / idx.scale.frp;
      if (p.sats[i] !== SNPP_BIT) {
        events_no_snpp[d] += 1;
        events_h_no_snpp[d] += p.w[i] / idx.scale.w;
      }
      if (p.sats[i] & MODIS_BITS) raw_modis[d] += 1;
      if (p.sats[i] & VIIRS_BITS) raw_viirs[d] += 1;
    }
  }
  const u = unusualFlags(idx.start, events_h, events);
  const u2 = unusualFlags(idx.start, events_h_no_snpp, events_no_snpp);
  return {
    region,
    start: idx.start,
    days,
    events,
    events_h: events_h.map((v) => Math.round(v * 10) / 10),
    frp: frp.map((v) => Math.round(v * 10) / 10),
    events_no_snpp,
    raw_modis,
    raw_viirs,
    unusual: u.flags,
    unusual_no_snpp: u2.flags,
    pctl: u.pctl,
    critical_weeks: [],
    seasons: [],
    baseline_note: "Custom area: computed in your browser from every fused fire event. Raw MODIS / VIIRS here count events each sensor saw.",
  };
}

const SAT_NAMES = ["Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"];

/** CSV of every fire event in an area and date range. */
export function toCSV(years: PointsYear[], idx: PointsIndex, area: Area, from: string, to: string, districtNames: Record<string, string>) {
  const d0 = Math.round((Date.parse(from) - Date.parse(idx.start)) / 864e5);
  const d1 = Math.round((Date.parse(to) - Date.parse(idx.start)) / 864e5);
  const head = "date,time_pkt,latitude,longitude,frp_mw_harmonized,satellites,n_satellites,n_detections,confidence,persistent_heat_source,district,harmonized_weight";
  const rows = [head];
  let n = 0;
  for (const p of years) {
    for (const i of select(p, area, idx.scale, d0, d1)) {
      const sats = SAT_NAMES.filter((_, b) => p.sats[i] & (1 << b));
      const t = p.t[i];
      const dist = p.dist[i] >= 0 ? districtNames[idx.districts[p.dist[i]]] ?? "" : "";
      rows.push(
        [
          addDays(idx.start, p.day[i]),
          `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
          (p.lat[i] / idx.scale.lat).toFixed(4),
          (p.lon[i] / idx.scale.lon).toFixed(4),
          (p.frp[i] / idx.scale.frp).toFixed(1),
          `"${sats.join(", ")}"`,
          sats.length,
          p.ndet[i],
          (p.conf[i] / idx.scale.conf).toFixed(2),
          p.pers[i] ? "yes" : "no",
          `"${dist}"`,
          (p.w[i] / idx.scale.w).toFixed(2),
        ].join(","),
      );
      n++;
    }
  }
  return { csv: rows.join("\n"), n };
}

export function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Lost Eyes numbers for any area, inside the window when all five satellites flew. */
export function lostEyesFor(years: PointsYear[], idx: PointsIndex, area: Area, from: string, to: string) {
  const d0 = Math.round((Date.parse(from) - Date.parse(idx.start)) / 864e5);
  const d1 = Math.round((Date.parse(to) - Date.parse(idx.start)) / 864e5);
  const names = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"];
  const only: Record<string, number> = Object.fromEntries(names.map((s) => [s, 0]));
  let n = 0, snppSaw = 0, frp = 0, frpOnly = 0;
  const monthly = new Map<string, { all: number; no_snpp: number }>();
  const sizes = [
    { size: "<2 MW", lo: 0, hi: 2 },
    { size: "2-5 MW", lo: 2, hi: 5 },
    { size: "5-10 MW", lo: 5, hi: 10 },
    { size: "10-25 MW", lo: 10, hi: 25 },
    { size: ">25 MW", lo: 25, hi: Infinity },
  ].map((b) => ({ ...b, events: 0, only: 0 }));
  for (const p of years) {
    for (const i of select(p, area, idx.scale, d0, d1)) {
      if (p.pers[i]) continue;
      n++;
      const s = p.sats[i];
      names.forEach((nm, b) => {
        if (s === 1 << b) only[nm]++;
      });
      if (s & SNPP_BIT) snppSaw++;
      const f = p.frp[i] / idx.scale.frp;
      frp += f;
      if (s === SNPP_BIT) frpOnly += f;
      const mk = addDays(idx.start, p.day[i]).slice(0, 7);
      const m = monthly.get(mk) ?? { all: 0, no_snpp: 0 };
      m.all++;
      if (s !== SNPP_BIT) m.no_snpp++;
      monthly.set(mk, m);
      const b = sizes.find((x) => f >= x.lo && f < x.hi) ?? sizes[0];
      b.events++;
      if (s === SNPP_BIT) b.only++;
    }
  }
  return {
    events: n,
    only,
    only_share: Object.fromEntries(names.map((s) => [s, n ? only[s] / n : 0])),
    snpp_saw: snppSaw,
    snpp_saw_share: n ? snppSaw / n : 0,
    frp_only_snpp_share: frp ? frpOnly / frp : null,
    low_conf: n < 100,
    monthly: [...monthly.entries()].sort().map(([month, v]) => ({ month, ...v })),
    by_size: sizes.filter((b) => b.events > 0).map((b) => ({ size: b.size, events: b.events, only_snpp_share: b.only / b.events })),
  };
}
