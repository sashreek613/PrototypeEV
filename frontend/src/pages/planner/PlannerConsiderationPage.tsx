import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, MapPin, Trash2, FileText, Loader2 } from "lucide-react";

import { TopBar } from "../../components/planner/TopBar";
import { ScreenState } from "../../components/common/ScreenState";
import { useConsiderationContext } from "../../context/ConsiderationContext";
import { useSites } from "../../hooks/useApiData";
import { createPlannerReport } from "../../services/api";
import type { Site } from "../../types";

export function PlannerConsiderationPage() {
  const navigate = useNavigate();
  const { items, remove, loading: considerationLoading, error: considerationError } = useConsiderationContext();
  const { data: allSites, loading: sitesLoading, error: sitesError } = useSites();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Map consideration items to their full site objects
  const shortlistedSites = useMemo<(Site & { added_at: string })[]>(() => {
    if (!allSites) return [];
    const siteMap = new Map(allSites.map((s) => [s.id, s]));
    return items
      .map((item) => {
        const site = siteMap.get(item.site_id);
        return site ? { ...site, added_at: item.added_at } : null;
      })
      .filter((s): s is Site & { added_at: string } => s !== null);
  }, [items, allSites]);

  const allSelected = shortlistedSites.length > 0 && selectedIds.size === shortlistedSites.length;

  function toggleSite(siteId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shortlistedSites.map((s) => s.id)));
    }
  }

  async function handleGenerateReport() {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const division = "Bengaluru Urban Division";
      const report = await createPlannerReport({
        site_ids: [...selectedIds],
        title: "EV Infrastructure Site Assessment",
        division,
      });
      navigate(`/planner/reports?highlight=${report.id}`);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const loading = considerationLoading || sitesLoading;
  const error = considerationError ?? sitesError;

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <TopBar title="Consideration" />
      <ScreenState loading={loading} error={error}>
        <div className="space-y-6 px-6 py-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-vo-text">Consideration</h1>
              <p className="text-xs text-vo-muted mt-0.5">Locations selected for further planning.</p>
            </div>
            {shortlistedSites.length > 0 ? (
              <span className="text-xs text-vo-muted font-mono">
                {shortlistedSites.length} location{shortlistedSites.length !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          {/* Empty state */}
          {shortlistedSites.length === 0 ? (
            <div className="rounded-xl border border-vo-line bg-vo-card p-12 text-center space-y-3">
              <p className="text-sm font-semibold text-vo-text">No locations selected yet.</p>
              <p className="text-xs text-vo-muted">
                Explore suitable locations and add them here for further planning.
              </p>
              <button
                type="button"
                onClick={() => navigate("/planner/explorer")}
                className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 rounded-lg border border-[#4F6F9F]/30 bg-[#EEF2F7] dark:bg-[#4F6F9F]/10 text-xs font-semibold text-[#4F6F9F] dark:text-[#6F8FB8] hover:bg-[#4F6F9F]/15 transition-colors"
              >
                <span>Explore sites</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {/* Selection toolbar */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-vo-line bg-vo-card px-4 py-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-vo-line accent-[#4F6F9F]"
                  />
                  <span className="text-xs font-semibold text-vo-text">
                    {allSelected ? "Deselect all" : "Select all"}
                  </span>
                </label>

                <div className="flex items-center gap-3">
                  {selectedIds.size > 0 ? (
                    <span className="text-xs text-vo-muted">
                      {selectedIds.size} site{selectedIds.size !== 1 ? "s" : ""} selected
                    </span>
                  ) : null}

                  {generateError ? (
                    <p className="text-xs text-[#B87979]">{generateError}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleGenerateReport()}
                    disabled={selectedIds.size === 0 || generating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white text-xs font-semibold hover:bg-[#3F5F8F] dark:hover:bg-[#5D7EA8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {generating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    <span>Generate report</span>
                  </button>
                </div>
              </div>

              {/* Site list */}
              <div className="space-y-3">
                {shortlistedSites.map((site) => (
                  <ConsiderationSiteCard
                    key={site.id}
                    site={site}
                    selected={selectedIds.has(site.id)}
                    onToggle={() => toggleSite(site.id)}
                    onViewDetails={() => navigate(`/planner/site/${site.id}`)}
                    onRemove={() => void remove(site.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </ScreenState>
    </div>
  );
}

function ConsiderationSiteCard({
  site,
  selected,
  onToggle,
  onViewDetails,
  onRemove,
}: {
  site: Site & { added_at: string };
  selected: boolean;
  onToggle: () => void;
  onViewDetails: () => void;
  onRemove: () => void;
}) {
  const isBuild = site.recommendation === "BUILD";
  const isManaged = site.recommendation === "BUILD_IF_MANAGED";

  const recommendedChargers = isBuild
    ? Math.max(4, Math.round(site.demand_score / 12))
    : isManaged
    ? Math.max(2, Math.round(site.demand_score / 18))
    : 0;

  const gridReadiness =
    site.grid_capacity_score >= 70
      ? "Ready"
      : site.grid_capacity_score >= 40
      ? "Needs Management"
      : "Upgrade Required";

  return (
    <div
      className={`rounded-xl border bg-vo-card p-4 transition-colors ${
        selected ? "border-[#4F6F9F]/40 bg-[#EEF2F7]/30 dark:bg-[#4F6F9F]/5" : "border-vo-line"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-vo-line accent-[#4F6F9F] cursor-pointer"
            aria-label={`Select ${site.name}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Name, division, badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-vo-text truncate">{site.name.replace(" (demo)", "")}</h3>
              <p className="text-xs text-vo-muted flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                <span>Bengaluru Urban Division</span>
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                {isBuild ? (
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border bg-[#EDF4ED] border-[#7FA58A]/40 text-[#4A7C5F]">
                    BUILD
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border bg-[#FDF4E3] border-[#C5A66A]/40 text-[#8C6D2E]">
                    NEEDS MANAGEMENT
                  </span>
                )}
                <span className="text-[10px] font-mono text-vo-muted">Score {site.site_score}</span>
              </div>
            </div>

            {/* Remove */}
            <button
              type="button"
              onClick={onRemove}
              title="Remove from consideration"
              className="shrink-0 rounded-lg p-1.5 text-vo-muted hover:text-[#B87979] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="text-vo-muted">EV Demand</p>
              <p className="font-bold text-vo-text font-mono">{Math.round(site.demand_score)}/100</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-vo-muted">Grid Readiness</p>
              <p className="font-bold text-vo-text">{gridReadiness}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-vo-muted">Rec. Chargers</p>
              <p className="font-bold text-[#4F6F9F] dark:text-[#6F8FB8] font-mono">{recommendedChargers} Units</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onViewDetails}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vo-line bg-vo-elevated hover:border-[#4F6F9F]/30 text-xs font-semibold text-vo-text transition-colors"
            >
              <span>View details</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            {selected && (
              <span className="flex items-center gap-1 text-xs text-[#4F6F9F] dark:text-[#6F8FB8]">
                <Check className="w-3 h-3" />
                <span>Selected for report</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
