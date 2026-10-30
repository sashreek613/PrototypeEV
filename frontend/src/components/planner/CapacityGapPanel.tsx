import { AlertTriangle, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

import type { CapacityGap } from "../../types";
import { congestionBadgeClass } from "../../utils/congestion";

function bandClass(level: string): string {
  return congestionBadgeClass(level === "MEDIUM" ? "MODERATE" : level);
}

function recommendationLabel(value: string | null): string {
  if (value === "BUILD") return "BUILD";
  if (value === "BUILD_IF_MANAGED") return "BUILD IF MANAGED";
  if (value === "DONT_BUILD") return "DON'T BUILD";
  return value ?? "Assess site";
}

export function CapacityGapPanel({
  gaps,
  loading,
  error,
}: {
  gaps: CapacityGap[] | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-vo-text">Charging Capacity Intelligence</h3>
          <p className="text-xs text-vo-muted mt-0.5">
            Aggregated driver demand vs existing chargers. No individual identities.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-vo-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-vo-muted">
          Derived
        </span>
      </div>

      {loading && !gaps ? (
        <p className="text-sm text-vo-muted">Loading capacity-gap alerts…</p>
      ) : null}
      {error && !gaps ? (
        <p className="rounded-xl border border-vo-bad-border bg-vo-bad-bg px-3 py-2 text-sm text-vo-bad-ink">{error}</p>
      ) : null}
      {gaps && gaps.length === 0 ? (
        <p className="rounded-xl border border-vo-good-border bg-vo-good-bg px-3 py-2 text-sm text-vo-good-ink">
          No high-priority capacity gaps from current booking volume.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {(gaps ?? []).map((gap) => (
          <article key={gap.cell_id} className="rounded-xl border border-vo-warn-border bg-vo-warn-bg/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-vo-warn-ink" />
                <h4 className="text-sm font-bold text-vo-text">Charging Capacity Gap</h4>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${bandClass(gap.expected_congestion)}`}>
                {gap.expected_congestion} congestion
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-vo-text">
              <MapPin className="w-3.5 h-3.5 text-vo-muted" />
              {gap.area_label}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-vo-muted">Demand</dt>
                <dd className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 font-semibold ${bandClass(gap.demand)}`}>{gap.demand}</dd>
              </div>
              <div>
                <dt className="text-vo-muted">Existing capacity</dt>
                <dd className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 font-semibold ${bandClass(gap.capacity === "LOW" ? "HIGH" : gap.capacity === "HIGH" ? "LOW" : "MODERATE")}`}>
                  {gap.capacity}
                </dd>
              </div>
              <div>
                <dt className="text-vo-muted">Peak utilization</dt>
                <dd className="mt-0.5 font-mono font-semibold text-vo-text">{gap.peak_utilization}%</dd>
              </div>
              <div>
                <dt className="text-vo-muted">Chargers / 24h bookings</dt>
                <dd className="mt-0.5 font-mono text-vo-text">
                  {gap.charger_count} / {gap.bookings_24h}
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-vo-muted">{gap.detail}</p>
            <div className="rounded-lg border border-vo-line bg-vo-card px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">Recommendation</p>
              <p className="mt-1 text-sm font-semibold text-vo-text">{gap.action}</p>
              {gap.nearest_site_id ? (
                <Link
                  to={`/planner/site/${gap.nearest_site_id}`}
                  className="mt-2 inline-flex text-xs font-semibold text-[#4F6F9F] dark:text-[#6F8FB8] hover:underline"
                >
                  Existing site score: {gap.nearest_site_name} · {recommendationLabel(gap.site_recommendation)}
                </Link>
              ) : (
                <p className="mt-2 text-xs text-vo-muted">No scored candidate site nearby yet — add one in Site Explorer.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
