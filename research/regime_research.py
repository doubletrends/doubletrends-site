"""
Research diagnostics for classifying raw DTEP reversals into panic-event vs
bear-market regimes.

This script does not change product behavior. It prints feature tables around
known periods so threshold/state-machine ideas can be compared without
overfitting to one date.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.request
from dataclasses import dataclass

import pandas as pd
import yfinance as yf


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SIGNAL_DIR = os.path.join(REPO, "signal")
if SIGNAL_DIR not in sys.path:
    sys.path.insert(0, SIGNAL_DIR)

from modules.module_1_dtep_raw import compute  # noqa: E402
from mdd import categorize, mdd_blended  # noqa: E402


@dataclass(frozen=True)
class Period:
    name: str
    start: str
    end: str


PERIODS = (
    Period("gfc_2008_2009", "2008-01-01", "2009-06-30"),
    Period("rate_bear_2022_2023", "2022-01-01", "2023-12-31"),
    Period("tariff_panic_2025", "2025-02-01", "2025-05-31"),
    Period("geo_panic_2026", "2026-02-01", "2026-05-31"),
)


def configure_yfinance_cache() -> None:
    cache = os.path.join(os.environ.get("TEMP", os.getcwd()), "yfinance-cache")
    os.makedirs(cache, exist_ok=True)
    yf.set_tz_cache_location(cache)


def download(ticker: str, start: str, end: str | None = None) -> pd.DataFrame:
    df = pd.DataFrame()
    for attempt in range(3):
        df = yf.download(
            ticker,
            start=start,
            end=end,
            interval="1d",
            auto_adjust=False,
            progress=False,
        )
        if not df.empty:
            break
        if attempt < 2:
            time.sleep(2.0)
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)
    return df


def download_fedfunds() -> pd.Series:
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS"
    with urllib.request.urlopen(url, timeout=30) as response:
        frame = pd.read_csv(response)
    frame["observation_date"] = pd.to_datetime(frame["observation_date"])
    values = pd.to_numeric(frame["FEDFUNDS"], errors="coerce")
    return pd.Series(values.to_numpy(), index=frame["observation_date"], name="fedfunds")


def bars_since_high(close: pd.Series, window: int) -> pd.Series:
    def _age(arr):
        # Last occurrence matters if the rolling high was repeated.
        max_value = arr.max()
        last_pos = max(i for i, value in enumerate(arr) if value == max_value)
        return len(arr) - 1 - last_pos

    return close.rolling(window).apply(_age, raw=False)


def add_features(price: pd.DataFrame, vix: pd.DataFrame, fedfunds: pd.Series) -> pd.DataFrame:
    out = compute(price)
    close = out["Close"]

    out["ret_1d"] = close.pct_change()
    out["ret_3d"] = close.pct_change(3)
    out["ret_5d"] = close.pct_change(5)
    out["max_1d_drop_21"] = out["ret_1d"].rolling(21).min() * 100.0
    out["max_3d_drop_21"] = out["ret_3d"].rolling(21).min() * 100.0
    out["max_5d_drop_21"] = out["ret_5d"].rolling(21).min() * 100.0

    high_252 = close.rolling(252).max()
    out["dd_252"] = (close / high_252 - 1.0) * 100.0
    out["dd_duration_252"] = bars_since_high(close, 252)
    out["mdd_blended"] = mdd_blended(close)
    out["mdd_tier"] = out["mdd_blended"].apply(
        lambda value: categorize(float(value)) if pd.notna(value) else ""
    )
    out["oversold_reentries_63"] = out["enter_oversold"].rolling(63).sum()

    vix_close = vix["Close"].rename("vix")
    out = out.join(vix_close, how="left")
    out["vix"] = out["vix"].ffill()
    out["vix_21_min"] = out["vix"].rolling(21).min()
    out["vix_21_mean"] = out["vix"].rolling(21).mean()
    out["vix_spike_ratio_21"] = out["vix"] / out["vix_21_min"]
    out["vix_spike_points_21"] = out["vix"] - out["vix_21_mean"]
    out["vix_percentile_252"] = out["vix"].rolling(252).rank(pct=True) * 100.0

    out = out.join(fedfunds, how="left")
    out["fedfunds"] = out["fedfunds"].ffill()
    out["fed_3m_change"] = out["fedfunds"] - out["fedfunds"].shift(63)
    out["fed_6m_change"] = out["fedfunds"] - out["fedfunds"].shift(126)
    out["fed_12m_change"] = out["fedfunds"] - out["fedfunds"].shift(252)
    out["prototype_regime"] = out.apply(classify_prototype_regime, axis=1)
    return out


def classify_prototype_regime(row: pd.Series) -> str:
    """First-pass research classifier, intentionally simple and inspectable."""
    if pd.isna(row.get("dd_duration_252")):
        return "warmup"

    acute = (
        (pd.notna(row.get("max_5d_drop_21")) and row["max_5d_drop_21"] <= -8.0)
        or (
            pd.notna(row.get("vix_percentile_252"))
            and row["vix_percentile_252"] >= 85.0
        )
    )
    chronic = (
        row["dd_duration_252"] > 63
        and (
            (pd.notna(row.get("dd_252")) and row["dd_252"] <= -10.0)
            or (
                pd.notna(row.get("oversold_reentries_63"))
                and row["oversold_reentries_63"] >= 2.0
            )
            or (
                pd.notna(row.get("fed_6m_change"))
                and row["fed_6m_change"] >= 0.75
                and pd.notna(row.get("dd_252"))
                and row["dd_252"] <= -7.0
            )
        )
    )

    if chronic:
        return "bear"
    if row["dd_duration_252"] <= 63 and acute:
        return "panic"
    return "correction"


def cluster_picks(signals: pd.DataFrame, all_rows: pd.DataFrame, max_gap: int = 21):
    clusters = []
    current = []
    previous = None
    for index in signals.index:
        if (
            previous is None
            or all_rows.index.get_loc(index) - all_rows.index.get_loc(previous)
            <= max_gap
        ):
            current.append(index)
        else:
            clusters.append(current)
            current = [index]
        previous = index
    if current:
        clusters.append(current)

    picks = []
    for cluster in clusters:
        pick = min(
            cluster,
            key=lambda index: (
                float(all_rows.loc[index, "dd_252"])
                if pd.notna(all_rows.loc[index, "dd_252"])
                else 0.0,
                -all_rows.index.get_loc(index),
            ),
        )
        picks.append((pick, cluster))
    return picks


def print_period(ticker: str, featured: pd.DataFrame, period: Period) -> None:
    sub = featured.loc[period.start : period.end]
    signals = sub[sub["buy_reversal"]]
    print(f"\n===== {ticker} {period.name} ({period.start} to {period.end}) =====")
    if signals.empty:
        print("no raw signals")
        return

    columns = [
        "Close",
        "s_percentR",
        "l_percentR",
        "max_1d_drop_21",
        "max_3d_drop_21",
        "max_5d_drop_21",
        "dd_252",
        "dd_duration_252",
        "oversold_reentries_63",
        "mdd_blended",
        "mdd_tier",
        "vix",
        "vix_spike_ratio_21",
        "vix_spike_points_21",
        "vix_percentile_252",
        "fedfunds",
        "fed_3m_change",
        "fed_6m_change",
        "fed_12m_change",
        "prototype_regime",
    ]
    print(signals[columns].to_string(float_format=lambda value: f"{value:.2f}"))

    print("\ncluster picks by deepest drawdown within 21 trading days:")
    for pick, cluster in cluster_picks(signals, featured):
        print(
            f"  {pick.date()} from "
            f"{[index.date().isoformat() for index in cluster]}"
        )


def main() -> int:
    configure_yfinance_cache()
    start = "2007-01-01"
    price_data = {ticker: download(ticker, start) for ticker in ("^GSPC", "VOO")}
    vix = download("^VIX", start)
    fedfunds = download_fedfunds()

    if vix.empty:
        print("^VIX: no data")
        return 1

    for ticker, price in price_data.items():
        if price.empty:
            print(f"{ticker}: no data")
            continue
        featured = add_features(price, vix, fedfunds)
        for period in PERIODS:
            print_period(ticker, featured, period)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
