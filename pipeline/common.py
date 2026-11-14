"""Shared paths, constants and helpers for the BlindSpot pipeline."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "public" / "data"
BOUNDS = Path(__file__).resolve().parent / "boundaries"

PROC.mkdir(parents=True, exist_ok=True)
WEB_DATA.mkdir(parents=True, exist_ok=True)

EARTH_KM = 6371.0
PKT_OFFSET = pd.Timedelta(hours=5)  # Pakistan Standard Time, no DST

SATELLITES = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"]
SENSOR_OF = {"Terra": "MODIS", "Aqua": "MODIS", "SNPP": "VIIRS", "NOAA20": "VIIRS", "NOAA21": "VIIRS"}

# Satellite codes used by FIRMS files and the Area API -> our names
SAT_CODES = {
    "terra": "Terra", "t": "Terra",
    "aqua": "Aqua", "a": "Aqua",
    "snpp": "SNPP", "n": "SNPP", "npp": "SNPP", "suomi npp": "SNPP",
    "n20": "NOAA20", "noaa20": "NOAA20", "noaa-20": "NOAA20", "1": "NOAA20", "j1": "NOAA20",
    "n21": "NOAA21", "noaa21": "NOAA21", "noaa-21": "NOAA21", "2": "NOAA21", "j2": "NOAA21",
}

# Window in which all five satellites were delivering data (our archive starts 2023-11-15;
# Suomi NPP stopped at 13:00 UTC on 2026-11-02, so the last full day is 2026-11-01).
ALL_FIVE_START = pd.Timestamp("2023-11-15")
ALL_FIVE_END = pd.Timestamp("2026-11-01")
SNPP_END = pd.Timestamp("2026-11-02 13:00")


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_KM * np.arcsin(np.sqrt(a))


def write_json(name: str, obj) -> Path:
    path = WEB_DATA / name
    path.parent.mkdir(parents=True, exist_ok=True)

    def default(o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return None if np.isnan(o) else round(float(o), 4)
        if isinstance(o, (pd.Timestamp,)):
            return o.strftime("%Y-%m-%d")
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(type(o))

    path.write_text(json.dumps(obj, default=default, separators=(",", ":")))
    return path


def r(x, nd=2):
    """Round floats for JSON, keep None for NaN."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return round(float(x), nd)
