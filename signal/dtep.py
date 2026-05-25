"""
DTEP oversold signal — pure reference port of the Pine '%R Trend Exhaustion'.
Only the oversold side is kept (buy_reversal is the product signal).

Pine defaults (Standard formula):
  shortLength=21,  shortSmoothingLength=7
  longLength=112,  longSmoothingLength=3
  smoothType='ema', threshold=20
"""
import numpy as np
import pandas as pd


def williams_r(high, low, close, length):
    # ta.highest/ta.lowest default to high/low; src (close) is the position.
    hh = high.rolling(length).max()
    ll = low.rolling(length).min()
    return 100.0 * (close - hh) / (hh - ll)


def ema(values, length):
    # Matches Pine ta.ema: alpha=2/(length+1), seeded with first non-na value.
    alpha = 2.0 / (length + 1.0)
    out = np.full(len(values), np.nan)
    prev = np.nan
    for i, v in enumerate(np.asarray(values, dtype=float)):
        if np.isnan(v):
            continue
        prev = v if np.isnan(prev) else alpha * v + (1.0 - alpha) * prev
        out[i] = prev
    return pd.Series(out, index=getattr(values, "index", None))


def compute(df, short_len=21, short_smooth=7, long_len=112, long_smooth=3, threshold=20):
    """df needs columns High, Low, Close. Returns df with signal columns added."""
    out = df.copy()
    s = williams_r(out["High"], out["Low"], out["Close"], short_len)
    l = williams_r(out["High"], out["Low"], out["Close"], long_len)
    if short_smooth > 1:
        s = ema(s, short_smooth)
    if long_smooth > 1:
        l = ema(l, long_smooth)

    os_level = -100 + threshold  # default -80
    oversold = (s <= os_level) & (l <= os_level)
    prev = oversold.shift(1, fill_value=False)

    out["s_percentR"] = s
    out["l_percentR"] = l
    out["oversold"] = oversold
    out["enter_oversold"] = oversold & (~prev)        # dropped into OS zone
    out["buy_reversal"] = (~oversold) & prev          # climbed back out (▲)
    return out
