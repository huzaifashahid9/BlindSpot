"""Industrial heat layer: year-round persistent hot spots (likely brick kilns, flares, factories).

Reads the per-year event files the site already ships (web/public/data/points/*.json), so it runs on
the published data alone. Crop burning is seasonal; a 1 km cell that is hot on 60+ days spread over
8+ calendar months is far more likely an industrial source. Writes web/public/data/industry.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data"
CELL = 100            # points store lat/lon x 1e4, so //100 = 0.01 degree cells (about 1 km)
MIN_DAYS = 60
MIN_MONTHS = 8
SMOG_MONTHS = {10, 11, 0}  # Nov, Dec, Jan (0-based month index)


def main():
    idx = json.loads((DATA / "points" / "index.json").read_text())
    start = np.datetime64(idx["start"])
    cells: dict[tuple[int, int], dict] = {}
    last_year = max(idx["years"])
    for y in idx["years"]:
        d = json.loads((DATA / "points" / f"{y}.json").read_text())
        day = np.asarray(d["day"])
        dates = start + day.astype("timedelta64[D]")
        month = dates.astype("datetime64[M]").astype(int) % 12
        year = dates.astype("datetime64[Y]").astype(int) + 1970
        lat, lon = np.asarray(d["lat"]) // CELL, np.asarray(d["lon"]) // CELL
        frp, dist = np.asarray(d["frp"]), np.asarray(d["dist"])
        for i in range(d["n"]):
            c = cells.setdefault((int(lat[i]), int(lon[i])), {"days": set(), "months": set(), "years": set(), "smog": {}, "frp": 0.0, "dist": {}})
            dd = int(day[i])
            c["days"].add(dd)
            c["months"].add(int(month[i]))
            c["years"].add(int(year[i]))
            c["frp"] += frp[i] / 10
            c["dist"][int(dist[i])] = c["dist"].get(int(dist[i]), 0) + 1
            if month[i] in SMOG_MONTHS:  # smog season Nov-Jan, labelled by the year it starts in
                season = int(year[i]) if month[i] >= 10 else int(year[i]) - 1
                c["smog"].setdefault(season, set()).add(dd)

    # the last full smog season (Nov to Jan) before the current year, and the one under way
    season_last, season_now = last_year - 1, last_year
    sites = []
    for (a, b), c in cells.items():
        if len(c["days"]) < MIN_DAYS or len(c["months"]) < MIN_MONTHS:
            continue
        dist = max(c["dist"], key=c["dist"].get)
        if dist < 0:  # outside Pakistan's districts (border buffer): not ours to report
            continue
        first = min(c["years"])
        sites.append({
            "lat": round((a + 0.5) / 100, 3), "lon": round((b + 0.5) / 100, 3),
            "days": len(c["days"]), "months": len(c["months"]),
            "first": first, "last": max(c["years"]), "years": len(c["years"]),
            "frp": round(c["frp"] / len(c["days"]), 1),
            "smog_last": len(c["smog"].get(season_last, ())), "smog_now": len(c["smog"].get(season_now, ())),
            "dist": dist,
        })
    sites.sort(key=lambda s: -s["days"])
    out = {
        "note": f"1 km cells hot on {MIN_DAYS}+ days spread over {MIN_MONTHS}+ calendar months, 2000 to {last_year}. "
                "Year-round heat is typical of brick kilns, flares and factories; crop burning is seasonal.",
        "rule": {"min_days": MIN_DAYS, "min_months": MIN_MONTHS},
        "season_last": season_last, "season_now": season_now, "last_year": last_year, "districts": idx["districts"], "sites": sites,
    }
    (DATA / "industry.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(sites)} sites, {sum(s['last'] == last_year for s in sites)} active in {last_year}, "
          f"{sum(s['smog_last'] > 0 for s in sites)} hot in smog season {season_last}-{season_last + 1}")


if __name__ == "__main__":
    main()
