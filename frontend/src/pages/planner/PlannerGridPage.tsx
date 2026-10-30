
import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Activity } from "lucide-react";

import { ScreenState } from "../../components/common/ScreenState";
import { FeederChart } from "../../components/planner/FeederChart";
import { TopBar } from "../../components/planner/TopBar";
import { useSites } from "../../hooks/useApiData";
import { insightsForSite } from "../../utils/siteInsights";

export function PlannerGridPage() {
  const { data: sites, error, loading } = useSites();
  const [showTechTable, setShowTechTable] = useState(true);

  const gridReadiness = useMemo(() => {
    const list = sites ?? [];
    const ready = list.filter((s) => s.grid_capacity_score >= 70);
    const managed = list.filter((s) => s.grid_capacity_score >= 40 && s.grid_capacity_score < 70);
    const upgrade = list.filter((s) => s.grid_capacity_score < 40);
    return { ready, managed, upgrade };
  }, [sites]);

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <TopBar title="Grid & Demand" />
      <ScreenState loading={loading} error={error} empty={!loading && !error && (sites?.length ?? 0) === 0}>
        {sites ? (
          <div className="space-y-6 px-6 py-6 max-w-7xl mx-auto">
            <div>
              <h1 className="text-xl font-bold text-vo-text flex items-center space-x-2">
                <Activity className="w-5 h-5 text-vo-accent" />
                <span>Electrical Grid Readiness & Headroom</span>
              </h1>
              <p className="text-xs text-vo-muted mt-0.5">
                Evaluation of distribution feeder capacities and peak EV charging demand impact.
              </p>
            </div>

            {/* Top Grid Readiness Cards */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-vo-muted">Grid Readiness Summary</h2>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-vo-good-border bg-vo-good-bg p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-vo-good-ink">🟢 Ready</span>
                    <CheckCircle2 className="w-4 h-4 text-vo-good-ink" />
                  </div>
                  <div className="text-2xl font-bold text-vo-text font-mono">{gridReadiness.ready.length} Locations</div>
                  <p className="text-xs text-vo-good-ink/80">Sufficient transformer headroom available for immediate fast charging.</p>
                </div>

                <div className="rounded-2xl border border-vo-warn-border bg-vo-warn-bg p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-vo-warn-ink">🟡 Needs Intervention</span>
                    <AlertTriangle className="w-4 h-4 text-vo-warn-ink" />
                  </div>
                  <div className="text-2xl font-bold text-vo-text font-mono">{gridReadiness.managed.length} Locations</div>
                  <p className="text-xs text-vo-warn-ink/80">Requires smart load controllers or off-peak managed charging schedules.</p>
                </div>

                <div className="rounded-2xl border border-vo-bad-border bg-vo-bad-bg p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-vo-bad-ink">🔴 Upgrade Required</span>
                    <XCircle className="w-4 h-4 text-vo-bad-ink" />
                  </div>
                  <div className="text-2xl font-bold text-vo-text font-mono">{gridReadiness.upgrade.length} Locations</div>
                  <p className="text-xs text-vo-bad-ink/80">High feeder load; requires physical transformer or line capacity upgrade.</p>
                </div>
              </div>
            </div>

            {/* Feeder Headroom Visual Chart */}
            <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
              <h3 className="text-base font-bold text-vo-text">Feeder Headroom vs Peak EV Demand</h3>
              <div className="h-[260px]">
                <FeederChart sites={sites} />
              </div>
            </div>

            {/* Technical Grid Metrics Table */}
            <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-vo-text">Technical Grid Details</h3>
                  <p className="text-xs text-vo-muted">Detailed electrical engineering specifications per feeder</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTechTable(!showTechTable)}
                  className="flex items-center space-x-1 text-xs text-vo-accent hover:underline font-medium"
                >
                  <span>{showTechTable ? "Hide details" : "Show details"}</span>
                  {showTechTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showTechTable ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-vo-line/80 text-vo-muted font-mono uppercase">
                        <th className="pb-3 font-semibold">Location</th>
                        <th className="pb-3 font-semibold">Feeder Name</th>
                        <th className="pb-3 font-semibold">Transformer (kVA)</th>
                        <th className="pb-3 font-semibold">Peak Load (%)</th>
                        <th className="pb-3 font-semibold">Spare Headroom</th>
                        <th className="pb-3 font-semibold">Grid Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-vo-line/40 text-vo-soft">
                      {sites.map((site) => {
                        const insights = insightsForSite(site);
                        const isReady = site.grid_capacity_score >= 70;
                        const isManaged = site.grid_capacity_score >= 40 && site.grid_capacity_score < 70;

                        return (
                          <tr key={site.id} className="hover:bg-vo-line/40 transition-colors">
                            <td className="py-3 font-bold text-vo-text">{site.name.replace(" (demo)", "")}</td>
                            <td className="py-3 font-mono">{insights.feederName}</td>
                            <td className="py-3 font-mono">{insights.transformerKva} kVA</td>
                            <td className="py-3 font-mono">{insights.peakLoadPct}%</td>
                            <td className="py-3 font-mono text-vo-accent">{insights.headroomKva} kVA</td>
                            <td className="py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${isReady ? "bg-vo-good-bg border-vo-good-border text-vo-good-ink" : isManaged ? "bg-vo-warn-bg border-vo-warn-border text-vo-warn-ink" : "bg-vo-bad-bg border-vo-bad-border text-vo-bad-ink"
                                }`}>
                                {isReady ? "Capacity Available" : isManaged ? "Needs Management" : "Upgrade Required"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </ScreenState>
    </div>
  );
}
