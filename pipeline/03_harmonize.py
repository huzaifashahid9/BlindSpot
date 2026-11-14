"""Harmonize MODIS and VIIRS detections into one event record.

Reads  data/processed/detections.parquet
Writes data/processed/detections_h.parquet  (detections + dedup flag, match, harmonized FRP, event id)
       data/processed/events.parquet        (one row per fused fire event)
       data/processed/calibration.json      (FRP ratios, confidence scores, validation numbers)

Steps
  1. De-duplicate swath overlaps within one satellite pass (keep the pixel closest to nadir).
  2. Match Aqua MODIS to VIIRS: within 30 min and half the MODIS pixel size.
  3. Calibrate MODIS FRP onto the VIIRS scale per scan-size bin (time-split validated).
  4. Common confidence: how often each (sensor, class) is confirmed by another satellite
     that was overhead at about the same time.
  5. Fuse detections from all satellites into daily events (DBSCAN, 750 m).
  6. Flag persistent heat (kilns, industry, flares) that would distort the burning calendar.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.neighbors import BallTree
from tqdm import tqdm

from common import EARTH_KM, PROC

MATCH_MIN = 30
CONF_WINDOW_MIN = 90
EVENT_EPS_KM = 0.75
PERSIST_CELL_DEG = 0.01   # about 1 km
PERSIST_MIN_DAYS = 30     # active on 30+ distinct days in the record -> persistent source
SPLIT_DATE = pd.Timestamp("2025-05-15")
SCAN_BINS = [1.0, 1.25, 1.5, 2.0, 3.0, 5.0]


def rad(df):
    return np.radians(df[["latitude", "longitude"]].to_numpy())


def radius_pairs(X, r):
    """All (i, j) index pairs within radius r (radians, scalar or per-point)."""
    tree = BallTree(X, metric="haversine")
    nb = tree.query_radius(X, r=r)
    lens = np.fromiter((len(a) for a in nb), dtype=np.int64, count=len(nb))
    i = np.repeat(np.arange(len(nb)), lens)
    j = np.concatenate(nb) if len(nb) else np.array([], dtype=np.int64)
    return i, j


def dedup(det: pd.DataFrame) -> pd.Series:
    """Swath-overlap duplicates: same satellite, within 10 minutes and half a pixel."""
    dup = np.zeros(len(det), dtype=bool)
    for (_sat, _d), g in det.groupby(["satellite", "acq_date"]):
        if len(g) < 2:
            continue
        idx = g.index.to_numpy()
        half = (0.5 * np.maximum(g.scan.to_numpy(), g.track.to_numpy())) / EARTH_KM
        i, j = radius_pairs(rad(g), half)
        t = g.ts_utc.to_numpy().astype("datetime64[m]").astype(np.int64)
        scan = g.scan.to_numpy()
        m = (j > i) & (np.abs(t[i] - t[j]) <= 10)
        i, j = i[m], j[m]
        loser = np.where(scan[j] >= scan[i], j, i)  # keep the pixel closer to nadir
        dup[idx[loser]] = True
    return pd.Series(dup, index=det.index)


def match_aqua_viirs(det: pd.DataFrame) -> pd.DataFrame:
    """Pairs of (Aqua detection, VIIRS satellite pass) within 30 min and half a MODIS pixel."""
    aqua = det[(det.satellite == "Aqua") & ~det.dup]
    viirs = det[(det.sensor == "VIIRS") & ~det.dup]
    rows = []
    for d, a in aqua.groupby("acq_date"):
        v = viirs[viirs.acq_date == d]
        if v.empty:
            continue
        tree = BallTree(rad(v), metric="haversine")
        radius = 0.5 * np.maximum(a.scan.to_numpy(), a.track.to_numpy()) / EARTH_KM
        nbs = tree.query_radius(rad(a), r=radius)
        vt = v.ts_utc.to_numpy()
        for (ai, arow), nb in zip(a.iterrows(), nbs):
            if len(nb) == 0:
                continue
            dt = np.abs((vt[nb] - arow.ts_utc.to_datetime64()) / np.timedelta64(1, "m"))
            ok = nb[dt <= MATCH_MIN]
            if len(ok) == 0:
                continue
            vv = v.iloc[ok]
            # one VIIRS pass per MODIS pixel: the satellite closest in time
            vv = vv.assign(dt=np.abs((vv.ts_utc - arow.ts_utc).dt.total_seconds() / 60))
            best_sat = vv.groupby("satellite").dt.min().idxmin()
            vv = vv[vv.satellite == best_sat]
            rows.append({"aqua_det": arow.det_id, "viirs_sat": best_sat, "n_viirs": len(vv),
                         "viirs_frp_sum": vv.frp.sum(), "modis_frp": arow.frp, "scan": arow.scan,
                         "date": arow.local_date, "viirs_dets": vv.det_id.tolist()})
    return pd.DataFrame(rows)


def calibrate(pairs: pd.DataFrame):
    p = pairs[(pairs.modis_frp > 0) & (pairs.viirs_frp_sum > 0)].copy()
    p["bin"] = pd.cut(p.scan, SCAN_BINS, labels=False, include_lowest=True)
    p["lr"] = np.log(p.modis_frp / p.viirs_frp_sum)

    def fit(df):
        return df.groupby("bin").lr.median()

    train, test = p[p.date < SPLIT_DATE], p[p.date >= SPLIT_DATE]
    ratios_train = fit(train)
    t = test.assign(lr_hat=test.bin.map(ratios_train).fillna(train.lr.median()))
    before = t.lr  # log(MODIS / VIIRS) with no correction
    after = t.lr - t.lr_hat

    def r2(x, y):
        x, y = np.log(x), np.log(y)
        return float(1 - ((y - x) ** 2).sum() / ((y - y.mean()) ** 2).sum())

    val = {
        "n_pairs_total": int(len(p)), "n_train": int(len(train)), "n_test": int(len(test)),
        "split_date": SPLIT_DATE.strftime("%Y-%m-%d"),
        "median_ratio_modis_over_viirs": float(np.exp(p.lr.median())),
        "test_median_abs_log_error_before": float(before.abs().median()),
        "test_median_abs_log_error_after": float(after.abs().median()),
        "test_median_bias_factor_before": float(np.exp(before.median())),
        "test_median_bias_factor_after": float(np.exp(after.median())),
        "test_r2_loglog_before": r2(t.modis_frp, t.viirs_frp_sum),
        "test_r2_loglog_after": r2(t.modis_frp / np.exp(t.lr_hat), t.viirs_frp_sum),
    }
    full = fit(p)
    table = [{"bin": int(b), "scan_from_km": SCAN_BINS[int(b)], "scan_to_km": SCAN_BINS[int(b) + 1],
              "ratio": float(np.exp(full[b])), "n_pairs": int((p.bin == b).sum())} for b in full.index]
    return table, val, float(np.exp(p.lr.median()))


def common_confidence(det: pd.DataFrame) -> dict:
    """Confirmation rate per (sensor, class) when another satellite was overhead.

    overhead : another satellite has any detection in the same 1-degree cell within 90 min
    confirmed: another satellite has a detection within 1 km and 90 min
    """
    d = det[~det.dup].copy()
    d["cell"] = np.floor(d.longitude).astype(int) * 1000 + np.floor(d.latitude).astype(int)
    d["tmin"] = ((d.ts_utc - d.ts_utc.dt.normalize()).dt.total_seconds() // 60).astype(int)
    d["satn"] = d.satellite.astype("category").cat.codes
    confirmed = np.zeros(len(d), dtype=bool)
    overhead = np.zeros(len(d), dtype=bool)
    d["pos"] = np.arange(len(d))
    # one day at a time, so memory stays small even for 25 years of detections
    for _dte, g in tqdm(d.groupby("acq_date"), desc="confidence", unit="day"):
        i, j = radius_pairs(rad(g), 1.0 / EARTH_KM)
        sat, tm = g.satn.to_numpy(), g.tmin.to_numpy()
        m = (sat[i] != sat[j]) & (np.abs(tm[i] - tm[j]) <= CONF_WINDOW_MIN)
        confirmed[g.pos.to_numpy()[np.unique(i[m])]] = True
        passes = g[["cell", "satn", "tmin"]].assign(tbin=g.tmin // 5 * 5).drop_duplicates(["cell", "satn", "tbin"])
        mm = g[["pos", "cell", "satn", "tmin"]].merge(passes, on="cell", suffixes=("", "_p"))
        mm = mm[(mm.satn != mm.satn_p) & ((mm.tmin - mm.tmin_p).abs() <= CONF_WINDOW_MIN)]
        overhead[mm.pos.unique()] = True
    d["overhead"], d["confirmed"] = overhead, confirmed
    out = {}
    for (sensor, cls), g in d[d.overhead].groupby(["sensor", "conf_class"]):
        n, c = len(g), int(g.confirmed.sum())
        out[f"{sensor}|{cls}"] = {"n": n, "confirmed": c, "score": (c + 1) / (n + 2)}  # Laplace smoothing
    return out


def fuse_events(det: pd.DataFrame) -> pd.Series:
    labels = np.full(len(det), -1, dtype=np.int64)
    d = det[~det.dup]
    offset = 0
    for _day, g in tqdm(d.groupby("local_date"), desc="fusing events", unit="day"):
        lab = DBSCAN(eps=EVENT_EPS_KM / EARTH_KM, min_samples=1, metric="haversine").fit_predict(rad(g))
        labels[g.index.to_numpy()] = lab + offset
        offset += lab.max() + 1
    return pd.Series(labels, index=det.index)


def main():
    det = pd.read_parquet(PROC / "detections.parquet")
    print(f"{len(det):,} detections")

    det["dup"] = dedup(det)
    print(f"swath duplicates removed: {det.dup.sum():,} ({det.dup.mean():.1%})")

    pairs = match_aqua_viirs(det)
    print(f"Aqua-VIIRS matched pairs: {len(pairs):,}")
    table, val, global_ratio = calibrate(pairs)
    print(json.dumps(val, indent=1))

    # harmonized FRP on the VIIRS scale
    bins = pd.cut(det.scan, SCAN_BINS, labels=False, include_lowest=True)
    ratio_by_bin = {t["bin"]: t["ratio"] for t in table}
    ratio = bins.map(ratio_by_bin).fillna(global_ratio)
    det["frp_ratio_used"] = np.where(det.sensor == "MODIS", ratio, 1.0)
    det["frp_h"] = det.frp / det.frp_ratio_used

    conf = common_confidence(det)
    print(json.dumps(conf, indent=1))
    det["conf_score"] = [conf.get(f"{s}|{c}", {"score": 0.5})["score"] for s, c in zip(det.sensor, det.conf_class)]

    det["event"] = fuse_events(det)
    matched = set(pairs.aqua_det)
    det["matched_pair"] = det.det_id.isin(matched)

    # persistent heat
    gx = np.round(det.longitude / PERSIST_CELL_DEG).astype(int)
    gy = np.round(det.latitude / PERSIST_CELL_DEG).astype(int)
    det["pcell"] = gx * 100000 + gy
    days = det[~det.dup].groupby("pcell").local_date.nunique()
    persistent_cells = set(days[days >= PERSIST_MIN_DAYS].index)
    det["persistent_cell"] = det.pcell.isin(persistent_cells)

    d = det[~det.dup]
    # per-event, per-satellite pass sums, then the event takes its strongest observed pass
    passes = d.groupby(["event", "satellite"]).agg(frp_pass=("frp_h", "sum"), conf=("conf_score", "max"))
    ev_frp = passes.frp_pass.groupby(level=0).max()
    ev_conf = 1 - (1 - passes.conf).groupby(level=0).prod()

    d = d.assign(modis_frp=np.where(d.sensor == "MODIS", d.frp, 0.0),
                 viirs_frp=np.where(d.sensor == "VIIRS", d.frp, 0.0),
                 is_static=(d.type == 2).astype(float),
                 pers=d.persistent_cell.astype(float))
    ev = d.groupby("event").agg(
        local_date=("local_date", "first"),
        lat=("latitude", "mean"), lon=("longitude", "mean"),
        n_det=("det_id", "size"),
        first_pkt=("ts_pkt", "min"), last_pkt=("ts_pkt", "max"),
        persistent_share=("pers", "mean"), static_type=("is_static", "mean"),
        raw_modis_frp=("modis_frp", "sum"), raw_viirs_frp=("viirs_frp", "sum"),
    )
    # district of the event = district of its first detection that falls inside Pakistan
    loc = d.dropna(subset=["district_id"]).drop_duplicates("event").set_index("event")
    ev["district_id"] = loc.district_id.reindex(ev.index)
    ev["district"] = loc.district.reindex(ev.index)
    ev["province"] = loc.province.reindex(ev.index)
    sat_counts = d.groupby(["event", "satellite"]).size().unstack(fill_value=0)
    for s_ in ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"]:
        ev[f"n_{s_}"] = sat_counts[s_].reindex(ev.index).fillna(0).astype(int) if s_ in sat_counts else 0
    names = np.array(["Aqua", "NOAA20", "NOAA21", "SNPP", "Terra"])
    present = np.stack([ev[f"n_{n}"].to_numpy() > 0 for n in names], axis=1)
    ev["sats"] = [",".join(names[row]) for row in present]
    ev["frp_h"] = ev_frp
    ev["conf_h"] = ev_conf.clip(upper=0.99)
    ev["persistent"] = (ev.persistent_share >= 0.5) | (ev.static_type >= 0.5)
    ev["n_sats"] = ev.sats.str.count(",") + 1
    ev["seen_by"] = np.select(
        [ev.sats.str.contains("Terra|Aqua") & ev.sats.str.contains("SNPP|NOAA"),
         ev.sats.str.contains("SNPP|NOAA")], ["both", "viirs_only"], "modis_only")
    ev = ev.drop(columns=["persistent_share", "static_type"]).reset_index()

    det.drop(columns=["pcell"]).to_parquet(PROC / "detections_h.parquet", index=False)
    ev.to_parquet(PROC / "events.parquet", index=False)
    pairs.drop(columns=["viirs_dets"]).to_parquet(PROC / "pairs.parquet", index=False)
    (PROC / "calibration.json").write_text(json.dumps(
        {"frp_ratio_by_scan_bin": table, "frp_validation": val, "global_ratio": global_ratio,
         "confidence": conf, "params": {"match_min": MATCH_MIN, "event_eps_km": EVENT_EPS_KM,
                                        "persist_min_days": PERSIST_MIN_DAYS, "conf_window_min": CONF_WINDOW_MIN},
         "n_detections": int(len(det)), "n_duplicates": int(det.dup.sum()), "n_events": int(len(ev)),
         "n_persistent_events": int(ev.persistent.sum()), "n_persistent_cells": len(persistent_cells)},
        indent=1, default=float))
    print(f"{len(ev):,} events, {ev.persistent.sum():,} persistent; seen_by: {ev.seen_by.value_counts().to_dict()}")


if __name__ == "__main__":
    main()
