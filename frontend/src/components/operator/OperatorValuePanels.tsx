import type { OperatorInsight } from "../../types";

const BENEFITS = [
  { title: "Customer acquisition", body: "Reach EV drivers searching for charging on VidyutOne." },
  { title: "Booking management", body: "Receive and manage charging bookings on your own stations." },
  { title: "Station analytics", body: "Understand utilization, demand and peak periods from counted bookings." },
  { title: "Demand intelligence", body: "Identify when charging demand is increasing — rule-based, not ML." },
  { title: "Expansion insights", body: "Identify when an additional charger may be justified from occupancy thresholds." },
  { title: "Pricing intelligence", body: "Understand peak/off-peak charging behavior. Tariffs are not changed automatically." },
  { title: "Network visibility", body: "See how your chargers perform from occupancy, bookings and revenue on your stations only." },
];

export function OperatorValuePanels({
  demo,
  insights,
  stationInsights,
}: {
  demo: boolean;
  insights: OperatorInsight[];
  stationInsights: OperatorInsight[];
}) {
  return (
    <>
      <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold">What VidyutOne provides</h2>
          <p className="text-xs text-vo-muted">Product capabilities for private operators — not a forecast.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((item) => (
            <div key={item.title} className="rounded-xl border border-vo-line bg-vo-bg p-4">
              <p className="text-sm font-bold">{item.title}</p>
              <p className="mt-1 text-xs text-vo-muted leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-3">
        <div>
          <h2 className="text-base font-bold">Operator intelligence</h2>
          <p className="text-xs text-vo-muted">
            Rule-based insights from occupancy and counted bookings. {demo ? "DEMO catalog." : "Your chargers only."} No driver names, phones, or emails.
          </p>
        </div>
        {insights.length === 0 ? (
          <p className="text-sm text-vo-muted">Insights appear after stations or counted bookings exist.</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div key={`${insight.kind}-${insight.title}`} className="rounded-xl border border-vo-line bg-vo-bg p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{insight.provenance}</p>
                <p className="mt-1 text-sm font-bold">{insight.title}</p>
                <p className="mt-1 text-sm text-vo-muted">{insight.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {stationInsights.length > 0 ? (
        <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-3">
          <div>
            <h2 className="text-base font-bold">Station recommendations</h2>
            <p className="text-xs text-vo-muted">Explicit thresholds: high utilization ≥ 70%, low utilization &lt; 20%.</p>
          </div>
          <div className="space-y-3">
            {stationInsights.map((insight) => (
              <div key={`${insight.charger_id ?? insight.kind}-${insight.title}`} className="rounded-xl border border-vo-line bg-vo-bg p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{insight.provenance}</p>
                <p className="mt-1 text-sm font-bold">{insight.title}</p>
                <p className="mt-1 text-sm text-vo-muted">{insight.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-2">
        <h2 className="text-base font-bold">How VidyutOne connects the ecosystem</h2>
        <p className="text-sm text-vo-muted leading-relaxed">
          Drivers search, book and charge → VidyutOne aggregates demand (no personal trip history on this dashboard) →
          operators see utilization, bookings and station insights → planners see capacity-gap intelligence for
          infrastructure expansion.
        </p>
        <p className="text-xs text-vo-muted">
          Your chargers can be discovered by EV drivers, appear in recommendations, and accept bookings. Demand
          intelligence helps you decide when to add capacity.
        </p>
      </div>
    </>
  );
}
