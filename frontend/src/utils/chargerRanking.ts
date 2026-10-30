import type { Charger } from "../types";

// "Recommended for you" composite ranking (DriverHomePage.tsx). Distance is
// the PRIMARY factor (dominant weight below), with known-availability and
// higher power as documented tiebreaks -- a genuine blended score, not a
// strict distance-then-tiebreak lexicographic sort, so a charger with
// unknown availability doesn't always beat a barely-farther one with known
// availability just because it's a few dozen metres closer.
//
// Fixed weights and a fixed power reference range -- not derived from the
// current reachable set's own min/max -- same reasoning as the planner
// side's site_scoring.py: a per-request normalization would silently
// reorder recommendations every time the reachable set's composition
// changes, even if nothing about any individual charger did.
//
// Pulled into its own file (not left in DriverHomePage.tsx) for two
// reasons: it's genuinely reusable pure logic, and co-locating non-component
// exports in a page file breaks Vite Fast Refresh for that file.

export const RECOMMENDATION_WEIGHTS = { distance: 0.6, availability: 0.25, power: 0.15 } as const;
const POWER_REFERENCE_MAX_KW = 150; // common DC fast-charger ceiling -- fixed reference, not the reachable set's own max

export interface RankableChargerRow {
  km: number;
  charger: Pick<Charger, "availability" | "power_kw">;
}

/** maxRelevantKm anchors the distance score to something meaningful (the
 * driver's actual range) rather than an arbitrary constant -- see callers. */
export function chargerCompositeScore(row: RankableChargerRow, maxRelevantKm: number): number {
  const distanceScore = maxRelevantKm > 0 ? Math.max(0, Math.min(100, 100 * (1 - row.km / maxRelevantKm))) : 100;
  // "unknown beats nothing, known beats unknown": availability !== null is
  // what matters here, not its true/false value -- see the task brief.
  const availabilityScore = row.charger.availability !== null ? 100 : 0;
  const powerScore = Math.max(0, Math.min(100, (100 * (row.charger.power_kw ?? 0)) / POWER_REFERENCE_MAX_KW));
  return (
    RECOMMENDATION_WEIGHTS.distance * distanceScore +
    RECOMMENDATION_WEIGHTS.availability * availabilityScore +
    RECOMMENDATION_WEIGHTS.power * powerScore
  );
}

export function sortByRecommendation<T extends RankableChargerRow>(rows: T[], maxRelevantKm: number): T[] {
  return [...rows].sort((a, b) => chargerCompositeScore(b, maxRelevantKm) - chargerCompositeScore(a, maxRelevantKm));
}
