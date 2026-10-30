import type { Recommendation } from "../../types";
import { RECOMMENDATION_LABEL, RECOMMENDATION_SHORT, RECOMMENDATION_TONE_CLASS } from "../../utils/recommendations";

interface RecommendationBadgeProps {
  value: Recommendation;
  short?: boolean;
}

export function RecommendationBadge({ value, short = false }: RecommendationBadgeProps) {
  const label = short ? RECOMMENDATION_SHORT[value] : RECOMMENDATION_LABEL[value];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] ${RECOMMENDATION_TONE_CLASS[value]}`}>
      {label}
    </span>
  );
}
