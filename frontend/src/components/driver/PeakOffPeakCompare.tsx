import { formatInr } from "../../utils/format";
import { useT } from "../../i18n";

interface PeakOffPeakCompareProps {
  peakTariff: number;
  offPeakTariff: number;
  peakTotal: number | null;
  offPeakTotal: number | null;
  savingsTotal: number | null;
  savingsPct: number | null;
  cheaper: "peak" | "off-peak" | "same";
  tone?: "light" | "dark";
}

export function PeakOffPeakCompare({
  peakTariff,
  offPeakTariff,
  peakTotal,
  offPeakTotal,
  savingsTotal,
  savingsPct,
  cheaper,
  tone = "light",
}: PeakOffPeakCompareProps) {
  const t = useT();
  const dark = tone === "dark";
  const card = dark
    ? "rounded-2xl border border-vo-line bg-vo-card/80 p-4"
    : "rounded-[18px] border border-driver-line bg-white p-4";
  const muted = dark ? "text-vo-muted" : "text-driver-muted";
  const ink = dark ? "text-white" : "text-driver-ink";
  const peakLabel = t("common.peak");
  const offPeakLabel = t("common.off_peak");
  const recommended = cheaper === "off-peak" ? offPeakLabel : cheaper === "peak" ? peakLabel : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={`${card} ${cheaper === "peak" ? "ring-1 ring-vo-accent/40" : ""}`}>
          <p className={`text-[10px] font-semibold tracking-[0.16em] uppercase ${muted}`}>{peakLabel}</p>
          <p className={`mt-2 text-[18px] font-semibold ${ink}`}>{formatInr(peakTariff)}/kWh</p>
          <p className={`mt-1 text-[12px] ${muted}`}>
            {peakTotal == null ? t("peak_compare.no_vehicle") : formatInr(peakTotal)}
          </p>
        </div>
        <div className={`${card} ${cheaper === "off-peak" ? "ring-1 ring-vo-accent/40" : ""}`}>
          <p className={`text-[10px] font-semibold tracking-[0.16em] uppercase ${muted}`}>{offPeakLabel}</p>
          <p className={`mt-2 text-[18px] font-semibold ${ink}`}>{formatInr(offPeakTariff)}/kWh</p>
          <p className={`mt-1 text-[12px] ${muted}`}>
            {offPeakTotal == null ? t("peak_compare.no_vehicle") : formatInr(offPeakTotal)}
          </p>
        </div>
      </div>
      {savingsTotal != null && savingsTotal > 0 && savingsPct != null && recommended ? (
        <div className={dark ? "rounded-2xl bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300" : "rounded-[18px] bg-driver-mint px-4 py-3 text-[13px] text-[#0b7a52]"}>
          <p className="font-semibold">{t("peak_compare.recommended", { window: recommended })}</p>
          <p className="mt-0.5">
            {t("peak_compare.savings_line", {
              amount: formatInr(savingsTotal),
              pct: savingsPct,
              other: cheaper === "off-peak" ? peakLabel : offPeakLabel,
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
