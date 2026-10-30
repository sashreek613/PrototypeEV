import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import type { RecommendedSite } from "../../types";
import { RECOMMENDATION_COLOR } from "../../utils/recommendations";

interface TopRecommendedSitesProps {
  sites: RecommendedSite[];
}

/** Backed by GET /api/sites/recommended -- already ranked and sorted by the
 * API, so this component never re-sorts client-side. */
export function TopRecommendedSites({ sites }: TopRecommendedSitesProps) {
  const navigate = useNavigate();

  return (
    <section className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-vo-text">Top {sites.length} Recommended Sites</h3>
        <p className="text-xs text-vo-muted mt-0.5">Ranked by site score across demand, grid readiness, land and coverage gap.</p>
      </div>

      <ol className="space-y-2">
        {sites.map((site) => {
          const color = RECOMMENDATION_COLOR[site.recommendation];
          return (
            <li key={site.id}>
              <button
                type="button"
                onClick={() => navigate(`/planner/site/${site.id}`)}
                className="w-full text-left rounded-xl border border-vo-line/70 bg-vo-bg/40 px-3.5 py-3 hover:border-vo-accent/40 transition-colors flex items-center gap-3"
              >
                <span className="shrink-0 w-6 text-center text-xs font-mono font-bold text-vo-muted">#{site.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-vo-text">{site.name.replace(" (demo)", "")}</span>
                    <span className="shrink-0 text-xs font-mono font-bold" style={{ color }}>
                      {site.site_score.toFixed(1)}
                    </span>
                  </div>
                  {site.explanation ? (
                    <p className="mt-1 text-[11px] leading-snug text-vo-muted line-clamp-2">{site.explanation}</p>
                  ) : null}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-vo-muted shrink-0" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
