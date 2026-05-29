"""
Hourly job: pull ^GSPC, compute blended MDD + tier, POST to the Worker so /brief
returns the latest snapshot. Triggered by .github/workflows/dtep-brief.yml.
"""
import json
import os
import urllib.request

import yfinance as yf
from mdd import WINDOWS, categorize, mdd_blended


TICKER = "^GSPC"
DISPLAY_NAME = "S&P 500"
# max(WINDOWS) = 504 trading days; 3y gives ~756 daily bars so the rolling
# windows fully warm up before the latest bar.
PERIOD = "3y"


def fetch_close(ticker: str) -> "tuple[str, float, list]":
    df = yf.download(ticker, period=PERIOD, interval="1d", auto_adjust=False, progress=False)
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)
    close = df["Close"].dropna()
    return close


def post_snapshot(payload: dict, endpoint: str, secret: str) -> None:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json", "X-Brief-Secret": secret},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def main() -> int:
    endpoint = os.environ.get("BRIEF_ENDPOINT")
    secret = os.environ.get("BRIEF_SHARED_SECRET")
    dry_run = os.environ.get("DRY_RUN") == "1" or not endpoint or not secret

    close = fetch_close(TICKER)
    if close.empty:
        print(f"{DISPLAY_NAME}: no data")
        return 1

    blended = mdd_blended(close)
    latest = blended.dropna()
    if latest.empty:
        print(f"{DISPLAY_NAME}: insufficient history for windows {WINDOWS}")
        return 1

    value = float(latest.iloc[-1])
    tier = categorize(value)
    payload = {
        "ticker": TICKER,
        "display_name": DISPLAY_NAME,
        "as_of_date": close.index[-1].date().isoformat(),
        "close": float(close.iloc[-1]),
        "mdd_value": value,
        "tier": tier,
        "windows": list(WINDOWS),
    }

    print(json.dumps(payload, indent=2))
    if dry_run:
        print("DRY RUN: snapshot not posted")
        return 0

    post_snapshot(payload, endpoint, secret)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
