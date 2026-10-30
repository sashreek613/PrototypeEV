import { Calendar, Navigation } from "lucide-react";
import { Link } from "react-router-dom";

import type { Charger } from "../../types";
import { congestionBadgeClass } from "../../utils/congestion";
import { chargerStatusKind, chargerStatusTextClass, occupancyTone } from "../../utils/occupancy";
import { formatInr, formatKm } from "../../utils/format";
import { useT } from "../../i18n";

interface ChargerCardProps {
  charger: Charger;
  km: number;
  freeCount: number;
  totalCount: number;
  /** Position within the composite-sorted "Recommended for you" list (see
   * sortByRecommendation in DriverHomePage.tsx) -- display only, omit for
   * the full/unranked list. */
  rank?: number;
  /** Driver's current origin, used to build the "Navigate" Google Maps URL. */
  origin?: { latitude: number; longitude: number };
  selected?: boolean;
  onSelect?: (chargerId: string) => void;
  congestionLevel?: "LOW" | "MODERATE" | "HIGH";
  estimatedWaitMinutes?: number;
}

function availabilityCopy(charger: Charger, t: (key: string) => string): string {
  if (charger.provenance === "REAL") {
    if (charger.availability === null) return t("common.charger_status.unknown");
    return charger.availability ? t("common.charger_status.operational") : t("common.charger_status.reported_down");
  }
  if (charger.availability === null) return t("common.charger_status.unknown");
  return charger.availability ? t("common.charger_status.live") : t("common.charger_status.offline");
}

function statusCopy(charger: Charger, t: (key: string) => string): string {
  if (charger.occupancy === "OCCUPIED") return t("fast_track.state.occupied");
  if (charger.occupancy === "RESERVED") return t("fast_track.state.reserved");
  if (charger.occupancy === "UNAVAILABLE") return t("fast_track.state.unavailable");
  if (charger.occupancy === "AVAILABLE") return t("common.charger_status.available");
  const kind = chargerStatusKind(charger);
  if (kind === "available") {
    return charger.provenance === "REAL" ? t("common.charger_status.operational") : t("common.charger_status.available");
  }
  if (kind === "busy") return t("common.charger_status.busy");
  if (kind === "unavailable") {
    return charger.provenance === "REAL" ? t("common.charger_status.reported_down") : t("common.charger_status.offline");
  }
  return t("common.charger_status.ready");
}

export function ChargerCard({
  charger,
  km,
  freeCount,
  totalCount,
  rank,
  origin,
  selected = false,
  onSelect,
  congestionLevel,
  estimatedWaitMinutes,
}: ChargerCardProps) {
  const t = useT();
  const isReal = charger.provenance === "REAL";
  const tight = freeCount <= 1;
  const statusKind = chargerStatusKind(charger);

  function handleNavigate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const from = origin ? `${origin.latitude},${origin.longitude}&` : "";
    const url = `https://www.google.com/maps/dir/?api=1&${from ? `origin=${from}` : ""}destination=${charger.latitude},${charger.longitude}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      id={`charger-card-${charger.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(charger.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(charger.id);
        }
      }}
      className={`block rounded-[22px] border bg-driver-card px-4 py-4 shadow-[0_8px_24px_rgba(16,24,20,0.04)] ${
        selected ? "border-emerald-500 ring-2 ring-emerald-400/40" : "border-driver-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            {rank !== undefined ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-driver-ink text-[9px] font-bold text-driver-bg">
                {rank}
              </span>
            ) : null}
            <p className="text-[16px] font-semibold text-driver-ink">{charger.name.replace(" (demo)", "")}</p>
            {isReal ? (
              <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#4338ca]">
                OpenChargeMap
              </span>
            ) : charger.provenance === "DEMO" ? (
              <span className="rounded-full bg-[#f4f1ea] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#7a6240]">
                Demo
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[12px] text-driver-muted">
            {charger.connector_type}
            <> · {availabilityCopy(charger, t)}</>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] ${
              tight ? "bg-[#fff4d9] text-[#9e7d3b]" : "bg-[#edf6f0] text-[#3d7a5a]"
            }`}
          >
            {isReal
              ? charger.availability === true
                ? t("charger_card.badge.operational")
                : t("charger_card.badge.reported_in_use")
              : t("charger_card.badge.free_of_total", { free: freeCount, total: totalCount })}
          </span>
          <p className={`text-[12px] ${chargerStatusTextClass(statusKind)}`}>
            {statusCopy(charger, t)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-driver-muted">
        {formatKm(km)}
        <span className="mx-2 text-driver-line">|</span>
        {charger.power_kw !== null ? `${charger.power_kw} kW` : t("common.power_fallback")}
        <span className="mx-2 text-driver-line">|</span>
        {charger.price_per_kwh !== null ? `${formatInr(charger.price_per_kwh)}/kWh` : "₹18.00/kWh"}
      </p>
      {charger.occupancy ? (
        <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${occupancyTone(charger.occupancy)}`}>
          {charger.occupancy === "OCCUPIED"
            ? t("fast_track.state.occupied")
            : charger.occupancy === "RESERVED"
              ? t("fast_track.state.reserved")
              : charger.occupancy === "UNAVAILABLE"
                ? t("fast_track.state.unavailable")
                : t("fast_track.state.available")}
        </span>
      ) : null}
      {congestionLevel ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${congestionBadgeClass(congestionLevel)}`}>
            {congestionLevel === "HIGH"
              ? t("intel.congestion.high")
              : congestionLevel === "MODERATE"
                ? t("intel.congestion.moderate")
                : t("intel.congestion.low")}
          </span>
          {estimatedWaitMinutes != null ? (
            <span className="text-[11px] text-driver-muted">
              {t("intel.stat.wait")}: {Math.round(estimatedWaitMinutes)} min
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to={`/driver/charger/${charger.id}`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center rounded-full border border-driver-line bg-driver-bg px-2.5 py-1 text-[10px] font-bold text-driver-ink hover:bg-slate-100 transition-colors"
        >
          {t("common.view_details")}
        </Link>
        <Link
          to={`/driver/charger/${charger.id}/book`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full bg-[#2e5b44] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#254b38] active:bg-[#1d3c2d] transition-colors cursor-pointer"
        >
          <Calendar size={10} />
          {t("common.book_now")}
        </Link>
        <button
          type="button"
          onClick={handleNavigate}
          className="inline-flex items-center gap-1 rounded-full bg-[#e2ebe4] border border-[#cbe4d3] px-2.5 py-1 text-[10px] font-bold text-[#1e4530] hover:bg-[#d6e5d9] transition-colors shadow-xs cursor-pointer"
        >
          <Navigation size={10} />
          {t("common.navigate")}
        </button>
      </div>
    </div>
  );
}
