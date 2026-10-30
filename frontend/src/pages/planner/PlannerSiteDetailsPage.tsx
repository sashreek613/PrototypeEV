import { ArrowLeft, BookmarkPlus, Check } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";

import { ScreenState } from "../../components/common/ScreenState";
import { ChartCard } from "../../components/planner/ChartCard";
import { ExplainableVerdictCard } from "../../components/planner/ExplainableVerdictCard";
import { SiteMap } from "../../components/planner/SiteMap";
import { TopBar } from "../../components/planner/TopBar";
import { useConsiderationContext } from "../../context/ConsiderationContext";
import { useChargers, useSite } from "../../hooks/useApiData";
import { formatCoord, formatKm } from "../../utils/format";
import { RECOMMENDATION_COLOR, RECOMMENDATION_COPY, RECOMMENDATION_LABEL } from "../../utils/recommendations";
import { insightsForSite, managedLoadSeries, nearbyChargers } from "../../utils/siteInsights";


export function PlannerSiteDetailsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { data: site, error, loading } = useSite(siteId);
  const chargers = useChargers();

  return (
    <div className="min-h-screen">
      <TopBar title="Site Intelligence" />
      <ScreenState loading={loading} error={error}>
        {site ? <SiteIntelligence site={site} chargers={chargers.data ?? []} chargersError={chargers.error} /> : null}
      </ScreenState>
    </div>
  );
}

