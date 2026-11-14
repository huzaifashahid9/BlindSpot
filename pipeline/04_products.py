"""Build every data product the website shows, and export it as static JSON.

Reads  data/processed/{events,detections_h,pairs}.parquet, calibration.json
Writes web/public/data/
  regions.json                 list of regions (Pakistan, provinces, districts) with headline numbers
  districts.geojson            simplified district shapes
  calendar/<region>.json       daily harmonized calendar with unusual days and critical windows
  lost_eyes.json               what the record loses without Suomi NPP (and Terra, Aqua)
  passes.json                  learned pass times per satellite (Blind Clock)
  trust.json                   Trust Score per district, with Suomi NPP and without
  events/<YYYY-MM-DD>.json     fused events for the day map
  validation.json              every number on the Method page
"""
from __future__ import annotations

import json
import re

import geopandas as gpd
import numpy as np
import pandas as pd

from harmonize_counts import harmonize
from common import ALL_FIVE_END, ALL_FIVE_START, BOUNDS, PKT_OFFSET, PROC, WEB_DATA, r, write_json

SATS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"]
NOW_ACTIVE = ["Terra", "Aqua", "NOAA20", "NOAA21"]
UNUSUAL_PCTL = 90
UNUSUAL_MIN_EVENTS = 3
DOY_WINDOW = 7


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------- regions
def build_regions(ev: pd.DataFrame):
    adm2 = gpd.read_file(BOUNDS / "pak_adm2.geojson")
    adm1 = gpd.read_file(BOUNDS / "pak_adm1.geojson")
    names = ev.dropna(subset=["district_id"]).drop_duplicates("district_id").set_index("district_id")[["district", "province"]]
    regions = [{"id": "PAK", "name": "Pakistan", "level": "country", "parent": None}]
    for p in sorted(adm1.shapeName):
        regions.append({"id": f"prov-{slug(p)}", "name": p, "level": "province", "parent": "PAK"})
    for _, row in adm2.iterrows():
        prov = names.province.get(row.shapeID)
        regions.append({"id": row.shapeID, "name": row.shapeName, "level": "district",
                        "parent": f"prov-{slug(prov)}" if isinstance(prov, str) else "PAK"})
    # simplified shapes for the web map
    g = adm2[["shapeID", "shapeName", "geometry"]].copy()
    g["geometry"] = g.geometry.simplify(0.01, preserve_topology=True)
    cent = adm2.geometry.representative_point()
    g["province"] = g.shapeID.map(names.province)
    g["lon"], g["lat"] = cent.x.round(3), cent.y.round(3)
    g = g.rename(columns={"shapeID": "id", "shapeName": "name"})
    (WEB_DATA / "districts.geojson").write_text(g.to_json(drop_id=True))
    centroids = dict(zip(g.id, zip(g.lon, g.lat)))
    return regions, centroids


def region_masks(ev: pd.DataFrame, regions):
    for reg in regions:
        if reg["level"] == "country":
            yield reg, ev.district_id.notna()
        elif reg["level"] == "province":
            yield reg, ev.province.map(lambda p: isinstance(p, str) and f"prov-{slug(p)}" == reg["id"])
        else:
            yield reg, ev.district_id == reg["id"]


# ---------------------------------------------------------------- calendar
def unusual_flags(series: pd.Series, events: pd.Series):
    """series indexed by date. A day is unusual when its value is above the 90th percentile of the
    same +-7 days of the year in all OTHER years, above the region's median active day, and it has 3+ events."""
    vals = series.to_numpy(dtype=float)
    nev = events.to_numpy()
    doys = series.index.dayofyear.to_numpy()
    yrs = series.index.year.to_numpy()
    n = len(vals)
    flags = np.zeros(n, dtype=bool)
    pct = np.full(n, np.nan)
    base_n = np.zeros(n, dtype=int)
    floor = np.median(vals[vals > 0]) if (vals > 0).any() else 0.0
    by_doy = {d: np.flatnonzero(doys == d) for d in np.unique(doys)}
    pools = {}
    for d in by_doy:
        ids = [by_doy[x] for x in by_doy if min(abs(x - d), 366 - abs(x - d)) <= DOY_WINDOW]
        pools[d] = np.concatenate(ids)
    for k in range(n):
        idx = pools[doys[k]]
        base = vals[idx[yrs[idx] != yrs[k]]]
        base_n[k] = len(base)
        if base_n[k] < 10:
            continue
        thr = np.percentile(base, UNUSUAL_PCTL)
        pct[k] = (base < vals[k]).mean() * 100
        flags[k] = vals[k] > thr and vals[k] >= floor and nev[k] >= UNUSUAL_MIN_EVENTS
    return flags, pct, base_n


