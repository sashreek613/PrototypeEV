import { Clock, Timer, Trophy, Zap } from "lucide-react";

import type { DriverIntelligence, DriverPreference, OptimizerOption, RecommendedChargerInfo } from "../../types";
import { congestionBadgeClass } from "../../utils/congestion";
import { formatInr, formatKm } from "../../utils/format";
import { useT } from "../../i18n";

interface NetworkIntelligencePanelProps {
  intelligence: DriverIntelligence | null;
  loading: boolean;
  error: string | null;
  preference: DriverPreference;
  onPreferenceChange: (value: DriverPreference) => void;
  onSelectCharger: (chargerId: string) => void;
}

const PREFERENCES: DriverPreference[] = ["balanced", "minimize_time", "minimize_cost"];

function optimizerLabel(kind: string, t: (key: string) => string): string {
  if (kind === "fastest") return t("intel.optimizer.fastest");
  if (kind === "cheapest") return t("intel.optimizer.cheapest");
  return t("intel.optimizer.best_overall");
}

function congestionLabel(level: string, t: (key: string) => string): string {
  if (level === "HIGH") return t("intel.congestion.high");
  if (level === "MODERATE") return t("intel.congestion.moderate");
  return t("intel.congestion.low");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-vo-muted">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-driver-ink">{value}</p>
    </div>
  );
}

