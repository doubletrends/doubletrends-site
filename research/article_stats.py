"""
Real stats for Academy articles 2 (behavior) and 3 (the bottoms).
Everything reproducible — no fabricated numbers.
"""
import os
import sys

import numpy as np
import pandas as pd

from drawdowns import load
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "signal"))
from dtep import compute  # noqa: E402


def best_days_and_missing(start="2000-01-01"):
    close = load("^GSPC", start=start)["Close"]
    r = close.pct_change().dropna()
    dd = (close / close.cummax() - 1.0).reindex(r.index)

    full = (1 + r).prod() - 1
    print(f"\n===== Missing the best days — ^GSPC {r.index[0].date()}→{r.index[-1].date()} =====")
    print(f"  fully invested total return: {full*100:,.0f}%  ($10k -> ${10000*(1+full):,.0f})")
    for k in (10, 20, 30):
        idx_top = r.nlargest(k).index
        ex = (1 + r.drop(idx_top)).prod() - 1
        print(f"  miss best {k:>2} days: {ex*100:,.0f}%  ($10k -> ${10000*(1+ex):,.0f})")

    top = r.nlargest(10)
    in_corr = sum(1 for d in top.index if dd.loc[d] <= -0.10)
    in_bear = sum(1 for d in top.index if dd.loc[d] <= -0.20)
    print(f"  of the 10 best single days: {in_corr}/10 happened while >=10% below peak; "
          f"{in_bear}/10 while >=20% below peak")
    print("  the 10 best days (date, daily %, drawdown then):")
    for d in top.sort_index().index:
        print(f"    {d.date()}  +{r.loc[d]*100:4.1f}%   dd {dd.loc[d]*100:6.1f}%")


def forward_after_drawdown(start="1950-01-01", horizon=252):
    close = load("^GSPC", start=start)["Close"]
    dd = close / close.cummax() - 1.0
    fwd = close.shift(-horizon) / close - 1.0
    valid = fwd.notna()
    base = fwd[valid].mean()
    print(f"\n===== Forward {horizon//21}-month return by how deep the market already is "
          f"(^GSPC since {close.index[0].date()}) =====")
    print(f"  unconditional avg fwd 12m: {base*100:5.1f}%   (% positive {100*(fwd[valid]>0).mean():.0f}%)")
    for thr in (0.10, 0.20):
        m = valid & (dd <= -thr)
        print(f"  when already >= {int(thr*100)}% below peak: avg fwd 12m {fwd[m].mean()*100:5.1f}%   "
              f"(% positive {100*(fwd[m]>0).mean():.0f}%)")


def signal_forward_returns():
    df = load("^GSPC", start="2016-01-01")
    res = compute(df)
    close = res["Close"].reset_index(drop=True)
    dates = res.index
    sig_pos = np.where(res["buy_reversal"].values)[0]
    horizons = {"1m": 21, "3m": 63, "6m": 126, "12m": 252}
    print("\n===== Forward returns after each DTEP signal (S&P 500 ^GSPC) =====")
    print("    date          " + "  ".join(f"{h:>6}" for h in horizons))
    agg = {h: [] for h in horizons}
    for p in sig_pos:
        row = []
        for h, n in horizons.items():
            if p + n < len(close):
                ret = close.iloc[p + n] / close.iloc[p] - 1.0
                agg[h].append(ret)
                row.append(f"{ret*100:5.1f}%")
            else:
                row.append("   n/a")
        print(f"    {dates[p].date()}   " + "  ".join(row))
    print("\n  median forward return across signals:")
    for h in horizons:
        vals = agg[h]
        print(f"    {h:>4}: median {np.median(vals)*100:5.1f}%   "
              f"% positive {100*np.mean([v>0 for v in vals]):.0f}%   (n={len(vals)})")


if __name__ == "__main__":
    best_days_and_missing()
    forward_after_drawdown()
    signal_forward_returns()