def critical_weeks(series: pd.Series):
    """ISO weeks that were in the region's top quartile of weekly FRP in at least half the years."""
    w = series.groupby([series.index.isocalendar().year, series.index.isocalendar().week]).sum()
    w.index.names = ["y", "w"]
    w = w.reset_index(name="v")
    w = w[w.w <= 52]
    if w.v.sum() == 0:
        return []
    w["top"] = w.v >= w.v.quantile(0.75)
    share = w.groupby("w").top.mean()
    nyears = w.y.nunique()
    return sorted(int(k) for k, v in share.items() if v >= 0.5 and nyears >= 2)


def build_calendars(ev, det, regions, all_days, const_runs):
    out_index = {}
    baselines = {}
    ev_ok = ev[~ev.persistent]
    det_ok = det[~det.dup]
    for reg, mask in region_masks(ev_ok, regions):
        e = ev_ok[mask]
        if reg["level"] == "district" and len(e) == 0:
            continue
        if reg["level"] == "country":
            dmask = det_ok.district_id.notna()
        elif reg["level"] == "province":
            dmask = det_ok.province.map(lambda p: isinstance(p, str) and f"prov-{slug(p)}" == reg["id"])
        else:
            dmask = det_ok.district_id == reg["id"]
        dd = det_ok[dmask]
        g = e.groupby("local_date")
        cal = pd.DataFrame(index=all_days)
        cal["events"] = g.size().reindex(all_days).fillna(0).astype(int)
        cal["frp"] = g.frp_h.sum().reindex(all_days).fillna(0.0)
        cal["events_h"] = g.w.sum().reindex(all_days).fillna(0.0)
        e_ns = e[e.sats != "SNPP"]
        cal["events_no_snpp"] = e_ns.groupby("local_date").size().reindex(all_days).fillna(0).astype(int)
        cal["frp_no_snpp"] = e_ns.groupby("local_date").frp_h.sum().reindex(all_days).fillna(0.0)
        cal["raw_modis"] = dd[dd.sensor == "MODIS"].groupby("local_date").size().reindex(all_days).fillna(0).astype(int)
        cal["raw_viirs"] = dd[dd.sensor == "VIIRS"].groupby("local_date").size().reindex(all_days).fillna(0).astype(int)
        cal["unusual"], cal["pctl"], _ = unusual_flags(cal.events_h, cal.events)
        # the record without Suomi NPP, on the same harmonized scale, so both flags share one baseline
        cal["events_h_no_snpp"] = e_ns.groupby("local_date").w.sum().reindex(all_days).fillna(0.0)
        u2, _, _ = unusual_flags(cal.events_h_no_snpp, cal.events_no_snpp)
        cal["unusual_no_snpp"] = u2
        crit = critical_weeks(cal.events_h)
        cal["critical"] = cal.index.isocalendar().week.isin(crit).to_numpy()

        # season metrics per crop season: rabi (Mar-Jun) and kharif (Sep-Dec)
        seasons = []
        for yr in sorted(set(cal.index.year)):
            for name, m0, m1 in [("Wheat harvest (Mar-Jun)", 3, 6), ("Rice harvest (Sep-Dec)", 9, 12)]:
                s = cal.frp[(cal.index.year == yr) & (cal.index.month >= m0) & (cal.index.month <= m1)]
                if len(s) < 60 or s.sum() <= 0:
                    continue
                cs = s.cumsum() / s.sum()
                seasons.append({"season": name, "year": int(yr),
                                "start": cs[cs >= 0.05].index[0].strftime("%Y-%m-%d"),
                                "peak": s.idxmax().strftime("%Y-%m-%d"),
                                "end": cs[cs >= 0.95].index[0].strftime("%Y-%m-%d"),
                                "total_frp_mw": r(s.sum(), 0), "events": int(cal.events[s.index].sum())})
        obj = {
            "region": reg, "start": all_days[0].strftime("%Y-%m-%d"), "days": len(all_days),
            "events": cal.events.tolist(), "events_h": [r(v, 1) for v in cal.events_h], "frp": [r(v, 1) for v in cal.frp],
            "events_no_snpp": cal.events_no_snpp.tolist(),
            "raw_modis": cal.raw_modis.tolist(), "raw_viirs": cal.raw_viirs.tolist(),
            "unusual": [int(x) for x in cal.unusual], "unusual_no_snpp": [int(x) for x in cal.unusual_no_snpp],
            "pctl": [None if np.isnan(x) else int(x) for x in cal.pctl],
            "critical_weeks": crit, "seasons": seasons,
            "constellation": const_runs,
            "baseline_note": "Unusual = harmonized fire events above the 90th percentile of the same +-7 days in the other years on record, and above the region's median burning day (3+ events).",
        }
        write_json(f"calendar/{reg['id']}.json", obj)
        # day-of-year baseline (harmonized events, +-7 days, all years) for the live view and the outlook
        v = cal.events_h.to_numpy()
        doys = cal.index.dayofyear.to_numpy()
        med, p90 = [], []
        for d in range(1, 367):
            dd = np.abs(doys - d)
            base = v[np.minimum(dd, 366 - dd) <= DOY_WINDOW]
            med.append(r(float(np.median(base)), 1) if len(base) else 0)
            p90.append(r(float(np.percentile(base, 90)), 1) if len(base) else 0)
        baselines[reg["id"]] = {"median": med, "p90": p90}
        out_index[reg["id"]] = {"events": int(cal.events.sum()), "events_h": r(cal.events_h.sum(), 0), "frp": r(cal.frp.sum(), 0),
                                "unusual_days": int(cal.unusual.sum()),
                                # counted inside the all-five window: what the record loses from now on
                                "unusual_days_lost": int((cal.unusual & ~cal.unusual_no_snpp)[(cal.index >= ALL_FIVE_START) & (cal.index <= ALL_FIVE_END)].sum()),
                                "unusual_days_window": int(cal.unusual[(cal.index >= ALL_FIVE_START) & (cal.index <= ALL_FIVE_END)].sum())}
    years = sorted(set(all_days.year))
    write_json("baseline.json", {"note": "Per region and day of year (1-366): median and 90th percentile of daily harmonized fire events over +-7 days in all years on record.",
                                 "years": [int(years[0]), int(years[-1])], "regions": baselines})
    return out_index


