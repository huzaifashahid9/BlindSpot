// Numbers for the shareable scorecards (/district/[id]). Built ahead of time by
// pipeline/06_scorecards.py from the same files the dashboard reads, and imported
// statically so the pages and share images need no file access at runtime.
import data from "./scorecards.json";

export type Scorecard = {
  id: string;
  name: string;
  level: "country" | "province" | "district";
  province: string | null;
  dataTo: string;
  events: number;
  rank: number | null;
  rankOf: number;
  season: { label: string; now: number; median: number; ratio: number | null };
  peakMonth: string;
  onlySnpp: number | null;
  unusualLost: number;
  unusualWindow: number;
  trustNow: number | null;
  trustBefore: number | null;
  industry: { sites: number; smog: number };
};

const ALL = data as unknown as Record<string, Scorecard>;

export const scorecardIds = () => Object.keys(ALL);
export const scorecard = (id: string): Scorecard | null => ALL[id] ?? null;

/** One line a person can read aloud. Every number is from the record. */
export function summary(s: Scorecard) {
  const season =
    s.season.ratio === null
      ? ""
      : s.season.ratio >= 1.15
        ? `This season it has burned ${s.season.ratio.toFixed(1)} times more than usual so far.`
        : s.season.ratio <= 0.85
          ? `This season it has burned less than usual so far.`
          : `This season is close to usual so far.`;
  const rank = s.rank ? `${s.name} ranks #${s.rank} of ${s.rankOf} ${s.level === "district" ? "districts" : "provinces"} for fires since 2000.` : "";
  const snpp = s.onlySnpp ? `${Math.round(s.onlySnpp * 100)}% of its recent fires were seen only by the satellite that stopped on 2 Nov 2026.` : "";
  return [rank, season, snpp].filter(Boolean).join(" ");
}

export const fmtN = (n: number) => n.toLocaleString("en-US");
