"""
Daily signal job: compute DTEP on ^GSPC, and on a fresh fire fan-out a DM to
every active subscriber. Subscriber list is fetched from the Worker (D1 is not
addressable directly from GitHub Actions).
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

import yfinance as yf
from dtep import compute


TICKER = "^GSPC"
DISPLAY_NAME = "S&P 500"
ETF_EXAMPLES = "VOO, SPY, or IVV"
COOLDOWN_TRADING_DAYS = 15
PERIOD = "2y"
# Browser-ish UA so Cloudflare's edge doesn't 403 the Actions runner before
# the request reaches the Worker. Same gotcha as signal/brief.py.
UA = "dtep-signal/1.0 (+https://doubletrends.com)"


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


def fetch_active_subscribers(endpoint, secret):
    request = urllib.request.Request(
        endpoint,
        headers={"X-Brief-Secret": secret, "User-Agent": UA},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read())
    return [
        str(s["telegram_user_id"])
        for s in payload.get("subscribers", [])
        if s.get("telegram_user_id")
    ]


def send_dm(token, user_id, message):
    data = urllib.parse.urlencode(
        {
            "chat_id": user_id,
            "parse_mode": "HTML",
            "text": message,
        }
    ).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"User-Agent": UA},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    subs_endpoint = os.environ.get("SUBSCRIBERS_ENDPOINT")
    subs_secret = os.environ.get("BRIEF_SHARED_SECRET")
    dry_run = (
        os.environ.get("DRY_RUN") == "1"
        or not token
        or not subs_endpoint
        or not subs_secret
    )

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
        print(f"DRY RUN would DM subscribers:\n{message}")
        return 0

    subscribers = fetch_active_subscribers(subs_endpoint, subs_secret)
    print(f"Active subscribers: {len(subscribers)}")

    sent = 0
    failed = 0
    for user_id in subscribers:
        try:
            send_dm(token, user_id, message)
            sent += 1
        except urllib.error.HTTPError as err:
            # Most common failure: user blocked the bot (403) or chat not found
            # (400). Log it but never abort — one bad recipient must not stop
            # the rest of the fan-out.
            print(f"DM failed for {user_id}: HTTP {err.code} {err.reason}")
            failed += 1
        except Exception as err:  # noqa: BLE001
            print(f"DM failed for {user_id}: {err}")
            failed += 1

    print(f"Delivered: {sent}/{len(subscribers)} (failed: {failed})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