# ---------------------------------------------------------------- lost eyes
def lost_eyes(ev, regions):
    w = ev[(~ev.persistent) & (ev.local_date >= ALL_FIVE_START) & (ev.local_date <= ALL_FIVE_END)]
    res = {}
    for reg, mask in region_masks(w, regions):
        e = w[mask]
        if len(e) < 1:
            continue
        n = len(e)
        only = {s: int((e.sats == s).sum()) for s in SATS}
        snpp_any = int((e.n_SNPP > 0).sum())
        frp = e.frp_h.sum()
        item = {
            "events": n,
            "only": only,
            "only_share": {s: r(only[s] / n, 4) for s in SATS},
            "snpp_saw": snpp_any, "snpp_saw_share": r(snpp_any / n, 4),
            "frp_only_snpp_share": r(e.frp_h[e.sats == "SNPP"].sum() / frp, 4) if frp > 0 else None,
            "low_conf": n < 100,
        }
        if reg["level"] != "district":
            m = e.groupby(e.local_date.dt.to_period("M"))
            monthly = pd.DataFrame({"all": m.size(), "no_snpp": e[e.sats != "SNPP"].groupby(e.local_date.dt.to_period("M")).size()}).fillna(0)
            item["monthly"] = [{"month": str(k), "all": int(v["all"]), "no_snpp": int(v["no_snpp"])} for k, v in monthly.iterrows()]
            # by fire size: small fires are the ones only one satellite catches
            bins = [0, 2, 5, 10, 25, 1e9]
            labels = ["<2 MW", "2-5 MW", "5-10 MW", "10-25 MW", ">25 MW"]
            e2 = e.assign(sz=pd.cut(e.frp_h, bins, labels=labels, include_lowest=True))
            item["by_size"] = [{"size": str(k), "events": int(len(g)), "only_snpp_share": r((g.sats == "SNPP").mean(), 4)}
                               for k, g in e2.groupby("sz", observed=True)]
        res[reg["id"]] = item
    return {"window": {"from": ALL_FIVE_START.strftime("%Y-%m-%d"), "to": ALL_FIVE_END.strftime("%Y-%m-%d")},
            "note": "Events = fused fire events (all satellites, 750 m, same Pakistan day), persistent heat sources excluded.",
            "regions": res}


