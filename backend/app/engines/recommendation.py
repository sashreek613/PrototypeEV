"""Thin wrappers over app.engines.site_scoring, kept so existing call sites
(and the app.engines package's public exports) don't need to change import
paths. The real weights, gate logic and sub-score math live in
site_scoring.py -- SCORE_WEIGHTS there is the one place they're defined; do
not redeclare DEMAND_WEIGHT/GRID_WEIGHT/etc. here.
"""

from app.engines.site_scoring import compute_site_score, recommend_site

__all__ = ["compute_site_score", "recommend_site"]
