"""Shareable scorecards: one small record per district, province and Pakistan.

Reads the published files in web/public/data and writes web/lib/scorecards.json,
which the /district/[id] pages and their share images import at build time.
Run after 04 (calendars) and 05 (industry).
"""
from __future__ import annotations

import json
import statistics
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = ROOT / "web" / "lib" / "scorecards.json"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]


def main() -> None:
    reg = json.loads((DATA / "regions.json").read_text())
    regions = reg["regions"]
    by_id = {r["id"]: r for r in regions}
    to = date.fromisoformat(reg["data_to"])
    ind = json.loads((DATA / "industry.json").read_text()) if (DATA / "industry.json").exists() else None

    # season so far: 1 Sep (Sep to Feb, rice and its tail) or 1 Mar (Mar to Aug, wheat)
    rice = to.month >= 9 or to.month <= 2
    season_year = to.year - 1 if to.month <= 2 else to.year
    start_month = 9 if rice else 3
    label = f"1 {'Sep' if rice else 'Mar'} to {to.day} {to.strftime('%b')} {to.year}"

    out = {}
    for r in regions:
        cal = json.loads((DATA / "calendar" / f"{r['id']}.json").read_text())
        t0 = date.fromisoformat(cal["start"])
        ev = cal["events_h"]

        def season_sum(y: int) -> float:
            a = date(y, start_month, 1)
            b = date(y + (1 if to.month <= 2 else 0), to.month, to.day)
            s, d = 0.0, a
            while d <= b:
                i = (d - t0).days
                if 0 <= i < len(ev):
                    s += ev[i]
                d += timedelta(days=1)
            return s

        past = [season_sum(y) for y in range(t0.year + 1, season_year)]
        now = round(season_sum(season_year))
        med = round(statistics.median(past)) if past else 0

        by_month = [0.0] * 12
        for i, v in enumerate(ev):
            by_month[(t0 + timedelta(days=i)).month - 1] += v

        peers = sorted((x for x in regions if x["level"] == r["level"]), key=lambda x: -(x.get("events_h") or 0))
        rank = None if r["level"] == "country" else [x["id"] for x in peers].index(r["id"]) + 1

        sites = smog = 0
        if ind:
            for s in ind["sites"]:
                d = ind["districts"][s["dist"]]
                if r["level"] == "country" or d == r["id"] or by_id.get(d, {}).get("parent") == r["id"]:
                    sites += 1
                    smog += s["smog_last"] > 0

        out[r["id"]] = {
            "id": r["id"], "name": r["name"], "level": r["level"],
            "province": by_id[r["parent"]]["name"] if r.get("parent") in by_id else None,
            "dataTo": reg["data_to"],
            "events": round(r.get("events_h") or 0), "rank": rank, "rankOf": len(peers),
            "season": {"label": label, "now": now, "median": med, "ratio": round(now / med, 3) if med > 0 else None},
            "peakMonth": MONTHS[by_month.index(max(by_month))],
            "onlySnpp": r.get("only_snpp_share"),
            "unusualLost": r.get("unusual_days_lost") or 0, "unusualWindow": r.get("unusual_days_window") or 0,
            "trustNow": r.get("trust_now"), "trustBefore": r.get("trust_with_snpp"),
            "industry": {"sites": sites, "smog": smog},
        }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(out)} scorecards -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