# ---------------------------------------------------------------- passes / blind clock
def passes(det):
    d = det[~det.dup].copy()
    d["lst_min"] = ((d.ts_utc - d.ts_utc.dt.normalize()).dt.total_seconds() / 60 + d.longitude * 4) % 1440
    out = {}
    for s in SATS:
        x = d[d.satellite == s]
        res = []
        for dn in ["D", "N"]:
            y = x[x.daynight == dn].lst_min
            if len(y) < 50:
                continue
            # wrap-safe circular centre
            ang = y / 1440 * 2 * np.pi
            c = (np.arctan2(np.sin(ang).mean(), np.cos(ang).mean()) / (2 * np.pi) * 1440) % 1440
            dev = ((y - c + 720) % 1440) - 720
            res.append({"daynight": dn, "lst_center_min": r(c, 0),
                        "half_width_min": r(max(np.percentile(np.abs(dev), 90), 10), 0), "n": int(len(y))})
        by_year = []
        for yr, y in x[x.daynight == "D"].groupby(x.ts_utc.dt.year).lst_min:
            ang = y / 1440 * 2 * np.pi
            c = (np.arctan2(np.sin(ang).mean(), np.cos(ang).mean()) / (2 * np.pi) * 1440) % 1440
            by_year.append({"year": int(yr), "lst_center_min": r(c, 0)})
        out[s] = {"passes": res, "day_pass_by_year": by_year}
    return out


def pkt_windows(pass_info, lon, sats):
    """Pass windows in Pakistan time (minutes after midnight) for a given longitude."""
    wins = []
    for s in sats:
        for p in pass_info[s]["passes"]:
            centre = (p["lst_center_min"] - lon * 4 + 300) % 1440  # LST -> UTC -> PKT
            wins.append((s, centre, p["half_width_min"]))
    return wins


def max_gap(wins):
    if not wins:
        return 1440
    covered = np.zeros(1440, dtype=bool)
    for _s, c, h in wins:
        for m in range(int(c - h), int(c + h) + 1):
            covered[m % 1440] = True
    if covered.all():
        return 0
    arr = np.concatenate([covered, covered])
    best = run = 0
    for v in arr:
        run = 0 if v else run + 1
        best = max(best, run)
    return min(best, 1440)


