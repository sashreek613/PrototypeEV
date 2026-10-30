import { X } from "lucide-react";
import { Link } from "react-router-dom";

import type { ClassifiedSite } from "../../types";
import type { ClassifyStatus } from "../../hooks/useApiData";
import { ExplainableVerdictCard } from "./ExplainableVerdictCard";

interface LocationVerdictPanelProps {
  status: ClassifyStatus;
  result: ClassifiedSite | null;
  errorMessage: string | null;
  legend: { build: number; managed: number; dont: number };
  onClear: () => void;
  siteId?: string | null;
}

/** The right-hand column on the map-first Overview. Four states -- see the
 * per-state components below; RESULT never blanks while a new search is
 * LOADING (the panel dims the previous result instead). */
export function LocationVerdictPanel({ status, result, errorMessage, legend, onClear, siteId = null }: LocationVerdictPanelProps) {
  const showClear = status !== "empty";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-vo-line bg-vo-card">
      <div className="flex shrink-0 items-center justify-between border-b border-vo-line px-4 py-3">
        <h3 className="text-sm font-bold text-vo-text">Location Assessment</h3>
        {showClear ? (
          <button type="button" onClick={onClear} aria-label="Clear assessment" className="text-vo-muted hover:text-vo-text">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {status === "empty" ? <EmptyState legend={legend} /> : null}
        {status === "error" ? <ErrorState message={errorMessage} /> : null}
        {result ? <ResultState result={result} dimmed={status === "loading"} siteId={siteId} /> : null}
        {status === "loading" && !result ? <LoadingSkeleton /> : null}
      </div>
    </div>
  );
}

function EmptyState({ legend }: { legend: LocationVerdictPanelProps["legend"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
      <p className="max-w-[220px] text-sm text-vo-muted">
        Search a location or click anywhere on the map to assess it.
      </p>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-vo-muted">
          <span className="font-semibold text-vo-good-ink">{legend.build}</span> Build
        </span>
        <span className="text-vo-muted">
          <span className="font-semibold text-vo-warn-ink">{legend.managed}</span> Managed
        </span>
        <span className="text-vo-muted">
          <span className="font-semibold text-vo-bad-ink">{legend.dont}</span> Unsuitable
        </span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3" role="status" aria-label="Loading assessment">
      <div className="h-5 w-2/3 rounded bg-white/10" />
      <div className="h-3.5 w-1/2 rounded bg-white/10" />
      <div className="h-24 rounded-xl bg-white/5" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-sm font-semibold text-vo-red">Couldn&apos;t assess this location</p>
      <p className="max-w-[240px] text-xs text-vo-muted">{message ?? "Something went wrong. Try a different location."}</p>
    </div>
  );
}

// The backend names an unresolved point "12.9352, 77.6245" (see
// _classify_point in site_service.py) -- for a map click that's not a
// place name, just the raw coordinates repeated as a title. Show the
// nearest known place instead, with the raw coordinates still on the line
// below either way.
const RAW_COORD_NAME = /^-?\d+\.\d+, -?\d+\.\d+$/;

function displayTitle(result: ClassifiedSite): string {
  if (!RAW_COORD_NAME.test(result.name)) {
    return result.name; // resolved via search -- already a real place name
  }
  if (result.nearest_candidate && result.nearest_candidate.distance_km <= 1) {
    return `Near ${result.nearest_candidate.name.replace(" (demo)", "")}`;
  }
  return "Custom location";
}

function ResultState({ result, dimmed, siteId }: { result: ClassifiedSite; dimmed: boolean; siteId: string | null }) {
  return (
    <div className={dimmed ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-base font-bold text-vo-text">{displayTitle(result)}</h4>
          <p className="font-mono text-[11px] text-vo-muted">
            {result.latitude.toFixed(4)}° N, {result.longitude.toFixed(4)}° E
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs font-bold text-vo-accent">{result.site_score.toFixed(1)}/100</span>
      </div>

      <ExplainableVerdictCard site={result} />

      {siteId ? (
        <div className="mt-3 rounded-xl border border-vo-line bg-vo-bg/40 px-3 py-2.5 text-xs">
          <Link to={`/planner/site/${siteId}`} className="inline-block font-medium text-vo-accent-ink hover:underline">
            View site details →
          </Link>
        </div>
      ) : result.nearest_candidate ? (
        <div className="mt-3 rounded-xl border border-vo-line bg-vo-bg/40 px-3 py-2.5 text-xs">
          <p className="mb-1 text-vo-muted">Nearest ranked candidate</p>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-vo-text">{result.nearest_candidate.name.replace(" (demo)", "")}</span>
            <span className="shrink-0 text-vo-muted">{result.nearest_candidate.distance_km.toFixed(1)} km</span>
          </div>
          <Link to={`/planner/site/${result.nearest_candidate.id}`} className="mt-1 inline-block text-vo-accent-ink hover:underline">
            View site details →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
