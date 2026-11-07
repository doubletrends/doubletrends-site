"""
Prototype state-machine for turning raw DTEP reversals into product candidates.

This is implementation research only. It does not change live signal delivery.

Design intent:
  - Raw DTEP still finds local oversold reversals.
  - Product logic groups nearby or same-regime reversals.
  - Within an active group, the deepest drawdown candidate replaces earlier ones.
  - Bear-market groups reset only after a meaningful recovery, not after a
    fixed cooldown.
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
from mdd import mdd_blended  # noqa: E402


@dataclass(frozen=True)
class ProductSignal:
    date: pd.Timestamp
    raw_dates: tuple[pd.Timestamp, ...]
    regime: str
    reason: str


def configure_yfinance_cache() -> None:
    cache = os.path.join(os.environ.get("TEMP", os.getcwd()), "yfinance-cache")
    os.makedirs(cache, exist_ok=True)
    yf.set_tz_cache_location(cache)


def download(ticker: str, start: str) -> pd.DataFrame:
    df = pd.DataFrame()
    for attempt in range(3):
        df = yf.download(
            ticker,
            start=start,
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
        max_value = arr.max()
        last_pos = max(i for i, value in enumerate(arr) if value == max_value)
        return len(arr) - 1 - last_pos

    return close.rolling(window).apply(_age, raw=False)


def add_features(price: pd.DataFrame, vix: pd.DataFrame, fedfunds: pd.Series) -> pd.DataFrame:
    out = compute(price)
    close = out["Close"]

    out["max_5d_drop_21"] = close.pct_change(5).rolling(21).min() * 100.0
    out["dd_252"] = (close / close.rolling(252).max() - 1.0) * 100.0
    out["dd_duration_252"] = bars_since_high(close, 252)
    out["oversold_reentries_63"] = out["enter_oversold"].rolling(63).sum()
    out["mdd_blended"] = mdd_blended(close)

    out = out.join(vix["Close"].rename("vix"), how="left")
    out["vix"] = out["vix"].ffill()
    out["vix_percentile_252"] = out["vix"].rolling(252).rank(pct=True) * 100.0

    out = out.join(fedfunds, how="left")
    out["fedfunds"] = out["fedfunds"].ffill()
    out["fed_3m_change"] = out["fedfunds"] - out["fedfunds"].shift(63)
    out["fed_6m_change"] = out["fedfunds"] - out["fedfunds"].shift(126)
    out["fed_12m_change"] = out["fedfunds"] - out["fedfunds"].shift(252)
    out["prototype_regime"] = out.apply(classify_regime, axis=1)
    return out


def classify_regime(row: pd.Series) -> str:
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


def is_better_candidate(rows: pd.DataFrame, candidate: pd.Timestamp, new: pd.Timestamp) -> bool:
    candidate_dd = rows.loc[candidate, "dd_252"]
    new_dd = rows.loc[new, "dd_252"]
    if pd.isna(candidate_dd):
        return True
    if pd.isna(new_dd):
        return False
    if new_dd < candidate_dd:
        return True
    if new_dd == candidate_dd:
        return rows.index.get_loc(new) > rows.index.get_loc(candidate)
    return False


def bear_reset(rows: pd.DataFrame, candidate: pd.Timestamp, current: pd.Timestamp) -> bool:
    candidate_close = float(rows.loc[candidate, "Close"])
    candidate_dd = float(rows.loc[candidate, "dd_252"])
    current_close = float(rows.loc[current, "Close"])
    current_dd = float(rows.loc[current, "dd_252"])

    rally_pct = (current_close / candidate_close - 1.0) * 100.0

    # Deep systemic bears need a broad drawdown recovery before the regime is
    # considered reset. This keeps 2008-style crisis legs from resetting on one
    # sharp bear-market rally.
    if candidate_dd <= -25.0:
        return current_dd > -20.0

    return current_dd > -10.0 or rally_pct >= 8.0


def select_product_signals(rows: pd.DataFrame) -> list[ProductSignal]:
    product: list[ProductSignal] = []

    active_candidate: pd.Timestamp | None = None
    active_raw_dates: list[pd.Timestamp] = []
    active_regime: str | None = None
    active_last_raw: pd.Timestamp | None = None

    def flush(reason: str) -> None:
        nonlocal active_candidate, active_raw_dates, active_regime, active_last_raw
        if active_candidate is not None and active_regime is not None:
            product.append(
                ProductSignal(
                    date=active_candidate,
                    raw_dates=tuple(active_raw_dates),
                    regime=active_regime,
                    reason=reason,
                )
            )
        active_candidate = None
        active_raw_dates = []
        active_regime = None
        active_last_raw = None

    for date, row in rows.iterrows():
        if active_candidate is not None and active_regime == "bear" and bear_reset(
            rows, active_candidate, date
        ):
            flush("bear-reset")

        if not bool(row["buy_reversal"]):
            continue

        regime = str(rows.loc[date, "prototype_regime"])

        if active_candidate is None:
            active_candidate = date
            active_raw_dates = [date]
            active_regime = regime
            active_last_raw = date
            continue

        gap = rows.index.get_loc(date) - rows.index.get_loc(active_last_raw)
        same_local_cluster = gap <= 21
        same_bear_regime = active_regime == "bear"

        if same_local_cluster or same_bear_regime:
            active_raw_dates.append(date)
            if is_better_candidate(rows, active_candidate, date):
                active_candidate = date
                active_regime = regime
            active_last_raw = date
            continue

        flush("reset")
        active_candidate = date
        active_raw_dates = [date]
        active_regime = regime
        active_last_raw = date

    flush("end")
    return product


def print_signals(ticker: str, rows: pd.DataFrame) -> None:
    product = select_product_signals(rows)
    print(f"\n===== {ticker} product prototype ({len(product)} signals) =====")
    for signal in product:
        if signal.date.year < 2008:
            continue
        row = rows.loc[signal.date]
        print(
            signal.date.date(),
            signal.regime,
            "from",
            [date.date().isoformat() for date in signal.raw_dates],
            "dd",
            f"{row['dd_252']:.1f}",
            "dur",
            int(row["dd_duration_252"]) if pd.notna(row["dd_duration_252"]) else None,
            "m5",
            f"{row['max_5d_drop_21']:.1f}",
            "vixpct",
            f"{row['vix_percentile_252']:.0f}"
            if pd.notna(row["vix_percentile_252"])
            else "",
            "fed6m",
            f"{row['fed_6m_change']:.2f}" if pd.notna(row["fed_6m_change"]) else "",
        )


def main() -> int:
    configure_yfinance_cache()
    vix = download("^VIX", "2007-01-01")
    if vix.empty:
        print("^VIX: no data")
        return 1
    fedfunds = download_fedfunds()

    for ticker in ("^GSPC", "SPY", "VOO"):
        price = download(ticker, "2007-01-01")
        if price.empty:
            print(f"{ticker}: no data")
            continue
        rows = add_features(price, vix, fedfunds)
        print_signals(ticker, rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