# ---------------------------------------------------------------- trust
def trust(ev, pairs, det, regions, centroids, pass_info):
    w = ev[(~ev.persistent) & (ev.local_date >= ALL_FIVE_START) & (ev.local_date <= ALL_FIVE_END)]
    pairs = pairs.copy()
    pairs["lr"] = np.log(pairs.modis_frp.clip(lower=0.1) / pairs.viirs_frp_sum.clip(lower=0.1))
    aqua_district = det.set_index("det_id").district_id
    pairs["district_id"] = pairs.aqua_det.map(aqua_district)
    nat_iqr = pairs.lr.quantile(0.75) - pairs.lr.quantile(0.25)
    out = {}
    for reg, mask in region_masks(w, regions):
        if reg["level"] != "district":
            continue
        e = w[mask]
        n = len(e)
        if n == 0:
            continue
        lon = centroids.get(reg["id"], (70, 30))[0]

        def score(sats, events):
            agree = (events.n_sats >= 2).mean() if len(events) else 0
            gap = max_gap(pkt_windows(pass_info, lon, sats))
            cov = float(np.clip(1 - gap / 720, 0, 1))
            p = pairs[pairs.district_id == reg["id"]]
            iqr = (p.lr.quantile(0.75) - p.lr.quantile(0.25)) if len(p) >= 20 else nat_iqr
            stab = float(np.clip(1 - iqr / 3, 0, 1))
            samp = len(events) / (len(events) + 30)
            t = 100 * (0.35 * agree + 0.35 * cov + 0.15 * stab + 0.15 * samp)
            return {"trust": r(t, 1), "agreement": r(agree, 3), "max_gap_min": int(gap), "coverage": r(cov, 3),
                    "stability": r(stab, 3), "sample": r(samp, 3), "events": int(len(events))}

        before = score(SATS, e)
        # after: Suomi NPP is gone, so events only it saw are no longer in the record
        after = score(NOW_ACTIVE, e[e.sats != "SNPP"])
        out[reg["id"]] = {"name": reg["name"], "with_snpp": before, "now": after}
    return {"weights": {"agreement": 0.35, "coverage": 0.35, "stability": 0.15, "sample": 0.15},
            "note": "Trust Score 0-100 per district. 'now' removes Suomi NPP (stopped 2 Nov 2026).",
            "districts": out}


# ---------------------------------------------------------------- day files
def day_files(ev):
    e = ev.copy()
    e["date"] = e.local_date.dt.strftime("%Y-%m-%d")
    cols = ["lat", "lon", "frp_h", "conf_h", "sats", "district", "persistent", "raw_modis_frp", "raw_viirs_frp",
            "n_det", "first_pkt", "last_pkt", "seen_by"]
    for date, g in e.groupby("date"):
        rows = []
        for t in g[cols].itertuples(index=False):
            rows.append([round(t.lat, 4), round(t.lon, 4), round(float(t.frp_h), 1), round(float(t.conf_h), 2),
                         t.sats, t.district if isinstance(t.district, str) else None, int(bool(t.persistent)),
                         round(float(t.raw_modis_frp), 1), round(float(t.raw_viirs_frp), 1), int(t.n_det),
                         t.first_pkt.strftime("%H:%M"), t.last_pkt.strftime("%H:%M"), t.seen_by])
        write_json(f"events/{date}.json", {"date": date, "fields": ["lat", "lon", "frp", "conf", "sats", "district",
                   "persistent", "raw_modis_frp", "raw_viirs_frp", "n_det", "first_pkt", "last_pkt", "seen_by"], "rows": rows})


def points_files(ev, regions, all_days):
    """Compact per-year event files (columnar) for custom areas and CSV download in the browser."""
    ids = [x["id"] for x in regions if x["level"] == "district"]
    dix = {d: i for i, d in enumerate(ids)}
    start = all_days[0]
    sat_bit = {s: 1 << i for i, s in enumerate(SATS)}
    e = ev.copy()
    e["day"] = (e.local_date - start).dt.days
    e["mask"] = sum(((e[f"n_{s}"] > 0).astype(int) * b) for s, b in sat_bit.items())
    years = []
    for yr, g in e.groupby(e.local_date.dt.year):
        years.append(int(yr))
        write_json(f"points/{yr}.json", {
            "year": int(yr), "n": len(g),
            "day": g.day.astype(int).tolist(),
            "lat": (g.lat * 1e4).round().astype(int).tolist(),
            "lon": (g.lon * 1e4).round().astype(int).tolist(),
            "frp": (g.frp_h * 10).round().astype(int).tolist(),
            "conf": (g.conf_h * 100).round().astype(int).tolist(),
            "sats": g["mask"].astype(int).tolist(),
            "ndet": g.n_det.astype(int).tolist(),
            "t": (g.first_pkt.dt.hour * 60 + g.first_pkt.dt.minute).astype(int).tolist(),
            "dist": [dix.get(x, -1) for x in g.district_id],
            "pers": g.persistent.astype(int).tolist(),
            "w": (g.w * 100).round().astype(int).tolist(),
        })
    write_json("points/index.json", {"start": start.strftime("%Y-%m-%d"), "years": years, "districts": ids,
                                     "sat_bits": sat_bit, "scale": {"lat": 1e4, "lon": 1e4, "frp": 10, "conf": 100, "w": 100}})


