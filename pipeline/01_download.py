"""Download FIRMS active-fire CSVs from the Area API in 5-day chunks.

Usage (from the repo root):
    pip install requests python-dotenv tqdm
    # put FIRMS_MAP_KEY=xxxx in pipeline/.env
    python pipeline/01_download.py --source VIIRS_NOAA20_NRT --start 2025-10-01 --end 2025-11-30
    python pipeline/01_download.py --all-history        # overnight run, 2000 -> 2023

Files land in data/raw/<SOURCE>/<start-date>.csv. Re-running skips chunks already on disk,
so it is safe to stop and restart.
"""
import argparse
import datetime as dt
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(Path(__file__).with_name(".env"))
MAP_KEY = os.environ.get("FIRMS_MAP_KEY")
BBOX = "60,23,80,37"  # west,south,east,north: Pakistan + Indian Punjab
BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw"
CHUNK_DAYS = 5          # API maximum
PAUSE_S = 1.0           # stay well under 5,000 transactions / 10 min

# Overnight history pull: what the archive tool (1 year per request) does not cover.
HISTORY = [
    ("MODIS_SP", "2000-11-01", "2023-11-14"),
    ("VIIRS_SNPP_SP", "2012-01-20", "2023-11-14"),
    ("VIIRS_NOAA20_SP", "2018-04-01", "2023-11-14"),
    ("VIIRS_NOAA21_SP", "2023-03-01", "2023-11-14"),
]


def fetch(source: str, day: dt.date, ndays: int) -> str:
    url = f"{BASE}/{MAP_KEY}/{source}/{BBOX}/{ndays}/{day.isoformat()}"
    for attempt in range(5):
        try:
            r = requests.get(url, timeout=120)
            if r.status_code == 200 and not r.text.lower().startswith(("invalid", "error")):
                return r.text
            msg = r.text[:200].replace("\n", " ")
            print(f"\n  {source} {day}: HTTP {r.status_code} {msg}", file=sys.stderr)
        except requests.RequestException as e:
            print(f"\n  {source} {day}: {e}", file=sys.stderr)
        time.sleep(10 * (attempt + 1))  # back off, e.g. after hitting the rate limit
    raise RuntimeError(f"giving up on {source} {day}")


def download(source: str, start: str, end: str) -> None:
    d0, d1 = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    folder = OUT / source
    folder.mkdir(parents=True, exist_ok=True)
    days = []
    d = d0
    while d <= d1:
        days.append(d)
        d += dt.timedelta(days=CHUNK_DAYS)
    rows = 0
    for d in tqdm(days, desc=source):
        path = folder / f"{d.isoformat()}.csv"
        if path.exists():
            continue
        n = min(CHUNK_DAYS, (d1 - d).days + 1)
        text = fetch(source, d, n)
        path.write_text(text)
        rows += max(text.count("\n") - 1, 0)
        time.sleep(PAUSE_S)
    print(f"{source}: done, {rows} new rows -> {folder}")


def main() -> None:
    if not MAP_KEY:
        sys.exit("Set FIRMS_MAP_KEY in pipeline/.env first")
    p = argparse.ArgumentParser()
    p.add_argument("--source", help="e.g. MODIS_SP, MODIS_NRT, VIIRS_SNPP_SP, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT")
    p.add_argument("--start")
    p.add_argument("--end", default=dt.date.today().isoformat())
    p.add_argument("--all-history", action="store_true")
    a = p.parse_args()
    if a.all_history:
        for src, s, e in HISTORY:
            download(src, s, e)
    elif a.source and a.start:
        download(a.source, a.start, a.end)
    else:
        p.error("give --source and --start, or --all-history")


if __name__ == "__main__":
    main()
