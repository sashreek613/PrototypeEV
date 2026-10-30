import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, ArrowRight, BookmarkPlus, Check } from "lucide-react";

import { LocationSearchBox } from "../../components/planner/LocationSearchBox";
import { ScreenState } from "../../components/common/ScreenState";
import { TopBar } from "../../components/planner/TopBar";
import { useConsiderationContext } from "../../context/ConsiderationContext";
import { useSites } from "../../hooks/useApiData";
import type { LocationSuggestion, Site } from "../../types";

/** Status values considered "viable candidate locations" for the Planner.
 * DONT_BUILD sites are excluded from Site Explorer entirely -- they remain
 * in the database and are still used by scoring/backend logic. */
const VIABLE_STATUSES = new Set(["BUILD", "BUILD_IF_MANAGED"]);

export function PlannerExplorerPage() {
  const { data: sites, error, loading } = useSites();
  const navigate = useNavigate();
  const consideration = useConsiderationContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [demandFilter, setDemandFilter] = useState<string>("ALL");

  // Only show viable candidate locations -- DONT_BUILD is hidden from this view.
  const viableSites = useMemo(() => (sites ?? []).filter((s) => VIABLE_STATUSES.has(s.recommendation)), [sites]);

  const filteredSites = useMemo(() => {
    let list = viableSites;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
    }

    if (statusFilter !== "ALL") {
      list = list.filter((s) => s.recommendation === statusFilter);
    }

    if (demandFilter === "HIGH") {
      list = list.filter((s) => s.demand_score >= 70);
    } else if (demandFilter === "MEDIUM") {
      list = list.filter((s) => s.demand_score >= 50 && s.demand_score < 70);
    } else if (demandFilter === "LOW") {
      list = list.filter((s) => s.demand_score < 50);
    }

    return list;
  }, [viableSites, searchQuery, statusFilter, demandFilter]);

  function handleSelectSuggestion(suggestion: LocationSuggestion) {
    if (suggestion.kind === "candidate_site") {
      navigate(`/planner/site/${suggestion.id}`);
    } else {
      setSearchQuery(suggestion.name);
    }
  }

  function handleSubmitFreeText(query: string) {
    setSearchQuery(query);
  }

  function handleClearSearch() {
    setSearchQuery("");
  }

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <TopBar title="Site Explorer" />
      <ScreenState loading={loading} error={error} empty={!loading && !error && (viableSites.length ?? 0) === 0}>
        {sites ? (
          <div className="space-y-6 px-6 py-6 max-w-7xl mx-auto">
            {/* Header & Filter Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-vo-text">Candidate Site Explorer</h1>
                <p className="text-xs text-vo-muted mt-0.5">
                  Explore viable candidate locations, demand projections, and grid suitability.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <LocationSearchBox
                  className="w-64 z-30"
                  placeholder="Search any area or site in Bengaluru..."
                  initialQuery={searchQuery}
                  onSelectSuggestion={handleSelectSuggestion}
                  onSubmitFreeText={handleSubmitFreeText}
                  onClear={handleClearSearch}
                />

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-vo-line bg-vo-card px-3 py-2 text-xs text-vo-text focus:border-[#4F6F9F] focus:outline-none"
                >
                  <option value="ALL">All viable sites</option>
                  <option value="BUILD">Build</option>
                  <option value="BUILD_IF_MANAGED">Needs Management</option>
                </select>

                <select
                  value={demandFilter}
                  onChange={(e) => setDemandFilter(e.target.value)}
                  className="rounded-lg border border-vo-line bg-vo-card px-3 py-2 text-xs text-vo-text focus:border-[#4F6F9F] focus:outline-none"
                >
                  <option value="ALL">All Demand Levels</option>
                  <option value="HIGH">High Demand (≥70)</option>
                  <option value="MEDIUM">Medium Demand (50-69)</option>
                  <option value="LOW">Low Demand (&lt;50)</option>
                </select>
              </div>
            </div>

            {/* Sites Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSites.map((site) => (
                <ExplorerSiteCard
                  key={site.id}
                  site={site}
                  onInspect={() => navigate(`/planner/site/${site.id}`)}
                  isInConsideration={consideration.isInConsideration(site.id)}
                  onAddToConsideration={() => void consideration.add(site.id)}
                />
              ))}
            </div>

            {filteredSites.length === 0 ? (
              <div className="rounded-xl border border-vo-line bg-vo-card p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-vo-text">
                  {searchQuery ? `No candidate sites match "${searchQuery}".` : "No suitable candidate locations found."}
                </p>
                <p className="text-xs text-vo-muted">
                  {searchQuery
                    ? `You can assess "${searchQuery}" or any area in Bengaluru directly on the Overview map.`
                    : "Try clearing your search query or adjusting the demand filter."}
                </p>
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => navigate("/planner", { state: { assessQuery: searchQuery } })}
                    className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white text-xs font-semibold hover:bg-[#3F5F8F] transition-colors"
                  >
                    <span>Assess "{searchQuery}" on Overview Map</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </ScreenState>
    </div>
  );
}

function ExplorerSiteCard({
  site,
  onInspect,
  isInConsideration,
  onAddToConsideration,
}: {
  site: Site;
  onInspect: () => void;
  isInConsideration: boolean;
  onAddToConsideration: () => void;
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
    <div className="rounded-xl border border-vo-line bg-vo-card p-5 space-y-4 flex flex-col justify-between hover:border-[#4F6F9F]/30 transition-colors shadow-sm">
      <div className="space-y-3">
        {/* Status badge + score */}
        <div className="flex items-center justify-between">
          {isBuild ? (
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border bg-[#EDF4ED] border-[#7FA58A]/40 text-[#4A7C5F]">
              BUILD
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border bg-[#FDF4E3] border-[#C5A66A]/40 text-[#8C6D2E]">
              NEEDS MANAGEMENT
            </span>
          )}
          <span className="text-xs text-vo-muted font-mono">Score: {site.site_score}</span>
        </div>

        {/* Name + division */}
        <div>
          <h3 className="text-sm font-bold text-vo-text">{site.name.replace(" (demo)", "")}</h3>
          <p className="text-xs text-vo-muted flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" />
            <span>Bengaluru Urban Division</span>
          </p>
        </div>

        {/* Key metrics */}
        <div className="space-y-2 pt-1 text-xs">
          <div>
            <div className="flex justify-between text-vo-muted mb-1">
              <span>EV Demand Projection</span>
              <span className="font-bold text-vo-text font-mono">{Math.round(site.demand_score)}/100</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--vo-elevated)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, site.demand_score)}%`,
                  backgroundColor: isBuild ? "#7FA58A" : "#C5A66A",
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-vo-muted border-t border-vo-line/40 pt-2">
            <span>Grid Readiness:</span>
            <span className="font-semibold text-vo-text">{gridReadiness}</span>
          </div>

          <div className="flex items-center justify-between text-vo-muted">
            <span>Recommended Chargers:</span>
            <span className="font-semibold text-[#4F6F9F] dark:text-[#6F8FB8]">{recommendedChargers} Units</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={onInspect}
          className="w-full py-2 rounded-lg bg-vo-elevated border border-vo-line hover:border-[#4F6F9F]/30 text-xs font-semibold text-vo-text transition-colors flex items-center justify-center gap-1.5"
        >
          <span>Inspect site details</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onAddToConsideration}
          disabled={isInConsideration}
          className={`w-full py-2 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
            isInConsideration
              ? "border-[#4F6F9F]/30 bg-[#EEF2F7] dark:bg-[#4F6F9F]/10 text-[#4F6F9F] dark:text-[#6F8FB8] cursor-default"
              : "border-vo-line bg-vo-card hover:border-[#4F6F9F]/40 hover:bg-[#EEF2F7]/50 dark:hover:bg-[#4F6F9F]/10 text-vo-soft hover:text-[#4F6F9F] dark:hover:text-[#6F8FB8]"
          }`}
        >
          {isInConsideration ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>In consideration</span>
            </>
          ) : (
            <>
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Add to consideration</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
