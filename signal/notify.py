import os
import urllib.parse
import urllib.request

import yfinance as yf
from dtep import compute


TICKER = "^GSPC"
DISPLAY_NAME = "S&P 500"
ETF_EXAMPLES = "VOO, SPY, or IVV"
COOLDOWN_TRADING_DAYS = 15
PERIOD = "2y"


def download_ohlc(ticker):
    df = yf.download(
        ticker,
        period=PERIOD,
        interval="1d",
        auto_adjust=False,
        progress=False,
    )
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)
    return df


def signal_status(result):
    signals = result["buy_reversal"].fillna(False).astype(bool)
    latest_fired = bool(signals.iloc[-1])
    prior = signals.iloc[-(COOLDOWN_TRADING_DAYS + 1):-1]

    if latest_fired and not bool(prior.any()):
        return "fired"
    if latest_fired:
        return "suppressed-by-cooldown"
    return "no-signal"


def build_message(signal_date):
    return "\n".join(
        [
            f"{DISPLAY_NAME}: DoubleTrends™ signal on {signal_date}.",
            f"The S&P 500 has confirmed an oversold reversal. For ETF investors using S&P 500 funds such as {ETF_EXAMPLES}.",
            "Educational information only - not financial advice.",
        ]
    )


def send_telegram(message, token, channel_id):
    data = urllib.parse.urlencode(
        {
            "chat_id": channel_id,
            "parse_mode": "HTML",
            "text": message,
        }
    ).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    request = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID")
    dry_run = os.environ.get("DRY_RUN") == "1" or not token or not channel_id

    df = download_ohlc(TICKER)
    if df.empty:
        print(f"{DISPLAY_NAME}: no-signal (no data)")
        return 0

    result = compute(df)
    status = signal_status(result)
    print(f"{DISPLAY_NAME}: {status}")

    if status != "fired":
        return 0

    signal_date = result.index[-1].date().isoformat()
    message = build_message(signal_date)
    if dry_run:
        print(f"DRY RUN would send:\n{message}")
    else:
        send_telegram(message, token, channel_id)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
