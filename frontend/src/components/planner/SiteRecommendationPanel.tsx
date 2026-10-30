import type { Recommendation } from "../../types";
import { RECOMMENDATION_COLOR, RECOMMENDATION_COPY, RECOMMENDATION_LABEL, RECOMMENDATION_RULE } from "../../utils/recommendations";

const ORDER: Recommendation[] = ["BUILD", "BUILD_IF_MANAGED", "DONT_BUILD"];

interface SiteRecommendationPanelProps {
  value: Recommendation;
}

export function SiteRecommendationPanel({ value }: SiteRecommendationPanelProps) {
  return (
    <section className="rounded-2xl border border-vo-border bg-vo-surface p-4">
      <p className="mb-3 text-[11px] tracking-[0.16em] text-vo-muted">VERDICT LADDER</p>
      <div className="flex flex-col gap-2">
        {ORDER.map((item) => {
          const active = item === value;
          const color = RECOMMENDATION_COLOR[item];
          return (
            <div
              key={item}
              className="rounded-xl border px-3 py-3"
              style={{
                borderColor: active ? color : "#27303b",
                background: active ? `${color}14` : "transparent",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{
                    borderColor: color,
                    background: active ? color : "transparent",
                  }}
                />
                <p className="text-[13px] font-semibold" style={{ color: active ? color : "#f4f6f8" }}>
                  {RECOMMENDATION_LABEL[item]}
                </p>
              </div>
              <p className="mt-1 pl-5 text-[11px] text-vo-muted">{RECOMMENDATION_RULE[item]}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[12px] leading-5 text-vo-soft">{RECOMMENDATION_COPY[value]}</p>
    </section>
  );
}
