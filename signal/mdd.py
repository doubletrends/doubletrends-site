"""
Maximum Drawdown — percentile-of-history measure.

For each bar, MDD over a window N = % of closes in the trailing N-bar window
that sit above today's close. Blended MDD = average across several windows.

The blended value drives a four-tier categorization used by the /brief command.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


WINDOWS = (21, 63, 252, 504)  # ~1m / 3m / 1y / 2y trading days


def mdd_window(close: pd.Series, window: int) -> pd.Series:
    """% of closes in the trailing `window` bars that exceed today's close."""
    def _rank(arr: np.ndarray) -> float:
        today = arr[-1]
        return 100.0 * float((arr > today).sum()) / float(len(arr))
    return close.rolling(window).apply(_rank, raw=True)


def mdd_blended(close: pd.Series, windows: tuple[int, ...] = WINDOWS) -> pd.Series:
    """Average MDD across windows. Bars without full warmup on every window
    return NaN — never a partial blend."""
    frame = pd.concat([mdd_window(close, w) for w in windows], axis=1)
    return frame.mean(axis=1, skipna=False)


def categorize(value: float) -> str:
    """Map blended MDD (0-100) to a market-stress tier."""
    if value < 40:
        return "daily_noise"
    if value < 65:
        return "common_correction"
    if value < 85:
        return "bear_market"
    return "crash"