function OptionCard({
  option,
  onSelect,
  t,
}: {
  option: OptimizerOption;
  onSelect: (id: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const charger = option.charger;
  return (
    <button
      type="button"
      onClick={() => onSelect(charger.charger_id)}
      className="rounded-[14px] border border-driver-line bg-driver-bg px-3 py-3 text-left"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-vo-accent-ink">{optimizerLabel(option.kind, t)}</p>
      <p className="mt-1 truncate text-[13px] font-semibold text-driver-ink">{charger.name.replace(" (demo)", "")}</p>
      <p className="mt-1 text-[11px] text-driver-muted">
        {charger.power_kw != null ? `${charger.power_kw} kW` : t("common.power_fallback")}
        {" · "}
        {formatKm(charger.km)}
        {" · "}
        {Math.round(charger.estimated_travel_minutes + charger.estimated_wait_minutes + charger.estimated_charge_minutes)} min
        {" · "}
        {formatInr(charger.estimated_cost)}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-driver-muted">
        {option.reason ||
          (option.kind === "fastest"
            ? t("intel.optimizer.reason.fastest")
            : option.kind === "cheapest"
              ? t("intel.optimizer.reason.cheapest")
              : t("intel.optimizer.reason.best_overall"))}
      </p>
      {charger.provenance === "DEMO" ? (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("intel.optimizer.demo_label")}</p>
      ) : null}
    </button>
  );
}

function RecommendedBlock({
  charger,
  onSelect,
  t,
}: {
  charger: RecommendedChargerInfo;
  onSelect: (id: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(charger.charger_id)}
      className="w-full rounded-[16px] border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Trophy size={14} className="text-[#3d7a5a]" />
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#3d7a5a]">{t("intel.recommended_title")}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${congestionBadgeClass(charger.congestion.level)}`}>
          {congestionLabel(charger.congestion.level, t)}
        </span>
      </div>
      <p className="mt-2 text-[15px] font-semibold text-driver-ink">{charger.name.replace(" (demo)", "")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label={t("intel.stat.distance")} value={formatKm(charger.km)} />
        <Stat label={t("intel.stat.wait")} value={`${Math.round(charger.estimated_wait_minutes)} min`} />
        <Stat label={t("intel.stat.charge")} value={`${Math.round(charger.estimated_charge_minutes)} min`} />
        <Stat label={t("intel.stat.cost")} value={formatInr(charger.estimated_cost)} />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-driver-muted">
        <span className="font-semibold text-driver-ink">{t("intel.why_label")} </span>
        {charger.why}
      </p>
    </button>
  );
}

export function NetworkIntelligencePanel({
  intelligence,
  loading,
  error,
  preference,
  onPreferenceChange,
  onSelectCharger,
}: NetworkIntelligencePanelProps) {
  const t = useT();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-driver-ink">{t("intel.heading")}</h3>
        <span className="text-[10px] uppercase tracking-wider text-vo-muted">{t("intel.derived_badge")}</span>
      </div>

      <div className="flex rounded-[10px] border border-driver-line bg-driver-card p-1">
        {PREFERENCES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPreferenceChange(value)}
            className={`flex-1 rounded-[8px] px-2 py-1.5 text-[10px] font-semibold ${
              preference === value ? "bg-[#2e5b44] text-white" : "text-driver-muted"
            }`}
          >
            {t(`intel.preference.${value}`)}
          </button>
        ))}
      </div>

      {loading && !intelligence ? (
        <div className="rounded-[16px] border border-driver-line bg-driver-card px-4 py-5 text-center text-[12px] text-vo-muted">
          {t("intel.loading")}
        </div>
      ) : null}

      {error && !intelligence ? (
        <div className="rounded-[16px] border border-vo-bad-border bg-vo-bad-bg px-4 py-3 text-[12px] text-vo-bad-ink">
          {error}
        </div>
      ) : null}

      {intelligence && !intelligence.recommended ? (
        <div className="rounded-[16px] border border-driver-line bg-driver-card px-4 py-5 text-center text-[12px] text-vo-muted">
          {t("intel.empty")}
        </div>
      ) : null}

      {intelligence?.recommended ? (
        <RecommendedBlock charger={intelligence.recommended} onSelect={onSelectCharger} t={t} />
      ) : null}

      {intelligence?.alternative ? (
        <div className="rounded-[16px] border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2">
          <p className="text-[12px] font-semibold text-vo-warn-ink">{t("intel.alt.warning")}</p>
          <p className="text-[12px] leading-relaxed text-driver-muted">{intelligence.alternative.explanation}</p>
          <button
            type="button"
            onClick={() => onSelectCharger(intelligence.alternative!.recommended.charger_id)}
            className="w-full rounded-[10px] border border-driver-line bg-driver-card px-3 py-2 text-left"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-vo-accent-ink">{t("intel.alt.recommended")}</p>
            <p className="mt-1 text-[13px] font-semibold text-driver-ink">
              {intelligence.alternative.recommended.name.replace(" (demo)", "")}
            </p>
            <p className="mt-1 text-[11px] text-driver-muted">
              {intelligence.alternative.extra_km >= 0 ? "+" : ""}
              {formatKm(intelligence.alternative.extra_km)}
              {" · "}
              −{Math.round(intelligence.alternative.wait_saved_minutes)} min
              {" · "}
              −{formatInr(Math.max(0, intelligence.alternative.cost_saved))}
            </p>
          </button>
        </div>
      ) : null}

      {intelligence && intelligence.optimizer.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-vo-muted">{t("intel.compare_heading")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {intelligence.optimizer.map((option) => (
              <OptionCard key={`${option.kind}-${option.charger.charger_id}`} option={option} onSelect={onSelectCharger} t={t} />
            ))}
          </div>
        </div>
      ) : null}

      {intelligence?.smart_time ? (
        <div className="rounded-[16px] border border-driver-line bg-driver-card p-3.5">
          <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-vo-accent-ink">
            <Clock size={13} />
            {t("intel.smart_time.title")}
          </div>
          <p className="mt-2 text-[18px] font-bold text-driver-ink">{intelligence.smart_time.label}</p>
          <p className="mt-1 text-[12px] text-driver-muted">
            {intelligence.smart_time.expected_demand === "LOW"
              ? t("intel.smart_time.lower_demand")
              : t("intel.smart_time.demand", { level: congestionLabel(intelligence.smart_time.expected_demand, t) })}
          </p>
          {intelligence.smart_time.savings > 0 ? (
            <p className="mt-1 text-[12px] font-semibold text-[#3d7a5a]">
              {t("intel.smart_time.saving", { amount: formatInr(intelligence.smart_time.savings) })}
            </p>
          ) : null}
          <p className="mt-2 text-[11px] text-vo-muted">{intelligence.smart_time.detail}</p>
        </div>
      ) : null}

      {intelligence ? (
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-vo-muted">
          <Zap size={11} className="mt-0.5 shrink-0" />
          {intelligence.provenance_note}
        </p>
      ) : null}

      {loading && intelligence ? (
        <p className="flex items-center gap-1.5 text-[11px] text-vo-muted">
          <Timer size={11} />
          {t("intel.updating")}
        </p>
      ) : null}

      {error && intelligence ? (
        <p className="text-[11px] text-vo-warn-ink">{error}</p>
      ) : null}
    </div>
  );
}
