import { ArrowDownCircle, Clock } from "lucide-react";

import type { PricingTier } from "../../types";
import { formatInr } from "../../utils/format";
import { sessionTotal } from "../../utils/chargingEnergy";
import { useT } from "../../i18n";

interface DynamicPriceCardProps {
  pricing: PricingTier;
  energyKwh?: number | null;
  total?: number | null;
  tone?: "light" | "dark";
}

export function DynamicPriceCard({ pricing, energyKwh, total, tone = "dark" }: DynamicPriceCardProps) {
  const t = useT();
  const dark = tone === "dark";
  const displayTotal = total ?? (energyKwh != null ? sessionTotal(energyKwh, pricing.price) : null);
  const windowLabel = pricing.is_off_peak
    ? t("dynamic_price.window.off_peak")
    : pricing.is_peak
      ? t("dynamic_price.window.peak")
      : t("dynamic_price.window.standard");

  const shell = pricing.is_off_peak
    ? dark
      ? "border-emerald-500/30 bg-emerald-500/10"
      : "border-emerald-200 bg-driver-mint"
    : pricing.is_peak
      ? dark
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-amber-200 bg-[#fff6e8]"
      : dark
        ? "border-vo-line bg-vo-card/80"
        : "border-driver-line bg-[#f6f7f4]";

  return (
    <div className={`rounded-xl border p-4 space-y-2.5 ${shell}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock
            className={`h-4 w-4 ${
              pricing.is_off_peak ? "text-emerald-500" : pricing.is_peak ? "text-amber-500" : dark ? "text-vo-muted" : "text-driver-muted"
            }`}
          />
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${dark ? "text-white" : "text-driver-ink"}`}
          >
            {windowLabel}
          </span>
        </div>
        {pricing.is_off_peak ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-black">
            <ArrowDownCircle className="h-3 w-3" />
            {t("dynamic_price.save_amount", { amount: formatInr(pricing.savings_amount) })}
          </span>
        ) : null}
      </div>
      <p className={`text-[12px] ${dark ? "text-vo-muted" : "text-driver-muted"}`}>{pricing.description}</p>
      <div className="flex items-end justify-between">
        <div>
          <p className={`text-[11px] ${dark ? "text-vo-muted" : "text-driver-muted"}`}>{t("dynamic_price.price_per_kwh")}</p>
          <p className={`text-[20px] font-semibold font-mono ${dark ? "text-white" : "text-driver-ink"}`}>
            {formatInr(pricing.price)}
          </p>
        </div>
        {displayTotal != null ? (
          <div className="text-right">
            <p className={`text-[11px] ${dark ? "text-vo-muted" : "text-driver-muted"}`}>{t("dynamic_price.estimated_total")}</p>
            <p className={`text-[20px] font-semibold font-mono ${dark ? "text-white" : "text-driver-ink"}`}>
              {formatInr(displayTotal)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
