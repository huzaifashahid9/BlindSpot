"""Count harmonization across satellite eras.

The number of fire events a constellation records depends on which satellites were flying:
MODIS alone (2000-2011) sees far fewer small fires than MODIS + three VIIRS (2023-2026).
So a raw count jumps whenever a satellite starts or stops, and the jump is not real.

We put every day on one scale, the *all-five reference*: "how many events would the full
2023-2026 constellation (Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21) have recorded".

For a constellation S (the satellites flying on a given day) we learn, inside the window when
all five flew, how many of the events were seen by at least one satellite in S:

    k_S(unit, month) = events_all_five / events_seen_by_S       (unit = province, month = 1..12)

Each event recorded on a day flown by S then counts k_S instead of 1 (its weight w).
For days inside the all-five window S is the full set and w = 1, so nothing changes there.

The same factors are checked by leaving one fire-year out: fit on the other years,
predict the held-out year's monthly counts from S alone, compare with what all five recorded.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import ALL_FIVE_END, ALL_FIVE_START, SNPP_END, r

SATS = ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"]
LABEL = {"Terra": "Terra", "Aqua": "Aqua", "SNPP": "Suomi NPP", "NOAA20": "NOAA-20", "NOAA21": "NOAA-21"}
MIN_SEEN = 30  # below this many events in a unit-month, fall back to the national factor


def key(sats) -> str:
    return ",".join(s for s in SATS if s in sats)


def nice(k: str) -> str:
    return " + ".join(LABEL[s] for s in k.split(",")) if k else "none"


def constellation_by_day(ev: pd.DataFrame, days: pd.DatetimeIndex) -> pd.Series:
    """Satellites delivering data on each day: any detection in Pakistan within +-15 days.
    Suomi NPP is forced off after its last day (2 Nov 2026)."""
    out = {}
    have = {}
    for s in SATS:
        d = pd.Series(1, index=pd.DatetimeIndex(ev.loc[ev[f"n_{s}"] > 0, "local_date"].unique()))
        x = d.reindex(days, fill_value=0).rolling(31, center=True, min_periods=1).max()
        if s == "SNPP":
            x[x.index > SNPP_END.normalize()] = 0
        have[s] = x.astype(bool)
    for day in days:
        out[day] = key([s for s in SATS if have[s][day]])
    return pd.Series(out)


def seen_by(ev: pd.DataFrame, sats) -> np.ndarray:
    m = np.zeros(len(ev), dtype=bool)
    for s in sats:
        m |= ev[f"n_{s}"].to_numpy() > 0
    return m


def factors(win: pd.DataFrame, sats) -> dict:
    """k per (province, month) and national per month, learned on events inside the all-five window."""
    w = win.assign(month=win.local_date.dt.month, seen=seen_by(win, sats))
    w["unit"] = w.province.fillna("PAK")
    nat = w.groupby("month").agg(all=("seen", "size"), seen=("seen", "sum"))
    nat_k = (nat["all"] / nat["seen"].clip(lower=1)).where(nat["seen"] >= MIN_SEEN)
    overall = len(w) / max(1, int(w.seen.sum()))
    nat_k = nat_k.reindex(range(1, 13)).fillna(overall)
    prov = w.groupby(["unit", "month"]).agg(all=("seen", "size"), seen=("seen", "sum"))
    prov_k = {}
    for (u, m), row in prov.iterrows():
        prov_k[(u, m)] = row["all"] / row["seen"] if row["seen"] >= MIN_SEEN else nat_k[m]
    return {"nat": nat_k.to_dict(), "prov": prov_k, "overall": overall}


def weights(ev: pd.DataFrame, const: pd.Series, f_by_key: dict) -> np.ndarray:
    k = const.reindex(ev.local_date).to_numpy()
    month = ev.local_date.dt.month.to_numpy()
    unit = ev.province.fillna("PAK").to_numpy()
    w = np.ones(len(ev))
    for i in range(len(ev)):
        f = f_by_key.get(k[i])
        if f is None:
            continue
        w[i] = f["prov"].get((unit[i], month[i]), f["nat"][month[i]])
    return w


def harmonize(ev: pd.DataFrame, days: pd.DatetimeIndex):
    """Returns (weights per event, info dict for the website and the Method page)."""
    ok = ~ev.persistent
    win = ev[ok & (ev.local_date >= ALL_FIVE_START) & (ev.local_date <= ALL_FIVE_END)]
    const = constellation_by_day(ev, days)
    full = key(SATS)
    keys = sorted(set(const) - {full, ""})
    # also report the eras the history download will bring, even if not present yet
    eras = {
        "Terra": "2000-11 to 2002-07",
        "Terra,Aqua": "2002-07 to 2012-01",
        "Terra,Aqua,SNPP": "2012-01 to 2018-04",
        "Terra,Aqua,SNPP,NOAA20": "2018-04 to 2023-11",
        full: "2023-11 to 2026-11 (reference)",
        "Terra,Aqua,NOAA20,NOAA21": "from 2 Nov 2026",
    }
    for k in eras:
        if k not in keys and k != full:
            keys.append(k)
    f_by_key = {k: factors(win, k.split(",")) for k in keys}
    f_by_key[full] = None
    w = weights(ev, const, {k: v for k, v in f_by_key.items() if v is not None})

    # leave-one-fire-year-out validation
    fy = ((win.local_date - ALL_FIVE_START).dt.days // 365).clip(upper=2)
    tests = []
    for k in [x for x in eras if x != full]:
        sats = k.split(",")
        errs_h, errs_raw, tot = [], [], []
        for y in sorted(fy.unique()):
            train, test = win[fy != y], win[fy == y]
            f = factors(train, sats)
            t = test.assign(month=test.local_date.dt.month, seen=seen_by(test, sats), unit=test.province.fillna("PAK"))
            t["w"] = [f["prov"].get((u, m), f["nat"][m]) for u, m in zip(t.unit, t.month)]
            g = t.groupby(["unit", t.local_date.dt.to_period("M")]).apply(
                lambda d: pd.Series({"actual": len(d), "raw": d.seen.sum(), "pred": (d.w * d.seen).sum()}), include_groups=False)
            g = g[g.actual >= 50]
            errs_h += list(np.abs(g.pred - g.actual) / g.actual)
            errs_raw += list(np.abs(g.raw - g.actual) / g.actual)
            tot.append((t.w * t.seen).sum() / len(t))
        tests.append({
            "constellation": k, "label": nice(k), "era": eras[k],
            "share_seen": r(float(seen_by(win, sats).mean()), 4),
            "k_national": r(f_by_key[k]["overall"], 3),
            "monthly_error_raw": r(float(np.median(errs_raw)), 3) if errs_raw else None,
            "monthly_error_harmonized": r(float(np.median(errs_h)), 3) if errs_h else None,
            "annual_total_ratio": r(float(np.mean(tot)), 3),
            "n_unit_months": len(errs_h),
        })

    present = const.value_counts()
    info = {
        "reference": nice(full),
        "note": "Harmonized events = what the full 2023-2026 five-satellite constellation would have recorded. "
                "Factors learned per province and month inside the all-five window; validated by leaving one fire-year out.",
        "eras": tests,
        "present": [{"constellation": k, "label": nice(k), "days": int(v)} for k, v in present.items()],
        "factors_national": {k: {str(m): r(v, 3) for m, v in f["nat"].items()} for k, f in f_by_key.items() if f},
    }
    return w, const, info
