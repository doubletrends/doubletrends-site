"""
Real S&P 500 drawdown statistics for the Academy flagship article.
Every number the article cites comes from here — reproducible, no fabrication.

Macro stats and the DTEP tie-in use ^GSPC (S&P 500 index).
"""
import os
import sys

import numpy as np
import pandas as pd
import yfinance as yf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "signal"))
from modules.module_1_dtep_raw import compute  # noqa: E402


def load(ticker, **kw):
    df = yf.download(ticker, interval="1d", auto_adjust=False, progress=False, **kw)
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)
    return df


def drawdown_episodes(close):
    """Return list of episodes: (peak_date, trough_date, recovery_date|None, depth)."""
    peak = close.cummax()
    dd = close / peak - 1.0
    episodes = []
    in_ep = False
    start_i = trough_i = 0
    for i in range(len(dd)):
        d = dd.iloc[i]
        if not in_ep and d < 0:
            in_ep = True
            start_i = i - 1 if i > 0 else 0   # the prior peak
            trough_i = i
        elif in_ep:
            if d < dd.iloc[trough_i]:
                trough_i = i
            if d >= 0:  # recovered to a new high
                episodes.append((close.index[start_i], close.index[trough_i],
                                 close.index[i], float(dd.iloc[trough_i])))
                in_ep = False
    if in_ep:  # still under water at series end
        episodes.append((close.index[start_i], close.index[trough_i],
                         None, float(dd.iloc[trough_i])))
    return episodes, dd


def summarize(close, label):
    eps, dd = drawdown_episodes(close)
    years = (close.index[-1] - close.index[0]).days / 365.25
    print(f"\n===== {label}: {close.index[0].date()} → {close.index[-1].date()} "
          f"({years:.0f} yrs, {len(close)} days) =====")

    for thr in (0.05, 0.10, 0.20, 0.30, 0.40, 0.50):
        deep = [e for e in eps if e[3] <= -thr]
        n = len(deep)
        per = years / n if n else float("nan")
        print(f"  declines >= {int(thr*100):>2}%: {n:>3}  (~1 every {per:4.1f} yrs)")

    for name, thr in (("corrections >=10%", 0.10), ("bear markets >=20%", 0.20)):
        deep = [e for e in eps if e[3] <= -thr]
        depths = [-e[3] for e in deep]
        pk2tr = [(e[1] - e[0]).days for e in deep]
        tr2rec = [(e[2] - e[1]).days for e in deep if e[2] is not None]
        print(f"\n  {name}: n={len(deep)}")
        print(f"    avg depth {np.mean(depths)*100:.1f}%  median {np.median(depths)*100:.1f}%  "
              f"worst {max(depths)*100:.1f}%")
        print(f"    avg peak->trough {np.mean(pk2tr):.0f} days (~{np.mean(pk2tr)/30:.1f} mo)")
        print(f"    avg trough->recovery {np.mean(tr2rec):.0f} days (~{np.mean(tr2rec)/30:.1f} mo)")

    pct_under10 = float((dd <= -0.10).mean()) * 100
    pct_under20 = float((dd <= -0.20).mean()) * 100
    print(f"\n  share of days >=10% below peak: {pct_under10:.1f}%")
    print(f"  share of days >=20% below peak: {pct_under20:.1f}%")

    # 5 deepest episodes
    worst = sorted(eps, key=lambda e: e[3])[:6]
    print("\n  deepest episodes:")
    for pk, tr, rec, depth in worst:
        rec_s = rec.date().isoformat() if rec is not None else "ongoing"
        print(f"    {pk.date()} -> trough {tr.date()} ({depth*100:5.1f}%) -> recovered {rec_s}")
    return dd


def dtep_signal_drawdowns():
    df = load("^GSPC", start="2016-01-01")
    res = compute(df)
    close = res["Close"]
    dd = close / close.cummax() - 1.0
    sig_dates = res.index[res["buy_reversal"]]
    print("\n===== DTEP buy_reversal signals vs S&P 500 (^GSPC) drawdown at signal =====")
    for d in sig_dates:
        print(f"    {d.date()}  drawdown {dd.loc[d]*100:6.1f}%")
    depths = [dd.loc[d] for d in sig_dates]
    print(f"  median drawdown at signal: {np.median(depths)*100:.1f}%   "
          f"deepest: {min(depths)*100:.1f}%")


if __name__ == "__main__":
    summarize(load("^GSPC", period="max")["Close"], "S&P 500 (^GSPC)")
    dtep_signal_drawdowns()
