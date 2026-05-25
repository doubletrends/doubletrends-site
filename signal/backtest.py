"""
Pull daily OHLC from yfinance and list DTEP buy_reversal dates for parity check
against the TradingView chart (look for the ▲ Oversold Trend Reversal triangles).

auto_adjust=False → split-adjusted but NOT dividend-adjusted, to match TV default.
"""
import sys
import yfinance as yf
from dtep import compute

TICKERS = sys.argv[1:] or ["^GSPC"]
PERIOD = "10y"

for tic in TICKERS:
    df = yf.download(tic, period=PERIOD, interval="1d",
                     auto_adjust=False, progress=False)
    if df.empty:
        print(f"\n{tic}: no data")
        continue
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)

    res = compute(df)
    rev = res.index[res["buy_reversal"]]

    print(f"\n========== {tic}  ({df.index[0].date()} → {df.index[-1].date()}, {len(df)} bars) ==========")
    print(f"buy_reversal signals: {len(rev)}")
    for d in rev:
        print("  ", d.date())

    last = res.iloc[-1]
    print(f"latest bar {res.index[-1].date()}: "
          f"s%R={last['s_percentR']:.2f}  l%R={last['l_percentR']:.2f}  "
          f"oversold={bool(last['oversold'])}")