function SiteIntelligence({
  site,
  chargers,
  chargersError,
}: {
  site: import("../../types").Site;
  chargers: import("../../types").Charger[];
  chargersError: string | null;
}) {
  const insights = insightsForSite(site);
  const nearby = nearbyChargers(site, chargers);
  const series = managedLoadSeries(site.grid_capacity_score);
  const color = RECOMMENDATION_COLOR[site.recommendation];
  const consideration = useConsiderationContext();
  const inConsideration = consideration.isInConsideration(site.id);

  return (
    <div className="space-y-5 px-6 py-5">
      <Link to="/planner/explorer" className="inline-flex items-center gap-2 text-[12px] font-medium text-vo-muted hover:text-vo-text transition-colors">
        <ArrowLeft size={14} />
        Back to candidate sites
      </Link>


      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[32px] font-semibold tracking-tight text-vo-text">{site.name.replace(" (demo)", "")}</h2>
          <p className="mt-1 text-[13px] text-vo-muted">
            {site.id} · {formatCoord(site.latitude, "N")}, {formatCoord(site.longitude, "E")}
          </p>
          <p className="text-[13px] text-vo-muted">Bengaluru Urban · BESCOM demo division</p>
        </div>
        <div className="flex flex-col gap-3 items-end">
          <aside className="max-w-[360px] rounded-2xl border px-5 py-4" style={{ borderColor: color, background: `${color}14` }}>
            <p className="text-[22px] font-semibold" style={{ color }}>
              ● {RECOMMENDATION_LABEL[site.recommendation]}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-vo-soft">{RECOMMENDATION_COPY[site.recommendation]}</p>
          </aside>
          <button
            type="button"
            onClick={() => void consideration.add(site.id)}
            disabled={inConsideration}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              inConsideration
                ? "border-[#4F6F9F]/30 bg-[#EEF2F7] dark:bg-[#4F6F9F]/10 text-[#4F6F9F] dark:text-[#6F8FB8] cursor-default"
                : "border-vo-line bg-vo-elevated hover:border-[#4F6F9F]/40 hover:text-[#4F6F9F] dark:hover:text-[#6F8FB8] text-vo-soft"
            }`}
          >
            {inConsideration ? (
              <><Check className="w-3.5 h-3.5" /><span>In consideration</span></>
            ) : (
              <><BookmarkPlus className="w-3.5 h-3.5" /><span>Add to consideration</span></>
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr_0.95fr]">

        <div className="space-y-4">
          <ExplainableVerdictCard site={site} />
          <ChartCard title="Site Headroom Breakdown">
            <ul className="space-y-2 text-[13px] leading-5 text-vo-soft">
              <li>Feeder spare capacity {insights.headroomKva} kVA at 19:00 peak.</li>
              <li>Nearest working charger in the demo set is {formatKm(insights.chargerGapKm)} on the gap score.</li>
              <li>Demand score {Math.round(site.demand_score)} / 100 with accessibility {Math.round(site.accessibility_score)}.</li>
            </ul>
          </ChartCard>
        </div>


        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ScoreCard label="Demand score" value={`${Math.round(site.demand_score)} / 100`} hint="Trips, dwell time, EV registrations" />
            <ScoreCard label="Accessibility" value={`${Math.round(site.accessibility_score)} / 100`} hint="Road class, turning, parking access" />
            <ScoreCard label="Charger gap" value={formatKm(insights.chargerGapKm)} hint="Derived from charger-gap score" />
          </div>
          <ChartCard title="Managed-charging effect on peak load" meta="SIMULATED FROM GRID SCORE">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <XAxis dataKey="hour" tick={{ fill: "#8b93a1", fontSize: 9 }} interval={3} axisLine={false} tickLine={false} />
                  <Bar dataKey="base" fill="#00e8a2" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="unmanaged" fill="#ef5b5b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <div className="h-[180px] overflow-hidden rounded-2xl border border-vo-border">
            <SiteMap
              interactive={false}
              zoom={13}
              center={[site.longitude, site.latitude]}
              points={[
                {
                  id: site.id,
                  name: site.name,
                  latitude: site.latitude,
                  longitude: site.longitude,
                  recommendation: site.recommendation,
                },
              ]}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <ScoreCard label="Grid headroom" value={`${insights.headroomKva} kVA`} hint={`${insights.peakLoadPct}% implied peak load`} />
            <ScoreCard label="Expected utilisation" value={`${insights.utilisationPct}%`} hint="Year 1 placeholder from demand score" />
            <ScoreCard label="Payback" value={`${insights.paybackYears} yrs`} hint="Financial placeholder · not a live model" />
          </div>
          <ChartCard title="Grid connection">
            <dl className="space-y-2 text-[13px]">
              <Row label="Feeder" value={insights.feederName} />
              <Row label="Transformer" value={`${insights.transformerKva.toLocaleString("en-IN")} kVA`} />
              <Row label="Peak load" value={`${insights.peakLoadPct}%`} />
              <Row label="Available headroom" value={`${insights.headroomKva} kVA`} />
              <Row label="Connection lead time" value={insights.connectionLead} />
            </dl>
          </ChartCard>
          <ChartCard title="Nearest existing chargers">
            {chargersError ? <p className="text-[12px] text-vo-red">{chargersError}</p> : null}
            {nearby.length === 0 ? (
              <p className="text-[12px] text-vo-muted">No nearby chargers in the demo set.</p>
            ) : (
              <ul className="space-y-3">
                {nearby.map((charger) => (
                  <li key={charger.id} className="flex items-start justify-between gap-3 text-[12px]">
                    <div>
                      <p className="text-[13px] text-vo-text">{charger.name.replace(" (demo)", "")}</p>
                      <p className="text-vo-muted">
                        {charger.connector_type} · {charger.power_kw !== null ? `${charger.power_kw} kW` : "power unknown"} · {charger.availability === null ? "status unknown" : charger.availability ? "live" : "offline"}
                      </p>
                    </div>
                    <span className={charger.availability ? "text-vo-soft" : "text-vo-red"}>{formatKm(charger.km)}</span>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-2xl border border-vo-border bg-vo-surface px-4 py-3">
      <p className="text-[11px] tracking-[0.14em] text-vo-muted">{label.toUpperCase()}</p>
      <p className="mt-1 text-[22px] font-semibold text-vo-text">{value}</p>
      <p className="mt-1 text-[11px] text-vo-muted">{hint}</p>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-vo-line py-1.5 last:border-0">
      <dt className="text-vo-muted">{label}</dt>
      <dd className="text-vo-text">{value}</dd>
    </div>
  );
}
