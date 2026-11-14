"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt, getJSON, minToHHMM, pct } from "@/lib/data";
import Icon from "@/components/Icon";

type Validation = {
  detections: number;
  swath_duplicates: number;
  events: number;
  persistent_events: number;
  persistent_cells: number;
  frp_calibration: Record<string, number | string>;
  frp_ratio_by_scan_bin: { bin: number; scan_from_km: number; scan_to_km: number; ratio: number; n_pairs: number }[];
  confidence: Record<string, { n: number; confirmed: number; score: number }>;
  params: Record<string, number>;
  lost_eyes_national: { events: number; only_share: Record<string, number>; snpp_saw_share: number; frp_only_snpp_share: number };
  unusual_days_national: number;
  unusual_days_lost_without_snpp_national: number;
  pass_drift: Record<string, { year: number; lst_center_min: number }[]>;
  sensitivity?: Record<string, unknown>;
};

const n = (x: unknown, d = 2) => (typeof x === "number" ? x.toFixed(d) : String(x));

export default function Method() {
  const [v, setV] = useState<Validation | null>(null);
  useEffect(() => {
    getJSON<Validation>("validation.json").then(setV);
  }, []);
  if (!v) return <div className="p-8 text-slate-400">Loading…</div>;
  const c = v.frp_calibration;
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 leading-relaxed text-slate-300 [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_td]:py-1 [&_td]:pr-4 [&_th]:pr-4 [&_th]:text-left [&_th]:font-normal [&_th]:text-slate-400">
      <Link href="/" className="text-sm text-orange-300">
        <Icon name="back" /> Back to BlindSpot
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-white">Method, validation and credits</h1>
      <p className="mt-2">
        BlindSpot turns {fmt(v.detections)} NASA FIRMS fire detections over Pakistan (15 Nov 2023 to 14 Nov 2026, five satellites) into{" "}
        {fmt(v.events)} harmonized fire events. Every number below is computed by the open pipeline in the repository and can be reproduced.
      </p>

      <h2>1. Harmonization, step by step</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          <b className="text-white">Load and normalise.</b> MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21). Standard
          science-quality data is preferred; near-real-time rows are used only for days the standard archive does not cover yet. Times are converted to
          Pakistan time (UTC+5) and confidence is mapped to low / nominal / high for both sensors.
        </li>
        <li>
          <b className="text-white">Remove swath-overlap duplicates.</b> Same satellite, within 10 minutes and half a pixel: {fmt(v.swath_duplicates)}{" "}
          removed ({pct(v.swath_duplicates / v.detections)}), keeping the pixel closest to nadir.
        </li>
        <li>
          <b className="text-white">Match MODIS to VIIRS.</b> Aqua MODIS pixels paired with VIIRS detections from the same pass (within{" "}
          {v.params.match_min} minutes and half a MODIS pixel): {fmt(Number(c.n_pairs_total))} pairs.
        </li>
        <li>
          <b className="text-white">Put fire power on one scale.</b> MODIS reads {n(c.median_ratio_modis_over_viirs)} times the summed VIIRS FRP for
          the same fire (median). We divide MODIS FRP by a ratio fitted per pixel-size bin, so all FRP is on the VIIRS scale.
        </li>
        <li>
          <b className="text-white">Common confidence.</b> For each sensor and confidence class, how often a detection is confirmed by another satellite
          (within 1 km and {v.params.conf_window_min} minutes) when that satellite was overhead. Events seen by several satellites combine their scores.
        </li>
        <li>
          <b className="text-white">Fuse into events.</b> Detections from all satellites within {v.params.event_eps_km} km on the same Pakistan day
          become one event. Its FRP is its strongest single pass, so a fire seen three times is not counted three times.
        </li>
        <li>
          <b className="text-white">Persistent heat.</b> Spots burning on {v.params.persist_min_days}+ days are kilns, industry or flares, not field
          fires: {fmt(v.persistent_cells)} such 1 km cells, {fmt(v.persistent_events)} events, kept out of the calendar.
        </li>
      </ol>

      <h2>2. Does the FRP calibration work?</h2>
      <p>
        Calibrated on pairs before {String(c.split_date)} ({fmt(Number(c.n_train))} pairs) and tested on later pairs ({fmt(Number(c.n_test))}):
      </p>
      <table className="mt-2 text-sm">
        <thead>
          <tr>
            <th>Test set</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Median MODIS / VIIRS bias factor</td>
            <td>{n(c.test_median_bias_factor_before)}×</td>
            <td className="text-white">{n(c.test_median_bias_factor_after)}×</td>
          </tr>
          <tr>
            <td>Median absolute log error</td>
            <td>{n(c.test_median_abs_log_error_before)}</td>
            <td className="text-white">{n(c.test_median_abs_log_error_after)}</td>
          </tr>
          <tr>
            <td>Log-log R²</td>
            <td>{n(c.test_r2_loglog_before)}</td>
            <td className="text-white">{n(c.test_r2_loglog_after)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm">
        The test set is small because Aqua is drifting away from the VIIRS overpass time (below), so fewer fires are seen by both within 30 minutes.
        Individual fires still scatter a lot: harmonized FRP is reliable for totals and trends, less so for one fire.
      </p>
      <table className="mt-3 text-sm">
        <thead>
          <tr>
            <th>MODIS pixel size</th>
            <th>Ratio used</th>
            <th>Pairs</th>
          </tr>
        </thead>
        <tbody>
          {v.frp_ratio_by_scan_bin.map((b) => (
            <tr key={b.bin}>
              <td>
                {b.scan_from_km} to {b.scan_to_km} km
              </td>
              <td>{b.ratio.toFixed(2)}</td>
              <td>{fmt(b.n_pairs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>3. Confidence on one scale</h2>
      <table className="text-sm">
        <thead>
          <tr>
            <th>Sensor and class</th>
            <th>Confirmed by another satellite</th>
            <th>Detections overhead</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(v.confidence).map(([k, x]) => (
            <tr key={k}>
              <td>{k.replace("|", " ")}</td>
              <td>{pct(x.score)}</td>
              <td>{fmt(x.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>4. Lost Eyes: what the record lost on 2 November 2026</h2>
      <p>
        From 15 Nov 2023 to 1 Nov 2026 all five satellites were flying. Of {fmt(v.lost_eyes_national.events)} fire events,{" "}
        <b className="text-rose-300">{pct(v.lost_eyes_national.only_share.SNPP)}</b> were seen only by Suomi NPP. Suomi NPP saw{" "}
        {pct(v.lost_eyes_national.snpp_saw_share)} of all events and {pct(v.lost_eyes_national.frp_only_snpp_share)} of fire power came from events
        only it saw. Without it, {fmt(v.unusual_days_lost_without_snpp_national)} of {fmt(v.unusual_days_national)} unusual days in Pakistan&apos;s
        calendar would not have been flagged. This is a count of real events, not a model. For comparison, Terra alone saw{" "}
        {pct(v.lost_eyes_national.only_share.Terra)} and Aqua alone {pct(v.lost_eyes_national.only_share.Aqua)}.
      </p>

      <h2>5. Unusual days and critical windows</h2>
      <p>
        A day is unusual when its harmonized fire power is above the 90th percentile of the same ±7 days of the year in the other years on record, at or above the
        region&apos;s median burning day, with at least 3 events. Critical weeks are calendar weeks that were in the region&apos;s top quarter of weekly fire power in at least half the years.
        With three years on record the baseline is short; loading the 2012 to 2023 history (pipeline step 01) strengthens it.
      </p>

      <h2>6. The old satellites are drifting</h2>
      <ul className="list-disc pl-5">
        {Object.entries(v.pass_drift).map(([s, ys]) => (
          <li key={s}>
            {s} daytime pass, mean local solar time: {ys.map((y) => `${y.year} ${minToHHMM(y.lst_center_min)}`).join(", then ")}
          </li>
        ))}
      </ul>

      <h2>7. Limits, stated plainly</h2>
      <ul className="list-disc pl-5">
        <li>Clouds and smoke hide fires from every satellite; no satellite record is complete.</li>
        <li>There is no ground truth: confidence and Lost Eyes are measured against other satellites.</li>
        <li>Terra has no VIIRS partner in time, so it uses the Aqua-derived FRP ratios.</li>
        <li>Pass windows are learned from detection times, not orbit predictions.</li>
        <li>Districts with few events give rough shares; the site marks them.</li>
        <li>The unusual-day baseline uses three years for now.</li>
      </ul>

      <h2>8. Data credits</h2>
      <p className="text-sm">
        We acknowledge the use of data and imagery from NASA&apos;s Fire Information for Resource Management System (FIRMS)
        (https://www.earthdata.nasa.gov/data/tools/firms), part of NASA&apos;s Earth Science Data and Information System (ESDIS). Imagery from NASA&apos;s
        Global Imagery Browse Services (GIBS), part of ESDIS.
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        <li>MODIS Collection 6.1 Active Fire Detections, Terra and Aqua (MCD14ML / MCD14DL), MODIS Science Team, via FIRMS.</li>
        <li>
          VIIRS 375 m Active Fire, Suomi NPP (VNP14IMG / VNP14IMGTDL_NRT), NOAA-20 (VJ114IMG / VJ114IMGTDL_NRT, doi:10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002)
          and NOAA-21 (VJ214IMG / VJ214IMGTDL_NRT), NASA VIIRS Land Science Team, via FIRMS.
        </li>
        <li>Giglio, Schroeder and Justice (2016), Remote Sensing of Environment 178, 31–41, doi:10.1016/j.rse.2016.02.054.</li>
        <li>Schroeder et al. (2014), Remote Sensing of Environment 143, 85–96, doi:10.1016/j.rse.2013.12.008.</li>
        <li>District boundaries: geoBoundaries (Runfola et al. 2020), CC BY 4.0. Basemap © Esri; night lights and relief imagery from NASA GIBS.</li>
      </ul>
      <h2>9. Use of AI</h2>
      <p className="text-sm">
        The Ask BlindSpot assistant uses Google Gemini through function calling over this site&apos;s data, with a server-side check that every number
        in a reply appears in the data. AI coding assistants were used while building the project.
      </p>
    </article>
  );
}
