"""
Export S&P 500 daily OHLC + DTEP buy_reversal dates for the landing-page replay chart.
Same compute as the live alerts (dtep.compute) so the marketing chart and the
product signals are provably identical.

Writes:
  public/replay/sp500.json   — site asset (fetched by the real page)
"""
import json
import os

import yfinance as yf
from dtep import compute

TICKER = "^GSPC"
DISPLAY_TICKER = "S&P 500"
START = "2016-01-01"

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def build():
    df = yf.download(TICKER, start=START, interval="1d",
                     auto_adjust=False, progress=False)
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)

    res = compute(df)

    candles = [
        {
            "time": idx.date().isoformat(),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
        }
        for idx, row in res.iterrows()
        if not (row[["Open", "High", "Low", "Close"]].isna().any())
    ]
    signals = [idx.date().isoformat() for idx in res.index[res["buy_reversal"]]]

    return {
        "ticker": DISPLAY_TICKER,
        "source": TICKER,
        "candles": candles,
        "signals": signals,
    }


def main():
    data = build()

    json_path = os.path.join(REPO, "public", "replay", "sp500.json")
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    print(f"{data['ticker']}: {len(data['candles'])} candles, "
          f"{len(data['signals'])} signals")
    print(f"  -> {json_path}")


if __name__ == "__main__":
    main()
