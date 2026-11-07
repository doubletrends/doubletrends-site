"""
Matplotlib visualization for raw DTEP vs product-level signals.

Outputs PNG files under research/plots/.
"""
from __future__ import annotations

import os
import sys
import time

import pandas as pd
import yfinance as yf

os.environ.setdefault(
    "MPLCONFIGDIR",
    os.path.join(os.environ.get("TEMP", os.getcwd()), "matplotlib-cache"),
)

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


def plot_window(ticker: str, rows: pd.DataFrame, start: str, end: str, path: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    sub = rows.loc[start:end].copy()
    raw = sub[sub["buy_reversal"]]
    product = sub[sub["product_signal"]]

    fig, axes = plt.subplots(
        4,
        1,
        figsize=(15, 10),
        sharex=True,
        gridspec_kw={"height_ratios": [4, 1.3, 1.3, 1.3]},
    )

    axes[0].plot(sub.index, sub["Close"], color="#1f2937", linewidth=1.4, label="Close")
    axes[0].scatter(
        raw.index,
        raw["Close"],
        marker="^",
        s=45,
        color="#f59e0b",
        label="Raw DTEP",
        zorder=3,
    )
    axes[0].scatter(
        product.index,
        product["Close"],
        marker="*",
        s=150,
        color="#16a34a",
        edgecolor="#064e3b",
        linewidth=0.8,
        label="Product Signal",
        zorder=4,
    )
    for idx, row in product.iterrows():
        axes[0].annotate(
            idx.date().isoformat(),
            (idx, row["Close"]),
            xytext=(0, 12),
            textcoords="offset points",
            ha="center",
            fontsize=8,
            color="#166534",
        )
    axes[0].set_title(f"{ticker}: raw DTEP vs product signals ({start} to {end})")
    axes[0].set_ylabel("Price")
    axes[0].legend(loc="best")
    axes[0].grid(True, alpha=0.25)

    axes[1].plot(sub.index, sub["dd_252"], color="#dc2626", linewidth=1.1)
    axes[1].axhline(-10, color="#991b1b", linestyle="--", linewidth=0.8)
    axes[1].axhline(-20, color="#7f1d1d", linestyle=":", linewidth=0.8)
    axes[1].set_ylabel("252d DD %")
    axes[1].grid(True, alpha=0.25)

    axes[2].plot(sub.index, sub["vix"], color="#7c3aed", linewidth=1.1)
    axes[2].set_ylabel("VIX")
    axes[2].grid(True, alpha=0.25)

    axes[3].plot(sub.index, sub["fedfunds"], color="#0369a1", linewidth=1.1, label="Fed Funds")
    axes[3].plot(
        sub.index,
        sub["fed_6m_change"],
        color="#0f766e",
        linewidth=1.0,
        label="Fed 6m change",
    )
    axes[3].axhline(0.75, color="#0f766e", linestyle="--", linewidth=0.8)
    axes[3].set_ylabel("Fed %")
    axes[3].legend(loc="best")
    axes[3].grid(True, alpha=0.25)

    fig.tight_layout()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path, dpi=160)
    plt.close(fig)


def main() -> int:
    configure_yfinance_cache()

    vix = download("^VIX", "2007-01-01")
    if vix.empty:
        print("^VIX: no data")
        return 1
    fedfunds = download_fedfunds()

    outputs = [
        ("^GSPC", "1995-01-01", "2001-01-01", "2026-06-02", "gspc_2001_2026.png"),
        ("^GSPC", "2007-01-01", "2008-01-01", "2009-06-30", "gspc_2008_2009.png"),
        ("^GSPC", "2021-01-01", "2022-01-01", "2026-06-02", "gspc_2022_2026.png"),
        ("VOO", "2021-01-01", "2022-01-01", "2026-06-02", "voo_2022_2026.png"),
    ]

    for ticker, download_start, plot_start, plot_end, filename in outputs:
        price = download(ticker, download_start)
        if price.empty:
            print(f"{ticker}: no data")
            continue
        rows = add_product_features(price, vix, fedfunds)
        path = os.path.join(HERE, "plots", filename)
        plot_window(ticker, rows, plot_start, plot_end, path)
        print(path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