def main():
    ev = pd.read_parquet(PROC / "events.parquet")
    det = pd.read_parquet(PROC / "detections_h.parquet")
    pairs = pd.read_parquet(PROC / "pairs.parquet")
    cal_meta = json.loads((PROC / "calibration.json").read_text())
    ev["local_date"] = pd.to_datetime(ev.local_date)
    all_days = pd.date_range(ev.local_date.min(), ev.local_date.max(), freq="D")

    w, const, harm = harmonize(ev, all_days)
    ev["w"] = w
    const_runs = []
    for i, k in enumerate(const.to_numpy()):
        if not const_runs or const_runs[-1][1] != k:
            const_runs.append([i, k])
    harm["runs"] = const_runs
    write_json("harmonization.json", harm)
    print("harmonization", [(e["label"], e["monthly_error_raw"], e["monthly_error_harmonized"]) for e in harm["eras"]])

    regions, centroids = build_regions(ev)
    print("regions", len(regions))
    cal_index = build_calendars(ev, det, regions, all_days, const_runs)
    print("calendars", len(cal_index))
    le = lost_eyes(ev, regions)
    write_json("lost_eyes.json", le)
    pinfo = passes(det)
    write_json("passes.json", {"note": "Learned from detection timestamps. lst = local solar time (minutes after midnight).",
                               "snpp_end_utc": "2026-11-02T13:00:00Z", "satellites": pinfo})
    tr = trust(ev, pairs, det, regions, centroids, pinfo)
    write_json("trust.json", tr)
    day_files(ev)
    points_files(ev, regions, all_days)

    for reg in regions:
        rid = reg["id"]
        reg.update(cal_index.get(rid, {}))
        if rid in le["regions"]:
            reg["only_snpp_share"] = le["regions"][rid]["only_share"]["SNPP"]
        if rid in tr["districts"]:
            reg["trust_with_snpp"] = tr["districts"][rid]["with_snpp"]["trust"]
            reg["trust_now"] = tr["districts"][rid]["now"]["trust"]
        if reg["level"] == "district" and rid in centroids:
            reg["lon"], reg["lat"] = centroids[rid]
    write_json("regions.json", {"generated": pd.Timestamp.now('UTC').strftime("%Y-%m-%d %H:%M UTC"),
                                "data_from": all_days[0].strftime("%Y-%m-%d"), "data_to": all_days[-1].strftime("%Y-%m-%d"),
                                "regions": [x for x in regions if x["level"] != "district" or "events" in x]})

    nat = le["regions"]["PAK"]
    validation = {
        "detections": cal_meta["n_detections"], "swath_duplicates": cal_meta["n_duplicates"],
        "events": cal_meta["n_events"], "persistent_events": cal_meta["n_persistent_events"],
        "persistent_cells": cal_meta["n_persistent_cells"],
        "frp_calibration": cal_meta["frp_validation"], "frp_ratio_by_scan_bin": cal_meta["frp_ratio_by_scan_bin"],
        "confidence": cal_meta["confidence"], "params": cal_meta["params"],
        "lost_eyes_national": {k: nat[k] for k in ["events", "only_share", "snpp_saw_share", "frp_only_snpp_share"]},
        "unusual_days_national": cal_index["PAK"]["unusual_days_window"],
        "unusual_days_lost_without_snpp_national": cal_index["PAK"]["unusual_days_lost"],
        "pass_drift": {s: pinfo[s]["day_pass_by_year"] for s in ["Terra", "Aqua"]},
        "harmonization": {k: harm[k] for k in ["reference", "note", "eras", "present"]},
    }
    sens = PROC / "sensitivity.json"
    if sens.exists():
        validation["sensitivity"] = json.loads(sens.read_text())
    write_json("validation.json", validation)
    print(json.dumps(validation["lost_eyes_national"], indent=1))
    print("unusual days (PAK):", cal_index["PAK"])


if __name__ == "__main__":
    main()
