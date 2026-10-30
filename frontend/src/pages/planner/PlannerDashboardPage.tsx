import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

import { ScreenState } from "../../components/common/ScreenState";
import { CapacityGapPanel } from "../../components/planner/CapacityGapPanel";
import { FeederChart } from "../../components/planner/FeederChart";
import { LocationVerdictPanel } from "../../components/planner/LocationVerdictPanel";
import { SiteAssistantPanel } from "../../components/planner/SiteAssistantPanel";
import { SiteMap, type MapFocus, type MapPoint } from "../../components/planner/SiteMap";
import { TopBar } from "../../components/planner/TopBar";
import { TopRecommendedSites } from "../../components/planner/TopRecommendedSites";
import { useChargers, useClassify, useRecommendedSites, useSites } from "../../hooks/useApiData";
import { getCapacityGaps } from "../../services/api";
import type { CapacityGap, ClassifiedSite, LocationSuggestion, Site } from "../../types";

interface ActivePoint {
  latitude: number;
  longitude: number;
  name: string;
}

export function PlannerDashboardPage() {
  const { data: sites, error, loading } = useSites();
  const { data: existingChargers } = useChargers();
  const { data: recommendedSites } = useRecommendedSites(10);

  const navigate = useNavigate();
  const location = useLocation();
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  // Set synchronously the instant we know coordinates (map click,
  // suggestion select). A free-text search doesn't know its coordinates
  // until the classify response resolves the name -- classify.result is
  // authoritative once it lands, so activePoint below derives from
  // whichever is available rather than copying result into a parallel
  // state via an effect.
  const [pendingPoint, setPendingPoint] = useState<ActivePoint | null>(null);
  const classify = useClassify();
  const [capacityGaps, setCapacityGaps] = useState<CapacityGap[] | null>(null);
  const [gapsLoading, setGapsLoading] = useState(true);
  const [gapsError, setGapsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGapsLoading(true);
    setGapsError(null);
    void getCapacityGaps()
      .then((rows) => {
        if (!cancelled) {
          setCapacityGaps(rows);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGapsError(err instanceof Error ? err.message : "Could not load capacity-gap alerts.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGapsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activePoint: ActivePoint | null = classify.result
    ? { latitude: classify.result.latitude, longitude: classify.result.longitude, name: classify.result.name }
    : pendingPoint;

  const kpis = useMemo(() => {
    const list = sites ?? [];
    const total = list.length;
    const build = list.filter((s) => s.recommendation === "BUILD").length;
    const managed = list.filter((s) => s.recommendation === "BUILD_IF_MANAGED").length;
    const dont = list.filter((s) => s.recommendation === "DONT_BUILD").length;
    return { total, build, managed, dont };
  }, [sites]);

  const selectedSite = useMemo(() => {
    return (sites ?? []).find((s) => s.id === selectedSiteId) ?? null;
  }, [sites, selectedSiteId]);

  // Deliberately keyed on lat/lon (primitives), not the activePoint object
  // itself -- activePoint is a fresh object every render (it's derived, not
  // stored), so memoizing on its identity would never actually memoize.
  // Keying on primitives is what gives SiteMap's focus effect a stable
  // reference to avoid re-flying on unrelated re-renders.
  const focus = useMemo<MapFocus | null>(
    () => (activePoint ? { latitude: activePoint.latitude, longitude: activePoint.longitude, zoom: 15 } : null),
    [activePoint?.latitude, activePoint?.longitude],
  );

  const highlight = useMemo<MapPoint | null>(
    () =>
      activePoint
        ? {
            id: "classify-highlight",
            name: activePoint.name || `${activePoint.latitude.toFixed(4)}, ${activePoint.longitude.toFixed(4)}`,
            latitude: activePoint.latitude,
            longitude: activePoint.longitude,
            recommendation: classify.result?.recommendation,
          }
        : null,
    [activePoint?.latitude, activePoint?.longitude, activePoint?.name, classify.result?.recommendation],
  );

  function handleMapClick(lat: number, lon: number) {
    setSelectedSiteId(null);
    setPendingPoint({ latitude: lat, longitude: lon, name: "" });
    classify.classifyPoint(lat, lon);
  }

  function handleSelectSuggestion(suggestion: LocationSuggestion) {
    const matchingSite = (sites ?? []).find((site) => site.id === suggestion.id);
    if (suggestion.kind === "candidate_site" && matchingSite) {
      setSelectedSiteId(matchingSite.id);
      setPendingPoint({
        latitude: matchingSite.latitude,
        longitude: matchingSite.longitude,
        name: matchingSite.name,
      });
      classify.clear();
      return;
    }
    setSelectedSiteId(null);
    setPendingPoint({ latitude: suggestion.latitude, longitude: suggestion.longitude, name: suggestion.name });
    classify.classifyPoint(suggestion.latitude, suggestion.longitude);
  }

  function handleSubmitFreeText(query: string) {
    setSelectedSiteId(null);
    setPendingPoint(null);
    classify.classifyName(query);
  }

  function handleClearSearch() {
    setSelectedSiteId(null);
    setPendingPoint(null);
    classify.clear();
  }

  useEffect(() => {
    const state = location.state as { assess?: LocationSuggestion; assessQuery?: string } | null;
    if (state?.assess) {
      handleSelectSuggestion(state.assess);
      navigate(".", { replace: true, state: {} });
      return;
    }
    if (state?.assessQuery) {
      handleSubmitFreeText(state.assessQuery);
      navigate(".", { replace: true, state: {} });
    }
    // Intentionally once per incoming navigation state, not on every classify identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <TopBar
        title="Overview"
        onAssessLocation={handleSelectSuggestion}
        onAssessQuery={handleSubmitFreeText}
        onClearAssessment={handleClearSearch}
      />
      <ScreenState loading={loading} error={error} empty={!loading && !error && (sites?.length ?? 0) === 0}>
        {sites ? (
          <div className="space-y-6 px-6 py-6 max-w-7xl mx-auto">
            {/* Top 4 Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-1 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-vo-muted">Candidate Sites</p>
                <div className="text-2xl font-bold text-vo-text font-mono">{kpis.total}</div>
                <p className="text-xs text-vo-muted">locations assessed in Bengaluru</p>
              </div>

              <div className="rounded-2xl border border-vo-good-border bg-vo-good-bg p-5 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-vo-good-ink">Recommended</p>
                  <CheckCircle2 className="w-4 h-4 text-vo-good-ink" />
                </div>
                <div className="text-2xl font-bold text-vo-good-ink font-mono">{kpis.build}</div>
                <p className="text-xs text-vo-good-ink/80">locations recommended to build</p>
              </div>

              <div className="rounded-2xl border border-vo-warn-border bg-vo-warn-bg p-5 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-vo-warn-ink">Needs Attention</p>
                  <AlertTriangle className="w-4 h-4 text-vo-warn-ink" />
                </div>
                <div className="text-2xl font-bold text-vo-warn-ink font-mono">{kpis.managed}</div>
                <p className="text-xs text-vo-warn-ink/80">locations need grid/load management</p>
              </div>

              <div className="rounded-2xl border border-vo-bad-border bg-vo-bad-bg p-5 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-vo-bad-ink">Not Recommended</p>
                  <XCircle className="w-4 h-4 text-vo-bad-ink" />
                </div>
                <div className="text-2xl font-bold text-vo-bad-ink font-mono">{kpis.dont}</div>
                <p className="text-xs text-vo-bad-ink/80">locations currently unsuitable</p>
              </div>
            </div>

            <CapacityGapPanel gaps={capacityGaps} loading={gapsLoading} error={gapsError} />

            {/* Map hero: search lives in TopBar; map click/site click populate the panel. */}
            <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr] lg:items-stretch">
              <div className="h-[520px] min-h-[360px] overflow-hidden rounded-2xl border border-vo-line shadow-lg">
                <SiteMap
                  legend={false}
                  chargers={existingChargers ?? []}
                  points={sites.map((site) => ({
                    id: site.id,
                    name: site.name,
                    latitude: site.latitude,
                    longitude: site.longitude,
                    recommendation: site.recommendation,
                  }))}
                  onPointClick={(id) => {
                    setSelectedSiteId(id);
                    classify.clear();
                    const site = sites.find((item) => item.id === id);
                    if (site) {
                      setPendingPoint({ latitude: site.latitude, longitude: site.longitude, name: site.name });
                    }
                  }}
                  onMapClick={handleMapClick}
                  focus={focus}
                  highlight={highlight}
                  classifiedResult={classify.result}
                  selectedSite={selectedSite}
                />
              </div>

              <div className="min-h-[360px] lg:h-[520px]">
                <LocationVerdictPanel
                  status={selectedSite ? "result" : classify.status}
                  result={selectedSite ? siteToAssessment(selectedSite) : classify.result}
                  siteId={selectedSite?.id ?? null}
                  errorMessage={classify.errorMessage}
                  legend={{ build: kpis.build, managed: kpis.managed, dont: kpis.dont }}
                  onClear={handleClearSearch}
                />
              </div>
            </div>

            {recommendedSites && recommendedSites.length > 0 ? <TopRecommendedSites sites={recommendedSites} /> : null}

            {/* Grid Capacity Section with Expandable Technical Details */}
            <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-vo-text">Grid Capacity</h3>
                  <p className="text-xs text-vo-muted">Feeder capacity status and headroom summary</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTechDetails(!showTechDetails)}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-vo-line text-xs text-vo-muted hover:text-vo-text transition-colors"
                >
                  <span>Technical details</span>
                  {showTechDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Simplified Grid Readiness Badges */}
              <div className="grid grid-cols-3 gap-4 pt-1">
                <div className="rounded-xl border border-vo-good-border bg-vo-good-bg p-3 text-center">
                  <div className="text-xs font-semibold text-vo-good-ink uppercase">Capacity Available</div>
                  <div className="text-lg font-bold text-vo-text font-mono mt-1">
                    {sites.filter((s) => s.grid_capacity_score >= 70).length} Sites
                  </div>
                </div>

                <div className="rounded-xl border border-vo-warn-border bg-vo-warn-bg p-3 text-center">
                  <div className="text-xs font-semibold text-vo-warn-ink uppercase">At Risk / Needs Management</div>
                  <div className="text-lg font-bold text-vo-text font-mono mt-1">
                    {sites.filter((s) => s.grid_capacity_score >= 40 && s.grid_capacity_score < 70).length} Sites
                  </div>
                </div>

                <div className="rounded-xl border border-vo-bad-border bg-vo-bad-bg p-3 text-center">
                  <div className="text-xs font-semibold text-vo-bad-ink uppercase">Needs Upgrade</div>
                  <div className="text-lg font-bold text-vo-text font-mono mt-1">
                    {sites.filter((s) => s.grid_capacity_score < 40).length} Sites
                  </div>
                </div>
              </div>

              {/* Expandable Technical Engineering Graph & Metrics */}
              {showTechDetails ? (
                <div className="pt-4 border-t border-vo-line/60 space-y-3">
                  <div className="text-xs font-semibold text-vo-accent uppercase tracking-wider">Feeder Headroom vs Peak Load Analysis</div>
                  <div className="h-[240px]">
                    <FeederChart sites={sites} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </ScreenState>
      <SiteAssistantPanel />
    </div>
  );
}

function siteToAssessment(site: Site): ClassifiedSite {
  return {
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    demand_score: site.demand_score,
    grid_capacity_score: site.grid_capacity_score,
    accessibility_score: site.accessibility_score,
    charger_gap_score: site.charger_gap_score,
    site_score: site.site_score,
    recommendation: site.recommendation,
    factors: site.factors ?? [],
    explanation: site.explanation ?? "",
    in_bbox: true,
    nearest_candidate: null,
  };
}
