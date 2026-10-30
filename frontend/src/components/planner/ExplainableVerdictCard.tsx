import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import type { Provenance, Recommendation, ScoredFactor } from "../../types";

// Structural subset shared by Site and ClassifiedSite -- this card only
// ever needs the verdict + sub-scores, never id/name/coordinates, so it
// works unmodified for both a seeded site and an arbitrary classified point.
export interface VerdictSource {
  recommendation: Recommendation;
  demand_score: number;
  grid_capacity_score: number;
  accessibility_score: number;
  charger_gap_score: number;
  factors?: ScoredFactor[];
  explanation?: string;
}

interface ExplainableVerdictCardProps {
  site: VerdictSource;
}

const PROVENANCE_LABEL: Record<Provenance, string> = {
  REAL: "REAL",
  DERIVED: "DERIVED",
  ESTIMATED: "EST.",
  DEMO: "DEMO",
};

const PROVENANCE_COLOR: Record<Provenance, string> = {
  REAL: "#00e8a2",
  DERIVED: "#38bdf8",
  ESTIMATED: "#f0b429",
  DEMO: "#7c8794",
};

function factorFor(factors: ScoredFactor[] | undefined, key: string): ScoredFactor | undefined {
  return factors?.find((f) => f.key === key);
}

function ProvenanceTag({ factor }: { factor: ScoredFactor | undefined }) {
  if (!factor) {
    return null;
  }
  return (
    <span
      className="mt-1 inline-block text-[9px] font-mono font-bold uppercase tracking-wider"
      style={{ color: PROVENANCE_COLOR[factor.provenance] }}
      title={factor.detail}
    >
      {PROVENANCE_LABEL[factor.provenance]}
    </span>
  );
}

export function ExplainableVerdictCard({ site }: ExplainableVerdictCardProps) {
  const { recommendation, demand_score, grid_capacity_score, accessibility_score, charger_gap_score, factors, explanation } = site;
  const demandFactor = factorFor(factors, "demand");
  const gridFactor = factorFor(factors, "grid");
  const landFactor = factorFor(factors, "land");
  const coverageFactor = factorFor(factors, "coverage_gap");

  const verdictMeta: Record<
    Recommendation,
    {
      label: string;
      bgClass: string;
      borderClass: string;
      textClass: string;
      icon: typeof CheckCircle2;
      summary: string;
      recommendations: string[];
    }
  > = {
    BUILD: {
      label: "Unconditional Recommendation: BUILD",
      bgClass: "bg-vo-good-bg",
      borderClass: "border-vo-good-border",
      textClass: "text-vo-good-ink",
      icon: CheckCircle2,
      summary: "Strong charging demand paired with ample local electrical grid headroom.",
      recommendations: [
        "Sufficient transformer capacity for immediate high-power fast charging deployment.",
        "High road accessibility and existing charger gap make this location high ROI.",
      ],
    },
    BUILD_IF_MANAGED: {
      label: "Conditional Verdict: BUILD IF MANAGED",
      bgClass: "bg-vo-warn-bg",
      borderClass: "border-vo-warn-border",
      textClass: "text-vo-warn-ink",
      icon: AlertTriangle,
      summary: "High projected EV demand, but local electrical feeder headroom is constrained.",
      recommendations: [
        "Site is viable without immediate grid upgrade costs if dynamic off-peak scheduling is deployed.",
        "Driver off-peak incentives can distribute peak load away from 18:00–22:00 peak feeder stress hours.",
        "Recommend installing smart load controllers or staging charger capacity rollout.",
      ],
    },
    DONT_BUILD: {
      label: "Recommendation: DO NOT BUILD",
      bgClass: "bg-vo-bad-bg",
      borderClass: "border-vo-bad-border",
      textClass: "text-vo-bad-ink",
      icon: XCircle,
      summary: "Insufficient demand projection or high grid risk score makes this site non-viable.",
      recommendations: [
        "EV charging demand does not justify capital expenditure.",
        "Local distribution feeder lacks sufficient transformer headroom.",
      ],
    },
  };

  const meta = verdictMeta[recommendation] ?? verdictMeta.DONT_BUILD;
  const IconComponent = meta.icon;
  // The real explanation always leads with the one sentence that states
  // which condition decided the verdict (see _VERDICT_LEAD in
  // backend/app/engines/site_scoring.py) -- prefer that over the generic
  // static copy whenever it's available.
  const leadSentence = explanation?.split(". ")[0]?.trim();
  const summaryLine = leadSentence ? `${leadSentence}${leadSentence.endsWith(".") ? "" : "."}` : meta.summary;

  return (
    <div className={`rounded-2xl border ${meta.borderClass} ${meta.bgClass} p-5 space-y-4`}>
      <div className="flex items-center space-x-3">
        <IconComponent className={`w-6 h-6 ${meta.textClass} shrink-0`} />
        <div>
          <span className={`text-xs font-mono font-bold uppercase tracking-wider ${meta.textClass}`}>
            {meta.label}
          </span>
          <p className="text-sm font-semibold text-vo-text mt-0.5">{summaryLine}</p>
        </div>
      </div>

      <div className="border-t border-vo-line/40 pt-3 space-y-2 text-xs text-vo-muted">
        <div className="flex items-center space-x-1.5 font-semibold text-vo-soft">
          <Info className="w-3.5 h-3.5 text-vo-info-ink" />
          <span>Decision Analysis Breakdown:</span>
        </div>
        {explanation ? (
          <p className="leading-relaxed text-vo-soft">{explanation}</p>
        ) : (
          <ul className="space-y-1.5 pl-5 list-disc text-vo-soft">
            {meta.recommendations.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-vo-line/40 text-center text-xs">
        <div className="rounded-lg bg-vo-card/60 p-2">
          <div className="text-[10px] text-vo-muted uppercase">Demand</div>
          <div className="font-bold text-vo-text font-mono">{demand_score}</div>
          <ProvenanceTag factor={demandFactor} />
        </div>
        <div className="rounded-lg bg-vo-card/60 p-2">
          <div className="text-[10px] text-vo-muted uppercase">Grid Headroom</div>
          <div className="font-bold text-vo-text font-mono">{grid_capacity_score}</div>
          <ProvenanceTag factor={gridFactor} />
        </div>
        <div className="rounded-lg bg-vo-card/60 p-2">
          <div className="text-[10px] text-vo-muted uppercase">Accessibility</div>
          <div className="font-bold text-vo-text font-mono">{accessibility_score}</div>
          <ProvenanceTag factor={landFactor} />
        </div>
        <div className="rounded-lg bg-vo-card/60 p-2">
          <div className="text-[10px] text-vo-muted uppercase">Charger Gap</div>
          <div className="font-bold text-vo-text font-mono">{charger_gap_score}</div>
          <ProvenanceTag factor={coverageFactor} />
        </div>
      </div>
    </div>
  );
}
