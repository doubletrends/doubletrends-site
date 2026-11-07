"""
Empirical comparison: can we identify a pending reversal before confirmed
product signals?

The pending signal is intentionally not a product alert yet. It is a setup
state measured against final product signals from signal/product.py.
"""
from __future__ import annotations

import os
import sys
import time

import pandas as pd
import yfinance as yf


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SIGNAL_DIR = os.path.join(REPO, "signal")
if SIGNAL_DIR not in sys.path:
    sys.path.insert(0, SIGNAL_DIR)

from product import add_product_features, download_fedfunds  # noqa: E402


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


def add_pending_features(rows: pd.DataFrame) -> pd.DataFrame:
    out = rows.copy()
    close = out["Close"]

    out["close_above_prev"] = close > close.shift(1)
    out["close_above_3d_low"] = close > close.rolling(3).min().shift(1)
    out["short_rising_1d"] = out["s_percentR"] > out["s_percentR"].shift(1)
    out["short_rising_2d"] = out["s_percentR"] > out["s_percentR"].shift(2)
    out["long_not_worsening"] = out["l_percentR"] >= out["l_percentR"].shift(1)
    out["vix_not_rising"] = out["vix"] <= out["vix"].shift(1)

    out["pending_loose"] = (
        out["oversold"]
        & out["short_rising_1d"]
        & (out["close_above_prev"] | out["close_above_3d_low"])
    )
    out["pending_balanced"] = (
        out["oversold"]
        & out["short_rising_1d"]
        & out["short_rising_2d"]
        & (out["close_above_prev"] | out["close_above_3d_low"])
        & (
            out["long_not_worsening"]
            | out["vix_not_rising"]
            | out["regime"].isin(["panic", "bear"])
        )
    )
    out["pending_strict"] = (
        out["oversold"]
        & out["short_rising_1d"]
        & out["short_rising_2d"]
        & out["close_above_prev"]
        & (out["long_not_worsening"] | out["vix_not_rising"])
    )
    out["capitulation_watch"] = (
        out["regime"].isin(["panic", "bear"])
        & (
            out["oversold"]
            | ((out["s_percentR"] <= -75.0) & (out["l_percentR"] <= -80.0))
        )
        & (
            (out["max_5d_drop_21"] <= -8.0)
            | (out["vix_percentile_252"] >= 95.0)
            | (out["dd_252"] <= -15.0)
        )
    )
    return out


def match_pending_to_product(
    rows: pd.DataFrame,
    pending_col: str,
    lookahead: int = 10,
) -> tuple[list[dict], list[pd.Timestamp]]:
    product_dates = list(rows.index[rows["product_signal"]])
    pending_dates = list(rows.index[rows[pending_col]])

    matches = []
    used_pending: set[pd.Timestamp] = set()
    for product_date in product_dates:
        product_loc = rows.index.get_loc(product_date)
        candidates = [
            date
            for date in pending_dates
            if date not in used_pending
            and rows.index.get_loc(date) < product_loc
            and product_loc - rows.index.get_loc(date) <= lookahead
        ]
        if not candidates:
            matches.append(
                {
                    "product_date": product_date,
                    "pending_date": None,
                    "lead_days": None,
                    "regime": rows.loc[product_date, "product_signal_regime"],
                }
            )
            continue
        pending_date = candidates[-1]
        used_pending.add(pending_date)
        matches.append(
            {
                "product_date": product_date,
                "pending_date": pending_date,
                "lead_days": product_loc - rows.index.get_loc(pending_date),
                "regime": rows.loc[product_date, "product_signal_regime"],
            }
        )

    matched_pending = {match["pending_date"] for match in matches if match["pending_date"]}
    false_pending = [
        date
        for date in pending_dates
        if date not in matched_pending
        and not any(
            0 < rows.index.get_loc(product_date) - rows.index.get_loc(date) <= lookahead
            for product_date in product_dates
        )
    ]
    return matches, false_pending


def summarize(ticker: str, rows: pd.DataFrame, pending_col: str) -> None:
    matches, false_pending = match_pending_to_product(rows, pending_col)
    matched = [match for match in matches if match["pending_date"] is not None]
    leads = [match["lead_days"] for match in matched if match["lead_days"] is not None]

    print(f"\n===== {ticker} {pending_col} =====")
    print(f"product signals: {len(matches)}")
    print(f"matched pending: {len(matched)}")
    print(f"false pending: {len(false_pending)}")
    if leads:
        print(
            "lead days:",
            f"avg={sum(leads) / len(leads):.2f}",
            f"min={min(leads)}",
            f"max={max(leads)}",
        )

    for match in matches:
        product_date = match["product_date"]
        if product_date.year < 2022:
            continue
        pending_date = match["pending_date"]
        print(
            product_date.date(),
            match["regime"],
            "pending",
            pending_date.date().isoformat() if pending_date is not None else None,
            "lead",
            match["lead_days"],
        )


def print_target_windows(ticker: str, rows: pd.DataFrame) -> None:
    for start, end in (
        ("2022-04-01", "2022-10-31"),
        ("2025-03-01", "2025-04-15"),
        ("2026-03-01", "2026-04-15"),
    ):
        sub = rows.loc[start:end]
        flagged = sub[
            sub["pending_balanced"]
            | sub["capitulation_watch"]
            | sub["product_signal"]
            | sub["buy_reversal"]
        ]
        if flagged.empty:
            continue
        print(f"\n--- {ticker} {start} to {end} key events ---")
        cols = [
            "Close",
            "s_percentR",
            "l_percentR",
            "oversold",
            "pending_balanced",
            "capitulation_watch",
            "buy_reversal",
            "product_signal",
            "regime",
        ]
        print(flagged[cols].to_string(float_format=lambda value: f"{value:.2f}"))


def main() -> int:
    configure_yfinance_cache()
    vix = download("^VIX", "1995-01-01")
    if vix.empty:
        print("^VIX: no data")
        return 1
    fedfunds = download_fedfunds()

    for ticker in ("^GSPC", "VOO"):
        start = "1995-01-01" if ticker == "^GSPC" else "2010-01-01"
        price = download(ticker, start)
        if price.empty:
            print(f"{ticker}: no data")
            continue
        rows = add_product_features(price, vix, fedfunds)
        rows = add_pending_features(rows)
        for pending_col in (
            "pending_loose",
            "pending_balanced",
            "pending_strict",
            "capitulation_watch",
        ):
            summarize(ticker, rows, pending_col)
        print_target_windows(ticker, rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
