import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, ArrowRight, Printer, ShieldCheck } from "lucide-react";

import { ScreenState } from "../../components/common/ScreenState";
import { TopBar } from "../../components/planner/TopBar";
import { useSites } from "../../hooks/useApiData";
import type { Site } from "../../types";

export function PlannerBuildPlanPage() {
  const { data: sites, error, loading } = useSites();
  const navigate = useNavigate();

  const prioritized = useMemo(() => {
    const list = sites ?? [];
    return list
      .filter((s) => s.recommendation === "BUILD" || s.recommendation === "BUILD_IF_MANAGED")
      .sort((a, b) => {
        // BUILD first, then by site_score descending
        if (a.recommendation === "BUILD" && b.recommendation !== "BUILD") return -1;
        if (a.recommendation !== "BUILD" && b.recommendation === "BUILD") return 1;
        return b.site_score - a.site_score;
      });
  }, [sites]);

  const summary = useMemo(() => {
    const totalSites = prioritized.length;
    const totalChargers = prioritized.reduce((acc, s) => acc + getChargerCount(s), 0);
    const unconditionalCount = prioritized.filter((s) => s.recommendation === "BUILD").length;
    const managedCount = prioritized.filter((s) => s.recommendation === "BUILD_IF_MANAGED").length;
    return { totalSites, totalChargers, unconditionalCount, managedCount };
  }, [prioritized]);

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <TopBar title="Build Plan" />
      <ScreenState loading={loading} error={error} empty={!loading && !error && (sites?.length ?? 0) === 0}>
        {sites ? (
          <div className="space-y-6 px-6 py-6 max-w-7xl mx-auto">
            {/* Header & Subtitle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-vo-text flex items-center space-x-2">
                  <ClipboardList className="w-5 h-5 text-vo-accent" />
                  <span>Build Plan</span>
                </h1>
                <p className="text-xs text-vo-muted mt-0.5">
                  Prioritized locations for EV charging infrastructure implementation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="vo-hover-interactive inline-flex items-center space-x-2 px-4 py-2 rounded-[8px] bg-vo-card border border-vo-line hover:border-vo-accent/40 text-xs font-semibold text-vo-text transition-colors"
              >
                <Printer className="w-4 h-4 text-vo-accent" />
                <span>Print Build Plan</span>
              </button>
            </div>

            {/* Action Banner */}
            <div className="rounded-[16px] border border-vo-border bg-[#0d131f] p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
              <div className="space-y-1">
                <div className="text-xs font-bold font-mono uppercase tracking-wider text-vo-good-ink">Phase 1 Infrastructure Deployment</div>
                <h2 className="text-lg font-bold text-white">
                  Recommended for Phase 1: {summary.totalSites} Sites / {summary.totalChargers} Chargers
                </h2>
                <p className="text-xs text-vo-muted">
                  Includes {summary.unconditionalCount} grid-ready sites and {summary.managedCount} managed charging sites.
                </p>
              </div>
            </div>

            {/* Priority-Ordered Site Cards */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-vo-muted">Implementation Priorities</h2>

              <div className="space-y-3">
                {prioritized.map((site, index) => {
                  const isBuild = site.recommendation === "BUILD";
                  const chargers = getChargerCount(site);

                  return (
                    <div
                      key={site.id}
                      className="rounded-[12px] border border-vo-line bg-vo-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-vo-accent/40 transition-colors shadow-sm"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="w-10 h-10 rounded-xl bg-vo-bg border border-vo-line flex items-center justify-center font-mono font-bold text-sm text-vo-accent shrink-0">
                          #{index + 1}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-base font-bold text-vo-text">{site.name.replace(" (demo)", "")}</h3>
                            <span
                              className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded border ${
                                isBuild ? "bg-vo-good-bg border-vo-good-border text-vo-good-ink" : "bg-vo-warn-bg border-vo-warn-border text-vo-warn-ink"
                              }`}
                            >
                              {isBuild ? "BUILD" : "BUILD IF MANAGED"}
                            </span>
                          </div>

                          <p className="text-xs text-vo-muted flex items-center space-x-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-vo-good-ink shrink-0" />
                            <span>
                              {isBuild
                                ? "Reason: High demand + grid capacity ready"
                                : "Reason: High demand + smart load scheduling required"}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-vo-line/40">
                        <div className="text-right">
                          <div className="text-sm font-bold text-vo-accent font-mono">{chargers} Chargers</div>
                          <div className="text-[10px] text-vo-muted">Recommended Units</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => navigate(`/planner/site/${site.id}`)}
                          className="vo-hover-interactive px-3.5 py-2 rounded-[8px] bg-vo-bg border border-vo-line hover:border-vo-accent/40 text-xs font-semibold text-vo-text flex items-center space-x-1 transition-colors"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </ScreenState>
    </div>
  );
}

function getChargerCount(site: Site): number {
  if (site.recommendation === "BUILD") {
    return Math.max(4, Math.round(site.demand_score / 12));
  }
  if (site.recommendation === "BUILD_IF_MANAGED") {
    return Math.max(2, Math.round(site.demand_score / 18));
  }
  return 0;
}
