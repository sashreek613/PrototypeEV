import type { Recommendation } from "../types";

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  BUILD: "BUILD",
  BUILD_IF_MANAGED: "BUILD IF MANAGED",
  DONT_BUILD: "DON'T BUILD",
};

export const RECOMMENDATION_SHORT: Record<Recommendation, string> = {
  BUILD: "BUILD",
  BUILD_IF_MANAGED: "MANAGED",
  DONT_BUILD: "DON'T BUILD",
};

export const RECOMMENDATION_COLOR: Record<Recommendation, string> = {
  BUILD: "#00e8a2",
  BUILD_IF_MANAGED: "#f0b429",
  DONT_BUILD: "#ef5b5b",
};

/** Darker inks for text on the always-white MapLibre popup. */
export const RECOMMENDATION_INK: Record<Recommendation, string> = {
  BUILD: "#166534",
  BUILD_IF_MANAGED: "#92400e",
  DONT_BUILD: "#991b1b",
};

export const RECOMMENDATION_TONE_CLASS: Record<Recommendation, string> = {
  BUILD: "border-vo-good-border bg-vo-good-bg text-vo-good-ink",
  BUILD_IF_MANAGED: "border-vo-warn-border bg-vo-warn-bg text-vo-warn-ink",
  DONT_BUILD: "border-vo-bad-border bg-vo-bad-bg text-vo-bad-ink",
};

export const RECOMMENDATION_COPY: Record<Recommendation, string> = {
  BUILD: "Demand and grid headroom both clear the threshold. Site is ready for tender.",
  BUILD_IF_MANAGED: "Demand is strong, but the feeder needs load control or staged commissioning.",
  DONT_BUILD: "Demand or grid headroom does not clear the current siting rule. Do not tender yet.",
};

export const RECOMMENDATION_RULE: Record<Recommendation, string> = {
  BUILD: "Demand ≥ 70 and grid capacity ≥ 70",
  BUILD_IF_MANAGED: "Demand ≥ 70 and grid capacity ≥ 40",
  DONT_BUILD: "Demand < 70 or grid capacity < 40",
};
