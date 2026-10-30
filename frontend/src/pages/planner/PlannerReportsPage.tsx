import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, ArrowLeft, Printer, Trash2, ChevronDown, ChevronUp } from "lucide-react";

import { ScreenState } from "../../components/common/ScreenState";
import { TopBar } from "../../components/planner/TopBar";
import { deletePlannerReport, getPlannerReports } from "../../services/api";
import { useSites } from "../../hooks/useApiData";
import { insightsForSite } from "../../utils/siteInsights";
import type { PlannerReport, Site } from "../../types";

export function PlannerReportsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [reports, setReports] = useState<PlannerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(highlightId ?? null);

  const { data: allSites, loading: sitesLoading, error: sitesError } = useSites();

  const siteMap = useMemo(() => {
    if (!allSites) return new Map<string, Site>();
    return new Map(allSites.map((s) => [s.id, s]));
  }, [allSites]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPlannerReports();
      setReports(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  // Keep expandedId in sync if query param changes
  useEffect(() => {
    if (highlightId) {
      setExpandedId(highlightId);
    }
  }, [highlightId]);

  // Scroll to highlighted report
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlightId, reports]);

  async function handleDelete(reportId: string) {
    await deletePlannerReport(reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    if (expandedId === reportId) setExpandedId(null);
  }

  const combinedLoading = loading || (sitesLoading && reports.length === 0);
  const combinedError = error ?? sitesError;

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <TopBar title="Reports" />
      <ScreenState loading={combinedLoading} error={combinedError}>
        <div className="space-y-6 px-6 py-6 max-w-4xl mx-auto">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-vo-text flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#4F6F9F] dark:text-[#6F8FB8]" />
              <span>Reports</span>
            </h1>
            <p className="text-xs text-vo-muted mt-0.5">
              Generated site assessment reports from your selected locations.
            </p>
          </div>

          {/* Empty state */}
          {reports.length === 0 ? (
            <div className="rounded-xl border border-vo-line bg-vo-card p-12 text-center space-y-3">
              <FileText className="w-8 h-8 text-vo-muted mx-auto" />
              <p className="text-sm font-semibold text-vo-text">No reports generated yet.</p>
              <p className="text-xs text-vo-muted">
                Select locations from Consideration to create a site assessment report.
              </p>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 rounded-lg border border-[#4F6F9F]/30 bg-[#EEF2F7] dark:bg-[#4F6F9F]/10 text-xs font-semibold text-[#4F6F9F] dark:text-[#6F8FB8] hover:bg-[#4F6F9F]/15 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Go to Consideration</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  siteMap={siteMap}
                  isExpanded={expandedId === report.id}
                  isHighlighted={report.id === highlightId}
                  onToggle={() => setExpandedId((prev) => (prev === report.id ? null : report.id))}
                  onDelete={() => void handleDelete(report.id)}
                  ref={report.id === highlightId ? highlightRef : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </ScreenState>
    </div>
  );
}

interface ReportCardProps {
  report: PlannerReport;
  siteMap: Map<string, Site>;
  isExpanded: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

const ReportCard = forwardRef<HTMLDivElement, ReportCardProps>(function ReportCard(
  { report, siteMap, isExpanded, isHighlighted, onToggle, onDelete },
  ref,
) {
  // Boolean(s) filter guarantees no undefined entries reach render
  const sites = report.site_ids.map((id) => siteMap.get(id)).filter((s): s is Site => Boolean(s));

  const date = new Date(report.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      ref={ref}
      className={`rounded-xl border bg-vo-card transition-colors ${
        isHighlighted ? "border-[#4F6F9F]/50" : "border-vo-line"
      }`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#4F6F9F] dark:text-[#6F8FB8] shrink-0" />
            <h3 className="text-sm font-bold text-vo-text truncate">{report.title}</h3>
          </div>
          <p className="text-xs text-vo-muted pl-6">
            {report.site_ids.length} location{report.site_ids.length !== 1 ? "s" : ""}
            {report.division ? ` · ${report.division}` : ""}
            {" · "}Generated {date}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!isExpanded) {
                onToggle();
              }
              setTimeout(() => window.print(), 100);
            }}
            title="Print report"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vo-line bg-vo-elevated text-xs font-semibold text-vo-text hover:border-[#4F6F9F]/30 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button
            type="button"
            onClick={onToggle}
            title={isExpanded ? "Collapse" : "View report"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white text-xs font-semibold hover:bg-[#3F5F8F] dark:hover:bg-[#5D7EA8] transition-colors"
          >
            <span>View</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete report"
            className="rounded-lg p-1.5 text-vo-muted hover:text-[#B87979] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded report body */}
      {isExpanded && (
        <div className="border-t border-vo-line px-5 py-5 space-y-6 print-report">
          {/* Report header */}
          <div className="space-y-1">
            <div>
              <h2 className="text-base font-bold text-vo-text">{report.title}</h2>
              <p className="text-xs text-vo-muted mt-0.5">
                {report.site_ids.length} selected location{report.site_ids.length !== 1 ? "s" : ""} ·{" "}
                {report.division ?? "Bengaluru Urban Division"} · Generated {date}
              </p>
            </div>
          </div>

          {/* Site entries */}
          {sites.length === 0 ? (
            <p className="text-xs text-vo-muted italic">Loading site details or site data not available...</p>
          ) : (
            <div className="space-y-4">
              {sites.map((site) => (
                <ReportSiteEntry key={site.id} site={site} division={report.division ?? "Bengaluru Urban Division"} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function ReportSiteEntry({ site, division }: { site: Site; division: string }) {
  if (!site) return null;

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

  const insights = insightsForSite(site);

  return (
    <div className="rounded-xl border border-vo-line bg-vo-elevated p-4 space-y-3">
      {/* Site header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-vo-text">{site.name.replace(" (demo)", "")}</h4>
          <p className="text-xs text-vo-muted mt-0.5">{division}</p>
        </div>
        <div className="text-right space-y-1">
          {isBuild ? (
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border bg-[#EDF4ED] border-[#7FA58A]/40 text-[#4A7C5F]">
              BUILD
            </span>
          ) : isManaged ? (
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border bg-[#FDF4E3] border-[#C5A66A]/40 text-[#8C6D2E]">
              NEEDS MANAGEMENT
            </span>
          ) : null}
          <p className="text-[10px] font-mono text-vo-muted">Site Score: {site.site_score}</p>
        </div>
      </div>

      {/* Key planning metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="space-y-0.5">
          <p className="text-vo-muted uppercase tracking-wide text-[10px]">EV Demand</p>
          <p className="font-bold text-vo-text font-mono">{Math.round(site.demand_score)}/100</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-vo-muted uppercase tracking-wide text-[10px]">Grid Readiness</p>
          <p className="font-bold text-vo-text">{gridReadiness}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-vo-muted uppercase tracking-wide text-[10px]">Rec. Chargers</p>
          <p className="font-bold text-[#4F6F9F] dark:text-[#6F8FB8] font-mono">{recommendedChargers} Units</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-vo-muted uppercase tracking-wide text-[10px]">Accessibility</p>
          <p className="font-bold text-vo-text font-mono">{Math.round(site.accessibility_score)}/100</p>
        </div>
      </div>

      {/* Grid connection details */}
      <div className="border-t border-vo-line/50 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-vo-muted">
        <span>Feeder: <span className="text-vo-text font-medium">{insights.feederName}</span></span>
        <span>Transformer: <span className="text-vo-text font-medium">{insights.transformerKva.toLocaleString("en-IN")} kVA</span></span>
        <span>Headroom: <span className="text-vo-text font-medium">{insights.headroomKva} kVA</span></span>
        <span>Peak load: <span className="text-vo-text font-medium">{insights.peakLoadPct}%</span></span>
        <span>Connection lead: <span className="text-vo-text font-medium">{insights.connectionLead}</span></span>
        <span>Coordinates: <span className="text-vo-text font-medium">{site.latitude.toFixed(4)}°N, {site.longitude.toFixed(4)}°E</span></span>
      </div>

      {/* Explanation */}
      {site.explanation ? (
        <p className="text-xs text-vo-muted border-t border-vo-line/50 pt-2 italic">{site.explanation}</p>
      ) : null}
    </div>
  );
}
