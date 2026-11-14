// Types and loaders for the static data the pipeline writes to /public/data.

export type Region = {
  id: string;
  name: string;
  level: "country" | "province" | "district";
  parent: string | null;
  events?: number;
  frp?: number;
  unusual_days?: number;
  unusual_days_lost?: number;
  only_snpp_share?: number;
  trust_with_snpp?: number;
  trust_now?: number;
  lon?: number;
  lat?: number;
};

export type RegionsFile = { generated: string; data_from: string; data_to: string; regions: Region[] };

export type Season = {
  season: string;
  year: number;
  start: string;
  peak: string;
  end: string;
  total_frp_mw: number;
  events: number;
};

export type CalendarFile = {
  region: Region;
  start: string;
  days: number;
  events: number[];
  frp: number[];
  events_no_snpp: number[];
  raw_modis: number[];
  raw_viirs: number[];
  unusual: number[];
  unusual_no_snpp: number[];
  pctl: (number | null)[];
  critical_weeks: number[];
  seasons: Season[];
  baseline_note: string;
};

export type DayEvents = { date: string; fields: string[]; rows: (string | number | null)[][] };

export type FireEvent = {
  lat: number;
  lon: number;
  frp: number;
  conf: number;
  sats: string;
  district: string | null;
  persistent: number;
  raw_modis_frp: number;
  raw_viirs_frp: number;
  n_det: number;
  first_pkt: string;
  last_pkt: string;
  seen_by: string;
};

export type LostEyesRegion = {
  events: number;
  only: Record<string, number>;
  only_share: Record<string, number>;
  snpp_saw: number;
  snpp_saw_share: number;
  frp_only_snpp_share: number | null;
  low_conf: boolean;
  monthly?: { month: string; all: number; no_snpp: number }[];
  by_size?: { size: string; events: number; only_snpp_share: number }[];
};

export type LostEyesFile = { window: { from: string; to: string }; note: string; regions: Record<string, LostEyesRegion> };

export type PassInfo = {
  passes: { daynight: "D" | "N"; lst_center_min: number; half_width_min: number; n: number }[];
  day_pass_by_year: { year: number; lst_center_min: number }[];
};

export type PassesFile = { note: string; snpp_end_utc: string; satellites: Record<string, PassInfo> };

export type TrustScore = {
  trust: number;
  agreement: number;
  max_gap_min: number;
  coverage: number;
  stability: number;
  sample: number;
  events: number;
};

export type TrustFile = {
  weights: Record<string, number>;
  note: string;
  districts: Record<string, { name: string; with_snpp: TrustScore; now: TrustScore }>;
};

export const SATS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"] as const;
export type Sat = (typeof SATS)[number];

export const SAT_LABEL: Record<string, string> = {
  Terra: "Terra (MODIS)",
  Aqua: "Aqua (MODIS)",
  SNPP: "Suomi NPP (VIIRS)",
  NOAA20: "NOAA-20 (VIIRS)",
  NOAA21: "NOAA-21 (VIIRS)",
};

export const SAT_COLOR: Record<string, string> = {
  Terra: "#f59e0b",
  Aqua: "#38bdf8",
  SNPP: "#f43f5e",
  NOAA20: "#a78bfa",
  NOAA21: "#34d399",
};

const cache = new Map<string, Promise<unknown>>();

export function getJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`/data/${path}`).then((r) => {
        if (!r.ok) throw new Error(`${path}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

export function toEvents(d: DayEvents): FireEvent[] {
  return d.rows.map((row) => {
    const o: Record<string, unknown> = {};
    d.fields.forEach((f, i) => (o[f] = row[i]));
    return o as FireEvent;
  });
}

export function addDays(start: string, n: number): string {
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayIndex(start: string, date: string): number {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 864e5);
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined) return "n/a";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function minToHHMM(m: number): string {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

// Pass windows in Pakistan time for a longitude: local solar time -> UTC -> PKT (UTC+5)
export function pktWindows(p: PassesFile, lon: number, sats: string[]) {
  const out: { sat: string; daynight: string; centre: number; half: number }[] = [];
  for (const s of sats) {
    for (const w of p.satellites[s]?.passes ?? []) {
      const centre = (((w.lst_center_min - lon * 4 + 300) % 1440) + 1440) % 1440;
      out.push({ sat: s, daynight: w.daynight, centre, half: w.half_width_min });
    }
  }
  return out;
}

export function longestGap(wins: { centre: number; half: number }[]) {
  const covered = new Array(1440).fill(false);
  for (const w of wins) for (let m = Math.round(w.centre - w.half); m <= w.centre + w.half; m++) covered[((m % 1440) + 1440) % 1440] = true;
  if (covered.every(Boolean)) return { gap: 0, from: 0 };
  let best = 0, run = 0, bestEnd = 0;
  for (let i = 0; i < 2880; i++) {
    if (covered[i % 1440]) run = 0;
    else {
      run++;
      if (run > best) {
        best = run;
        bestEnd = i;
      }
    }
  }
  best = Math.min(best, 1440);
  return { gap: best, from: (bestEnd - best + 1) % 1440 };
}
