"""Load every FIRMS CSV we have into one clean table.

Reads:
  data/raw/archive/*.zip         (FIRMS archive download emails, any satellite, any year)
  data/raw/api/<SOURCE>/*.csv    (files written by 01_download.py)
Writes:
  data/processed/detections.parquet

Steps: normalise satellite names and confidence classes, build UTC and Pakistan-time
timestamps, drop near-real-time rows wherever standard (science-quality) rows exist for the
same satellite and day, and attach province and district by point-in-polygon.
"""
from __future__ import annotations

import io
import zipfile

import geopandas as gpd
import numpy as np
import pandas as pd

from common import BOUNDS, PKT_OFFSET, PROC, RAW, SAT_CODES, SENSOR_OF

COLS = ["latitude", "longitude", "scan", "track", "acq_date", "acq_time", "satellite",
        "instrument", "confidence", "version", "frp", "daynight", "type"]


def read_frames():
    frames = []
    for z in sorted((RAW / "archive").glob("*.zip")):
        with zipfile.ZipFile(z) as zf:
            for name in zf.namelist():
                if not name.endswith(".csv"):
                    continue
                df = pd.read_csv(io.BytesIO(zf.read(name)), dtype={"confidence": str, "version": str})
                df["is_nrt"] = "nrt" in name.lower()
                df["src_file"] = f"{z.name}/{name}"
                frames.append(df)
    for f in sorted((RAW / "archive").glob("*.csv")):
        df = pd.read_csv(f, dtype={"confidence": str, "version": str})
        df["is_nrt"] = "nrt" in f.name.lower()
        df["src_file"] = f.name
        frames.append(df)
    for f in sorted((RAW / "api").glob("*/*.csv")):
        if f.stat().st_size < 10:
            continue
        df = pd.read_csv(f, dtype={"confidence": str, "version": str})
        if df.empty:
            continue
        df["is_nrt"] = f.parent.name.endswith("_NRT")
        df["src_file"] = f"{f.parent.name}/{f.name}"
        frames.append(df)
    if not frames:
        raise SystemExit("No FIRMS files found in data/raw/archive or data/raw/api")
    return frames


def conf_class(row_conf: pd.Series, sensor: pd.Series) -> pd.Series:
    out = pd.Series("nominal", index=row_conf.index)
    v = row_conf.str.lower().str.strip()
    out[(sensor == "VIIRS") & v.isin(["l", "low"])] = "low"
    out[(sensor == "VIIRS") & v.isin(["h", "high"])] = "high"
    num = pd.to_numeric(v, errors="coerce")
    m = sensor == "MODIS"
    out[m & (num < 30)] = "low"
    out[m & (num >= 80)] = "high"
    return out


def main():
    df = pd.concat(read_frames(), ignore_index=True)
    for c in COLS:
        if c not in df:
            df[c] = np.nan
    df["satellite"] = df["satellite"].astype(str).str.strip().str.lower().map(SAT_CODES)
    bad = df["satellite"].isna().sum()
    if bad:
        print(f"warning: {bad} rows with unknown satellite code dropped")
    df = df.dropna(subset=["satellite", "latitude", "longitude"])
    df["sensor"] = df["satellite"].map(SENSOR_OF)

    t = df["acq_time"].astype(int)
    df["ts_utc"] = pd.to_datetime(df["acq_date"]) + pd.to_timedelta(t // 100, "h") + pd.to_timedelta(t % 100, "m")
    df["ts_pkt"] = df["ts_utc"] + PKT_OFFSET
    df["local_date"] = df["ts_pkt"].dt.normalize()
    df["conf_class"] = conf_class(df["confidence"].astype(str), df["sensor"])
    df["frp"] = pd.to_numeric(df["frp"], errors="coerce").fillna(0.0)

    # Prefer standard (SP) rows: drop NRT rows for any satellite-day that has SP rows.
    sp_days = set(map(tuple, df.loc[~df.is_nrt, ["satellite", "acq_date"]].drop_duplicates().values))
    nrt_dup = df.is_nrt.to_numpy() & np.array([k in sp_days for k in zip(df.satellite, df.acq_date)], dtype=bool)
    df = df[~nrt_dup]
    # Same detection can appear in two overlapping requests: exact duplicates go.
    df = df.drop_duplicates(subset=["satellite", "latitude", "longitude", "acq_date", "acq_time"])

    # Province and district
    adm2 = gpd.read_file(BOUNDS / "pak_adm2.geojson")[["shapeName", "shapeID", "geometry"]]
    adm1 = gpd.read_file(BOUNDS / "pak_adm1.geojson")[["shapeName", "geometry"]].rename(columns={"shapeName": "province"})
    adm2 = adm2.rename(columns={"shapeName": "district", "shapeID": "district_id"})
    reps = adm2.copy()
    reps["geometry"] = adm2.geometry.representative_point()
    adm2 = adm2.merge(gpd.sjoin(reps, adm1, predicate="within")[["district_id", "province"]], on="district_id", how="left")

    pts = gpd.GeoDataFrame(df[["latitude"]].copy(), geometry=gpd.points_from_xy(df.longitude, df.latitude), crs="EPSG:4326")
    j = gpd.sjoin(pts, adm2[["district_id", "district", "province", "geometry"]], predicate="within", how="left")
    j = j[~j.index.duplicated()]
    df["district_id"] = j["district_id"].values
    df["district"] = j["district"].values
    df["province"] = j["province"].values
    df["in_pakistan"] = df["district_id"].notna()

    keep = ["latitude", "longitude", "scan", "track", "satellite", "sensor", "ts_utc", "ts_pkt", "local_date",
            "acq_date", "acq_time", "confidence", "conf_class", "frp", "daynight", "type", "version", "is_nrt",
            "district_id", "district", "province", "in_pakistan"]
    df = df[keep].sort_values("ts_utc").reset_index(drop=True)
    df["det_id"] = np.arange(len(df))
    df.to_parquet(PROC / "detections.parquet", index=False)

    print(f"{len(df):,} detections, {df.local_date.min():%Y-%m-%d} to {df.local_date.max():%Y-%m-%d}")
    print(df.groupby("satellite").agg(n=("det_id", "size"), first=("local_date", "min"), last=("local_date", "max")))
    print(f"in Pakistan: {df.in_pakistan.mean():.1%}")


if __name__ == "__main__":
    main()
