import { describe, expect, it } from "vitest";

import { chargerCompositeScore, sortByRecommendation, type RankableChargerRow } from "./chargerRanking";

function row(km: number, availability: boolean | null, power_kw: number | null): RankableChargerRow {
  return { km, charger: { availability, power_kw } };
}

describe("chargerCompositeScore / sortByRecommendation", () => {
  const maxRelevantKm = 20; // e.g. driver's buffered range

  it("closer, known-availability, higher-power charger scores above a farther, unknown, lower-power one", () => {
    const near = row(2, true, 60);
    const far = row(18, null, 22);
    expect(chargerCompositeScore(near, maxRelevantKm)).toBeGreaterThan(chargerCompositeScore(far, maxRelevantKm));
  });

  it("distance is the primary factor: a much closer charger with unknown availability still beats a much farther one with known availability", () => {
    const closeButUnknown = row(1, null, 22);
    const farButKnown = row(19, true, 150);
    const sorted = sortByRecommendation([farButKnown, closeButUnknown], maxRelevantKm);
    expect(sorted[0]).toBe(closeButUnknown);
  });

  it("known availability is a real tiebreak among similarly-close chargers", () => {
    const knownNearby = row(5, true, 22);
    const unknownNearby = row(5, null, 22);
    expect(chargerCompositeScore(knownNearby, maxRelevantKm)).toBeGreaterThan(chargerCompositeScore(unknownNearby, maxRelevantKm));
  });

  it("higher power_kw is a tiebreak among chargers with the same distance and availability status", () => {
    const fast = row(5, true, 150);
    const slow = row(5, true, 22);
    expect(chargerCompositeScore(fast, maxRelevantKm)).toBeGreaterThan(chargerCompositeScore(slow, maxRelevantKm));
  });

  it("availability null (unknown) never scores higher than availability false (known-but-down) at the same distance/power", () => {
    const knownDown = row(5, false, 22);
    const unknown = row(5, null, 22);
    expect(chargerCompositeScore(knownDown, maxRelevantKm)).toBeGreaterThan(chargerCompositeScore(unknown, maxRelevantKm));
  });

  it("sortByRecommendation orders a mixed set correctly end to end", () => {
    const a = row(1, true, 60); // closest, known, decent power -- should win
    const b = row(1, null, 150); // closest but unknown -- loses the tiebreak to a
    const c = row(15, true, 150); // far but known and fast -- still behind the two close ones
    const sorted = sortByRecommendation([c, b, a], maxRelevantKm);
    expect(sorted.map((r) => r.km)).toEqual([1, 1, 15]);
    expect(sorted[0]).toBe(a); // tiebreak: known beats unknown at equal distance
  });

  it("does not crash / returns a sane score when maxRelevantKm is 0 (no vehicle, empty reachable set edge case)", () => {
    const score = chargerCompositeScore(row(0, true, 60), 0);
    expect(Number.isFinite(score)).toBe(true);
  });
});
