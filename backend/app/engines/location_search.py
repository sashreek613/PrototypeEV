"""Pure offline name search over a small in-memory index.

No file IO, no network, no DB -- app/services/site_service.py builds the
index from data/candidate_sites_bengaluru.json and data/localities_bengaluru.json
and hands it here. Kept separate from site_scoring.py because this is
geocoding/search, not scoring, and the two shouldn't be entangled.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass

# Below this many substring hits, fall back to fuzzy matching so a typo or
# partial name ("korman" for "Koramangala") still returns something useful.
FUZZY_CUTOFF = 0.6


@dataclass(frozen=True)
class NameRecord:
    id: str
    name: str
    latitude: float
    longitude: float
    kind: str  # "candidate_site" | "locality"


def search_names(query: str, records: list[NameRecord], limit: int = 8) -> list[NameRecord]:
    """Case-insensitive substring match first, ranked by match position then
    name length (an earlier, shorter match reads as more relevant) -- then a
    fuzzy fallback over the remaining records if substring hits don't fill
    `limit`."""
    q = query.strip().lower()
    if not q:
        return []

    substring_hits = [r for r in records if q in r.name.lower()]
    substring_hits.sort(key=lambda r: (r.name.lower().index(q), len(r.name)))
    substring_hits = substring_hits[:limit]
    if len(substring_hits) >= limit:
        return substring_hits

    seen_ids = {r.id for r in substring_hits}
    pool = [r for r in records if r.id not in seen_ids]
    # difflib.SequenceMatcher is case-sensitive, so "korman" vs "Koramangala"
    # scores well below a same-case comparison would -- match lowercased,
    # then map back to the original-cased record. Duplicate lowercased names
    # (rare, e.g. two candidate sites both named "Indian Oil") collapse to
    # one record here -- acceptable for a suggestion list.
    lower_to_record = {r.name.lower(): r for r in pool}
    remaining = limit - len(substring_hits)
    close = difflib.get_close_matches(q, list(lower_to_record.keys()), n=remaining, cutoff=FUZZY_CUTOFF)
    fuzzy_hits = [lower_to_record[name] for name in close]

    return substring_hits + fuzzy_hits


def best_match(query: str, records: list[NameRecord]) -> NameRecord | None:
    results = search_names(query, records, limit=1)
    return results[0] if results else None
