import { Link } from "react-router-dom";

import type { Site } from "../../types";
import { RecommendationBadge } from "../common/RecommendationBadge";
import { insightsForSite } from "../../utils/siteInsights";

interface RecentRecommendationsProps {
  sites: Site[];
}

export function RecentRecommendations({ sites }: RecentRecommendationsProps) {
  const rows = [...sites].sort((a, b) => b.site_score - a.site_score).slice(0, 5);

  return (
    <ul className="divide-y divide-vo-line">
      {rows.map((site) => {
        const insights = insightsForSite(site);
        return (
          <li key={site.id}>
            <Link to={`/planner/site/${site.id}`} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-vo-text">{site.name.replace(" (demo)", "")}</p>
                <p className="mt-0.5 text-[11px] text-vo-muted">
                  {site.id} · demand {Math.round(site.demand_score)} · headroom {insights.headroomKva} kVA
                </p>
              </div>
              <RecommendationBadge value={site.recommendation} short />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
