"""Matched MODIS (Aqua) and VIIRS pairs for the "same fire, two eyes" chart on the Method page.

Reads data/processed/pairs.parquet (written by 03) and writes a small
web/public/data/pairs_sample.json: one row per pair [VIIRS FRP sum, MODIS FRP, MODIS scan km].
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MAX_ROWS = 5000


def main() -> None:
    p = pd.read_parquet(ROOT / "data" / "processed" / "pairs.parquet")
    p = p[(p.modis_frp > 0) & (p.viirs_frp_sum > 0)]
    if len(p) > MAX_ROWS:
        p = p.sample(MAX_ROWS, random_state=0)
    rows = [[round(float(a), 2), round(float(b), 1), round(float(c), 2)] for a, b, c in zip(p.viirs_frp_sum, p.modis_frp, p.scan)]
    out = {
        "note": "Aqua MODIS fire pixels and the VIIRS pixels that saw the same fire within 30 minutes. [VIIRS FRP sum MW, MODIS FRP MW, MODIS scan km].",
        "from": str(pd.Timestamp(p.date.min()).date()), "to": str(pd.Timestamp(p.date.max()).date()),
        "n": len(rows), "pairs": rows,
    }
    dst = ROOT / "web" / "public" / "data" / "pairs_sample.json"
    dst.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(rows)} pairs, {out['from']} to {out['to']} -> {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
