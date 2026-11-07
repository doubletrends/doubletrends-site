"""
One-shot verification of the new `calm` regime branch in classify_regime.
Prints regime counts by year on ^GSPC from 1995 plus a detail dump for the
latest bar and a few stress-period sample points.
"""
from __future__ import annotations

import os
import sys

import yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SIGNAL_DIR = os.path.join(REPO, "signal")
if SIGNAL_DIR not in sys.path:
    sys.path.insert(0, SIGNAL_DIR)

from product import add_product_features, download_fedfunds  # noqa: E402

DETAIL_COLS = [
    "Close", "dd_252", "dd_duration_252", "vix", "vix_percentile_252",
    "oversold_reentries_63", "fed_6m_change", "regime",
]


def download(ticker: str, start: str = "1995-01-01"):
    df = yf.download(ticker, start=start, interval="1d",
                     auto_adjust=False, progress=False)
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)
    return df


def main() -> int:
    cache = os.path.join(os.environ.get("TEMP", os.getcwd()), "yfinance-cache")
    os.makedirs(cache, exist_ok=True)
    yf.set_tz_cache_location(cache)

    gspc = download("^GSPC")
    vix = download("^VIX")
    fedfunds = download_fedfunds()

    out = add_product_features(gspc, vix, fedfunds)
    out = out.dropna(subset=["dd_duration_252"])

    by_year = out.groupby(out.index.year)["regime"].value_counts().unstack(fill_value=0)
    for col in ("calm", "correction", "panic", "bear"):
        if col not in by_year.columns:
            by_year[col] = 0
    by_year = by_year[["calm", "correction", "panic", "bear"]]
    by_year["total"] = by_year.sum(axis=1)

    print("=== regime counts by year ===")
    print(by_year.to_string())
    print(f"\noverall: {dict(out['regime'].value_counts())}")

    print("\n=== latest 10 bars ===")
    print(out[DETAIL_COLS].tail(10).to_string(float_format=lambda v: f"{v:.2f}"))

    print("\n=== sample stress dates ===")
    sample_dates = [
        "2008-10-10", "2008-11-21", "2009-03-09",
        "2020-03-23", "2022-06-17", "2022-10-13",
        "2024-08-05", "2025-04-08",
    ]
    for date in sample_dates:
        if date in out.index:
            row = out.loc[date]
            print(f"{date}: regime={row['regime']!s:<11}"
                  f" dd_252={row['dd_252']:.1f} dur={row['dd_duration_252']:.0f}"
                  f" vix={row['vix']:.1f} vix_pct={row['vix_percentile_252']:.0f}"
                  f" fed_6m={row['fed_6m_change']:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
