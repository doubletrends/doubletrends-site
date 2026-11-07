# research/

One-off research scripts and plots behind the DoubleTrends™ signal and the
Academy articles. **Parked here, not maintained — not part of the site build.**

Moved from `doubletrends-backend/research/` on 2026-11-07 (backend commit
`dc34d3b` is the last one that contains it; its history stays in that repo).
To be sorted out later.

## Current state

The scripts import the backend's signal pipeline (`../doubletrends-backend/signal`),
and **7 of the 8 no longer import** since the backend's 2026-06-04 pipeline
refactor:

| Script | Fails on |
|---|---|
| `article_stats.py`, `drawdowns.py`, `regime_research.py`, `state_machine_research.py` | `modules.module_1_dtep_raw` (now `signal/step_4_algorithm/module_1_dtep_state.py`) |
| `calm_verification.py`, `pending_reversal_research.py`, `plot_product_signals.py` | `product.download_fedfunds` (now `signal/step_1_data_ingestion.py`) |
| `mdd.py` | imports fine; only used by the broken scripts above |

`plots/` holds images `plot_product_signals.py` produced; nothing references them.

To run anything here, put the backend's `signal/` on the path, e.g.
`PYTHONPATH=../../doubletrends-backend/signal:. python mdd.py` from this folder,
and repair the imports above first.
