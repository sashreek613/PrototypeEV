import { useMemo, useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Info, X } from "lucide-react";

import { StatusBar } from "../../components/driver/StatusBar";
import { ScreenState } from "../../components/common/ScreenState";
import { useBooking, useCharger } from "../../hooks/useApiData";
import { cancelBooking } from "../../services/api";
import { formatInr } from "../../utils/format";
import type { Booking } from "../../types";
import { useT } from "../../i18n";

export function BookingPage() {
  const t = useT();
  const { bookingId } = useParams<{ bookingId: string }>();
  const { data: initialBooking, error, loading } = useBooking(bookingId);
  const [booking, setBooking] = useState<Booking | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialBooking) {
      setBooking(initialBooking);
    }
  }, [initialBooking]);

  const chargerQuery = useCharger(booking?.charger_id);

  const dateLabel = useMemo(() => {
    if (!booking) return "";
    return new Date(booking.slot_time).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [booking]);

  const timeLabel = useMemo(() => {
    if (!booking) return "";
    return new Date(booking.slot_time).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [booking]);

  const statusLabel = useMemo(() => {
    if (!booking) return "";
    switch (booking.status) {
      case "BOOKED":
        return t("booking_page.status.confirmed_paid");
      case "ACTIVE":
        return t("booking_page.status.active_session");
      case "COMPLETED":
        return t("booking_page.status.completed");
      case "CANCELLED":
        return t("booking_page.status.cancelled");
      case "PAYMENT_PENDING":
        return t("booking_page.status.payment_pending");
      default:
        return booking.status;
    }
    // t changes identity with the active locale -- must be a dep so this
    // recomputes on a language switch, not just when `booking` changes.
  }, [booking, t]);

  const titleText = useMemo(() => {
    if (!booking) return "";
    switch (booking.status) {
      case "BOOKED":
        return t("booking_page.title.confirmed");
      case "ACTIVE":
        return t("booking_page.title.active");
      case "COMPLETED":
        return t("booking_page.title.completed");
      case "CANCELLED":
        return t("booking_page.title.cancelled");
      case "PAYMENT_PENDING":
        return t("booking_page.title.payment_pending");
      default:
        return t("booking_page.title.default");
    }
  }, [booking, t]);

  const isCancellable = useMemo(() => {
    return booking?.status === "BOOKED" && new Date() < new Date(booking.slot_time);
  }, [booking]);

  async function handleCancelConfirm() {
    if (!bookingId) return;
    setSubmittingCancel(true);
    setActionError(null);
    try {
      const updated = await cancelBooking(bookingId);
      setBooking(updated);
      setSuccessMessage(t("common.booking_cancelled_success"));
      setCancelling(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t("common.error_cancel_booking"));
    } finally {
      setSubmittingCancel(false);
    }
  }

  const stationName = chargerQuery.data?.name.replace(" (demo)", "") ?? booking?.charger_id ?? "";
  const chargerPower = chargerQuery.data?.power_kw ? `${chargerQuery.data.power_kw} kW` : t("common.power_fallback");
  const effectiveTariff = chargerQuery.data?.price_per_kwh ? chargerQuery.data.price_per_kwh : 18.0;

  // Approximate energy kWh from price / tariff or power * duration
  const estimatedEnergy = useMemo(() => {
    if (!booking) return null;
    const durationHours = (booking.duration_minutes || 30) / 60;
    const powerKw = chargerQuery.data?.power_kw || 7.4;
    return (powerKw * durationHours).toFixed(1);
  }, [booking, chargerQuery.data]);

  return (
    <div className="flex min-h-screen flex-col bg-driver-bg pb-20 text-driver-ink">
      <StatusBar />
      <ScreenState
        loading={loading}
        error={error}
        tone="light"
        loadingText={t("common.loading")}
        errorLabel={t("common.load_error_prefix")}
      >
        {booking ? (
          <div className="px-5 pt-6 pb-10">
            {/* Status Icon */}
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl text-[20px] font-bold shadow-xs ${
                booking.status === "CANCELLED"
                  ? "bg-[#fdf2f2] text-[#9e3a3a] border border-[#f5c6cb]"
                  : "bg-[#edf6f0] text-[#3d7a5a] border border-[#cbe4d3]"
              }`}
            >
              {booking.status === "CANCELLED" ? "✕" : "✓"}
            </div>

            <h1 className="mt-4 text-[26px] font-bold text-driver-ink">{titleText}</h1>

            {booking.status === "BOOKED" && (
              <p className="mt-1 text-[13px] text-driver-muted">
                {t("booking_page.confirmed_note")}
              </p>
            )}
            {booking.status === "CANCELLED" && (
              <p className="mt-1 text-[13px] text-[#9e3a3a] font-medium">
                {t("booking_page.cancelled_note")}
              </p>
            )}

            {successMessage && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-[#edf6f0] border border-[#cbe4d3] p-3 text-[13px] text-[#3d7a5a] font-medium shadow-xs">
                <Info size={16} />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Booking Details Card */}
            <dl className="mt-6 divide-y divide-driver-line rounded-[22px] border border-driver-line bg-driver-card px-5 shadow-[0_4px_16px_rgba(16,24,20,0.03)]">
              <Row label={t("booking_page.row.station")} value={stationName} />
              <Row label={t("booking_page.row.date")} value={dateLabel} />
              <Row label={t("booking_page.row.start_time")} value={timeLabel} />
              <Row label={t("booking_page.row.duration")} value={`${booking.duration_minutes || 30} minutes`} />
              {estimatedEnergy && <Row label={t("booking_page.row.estimated_energy")} value={`${estimatedEnergy} kWh (${chargerPower})`} />}
              <Row label={t("booking_page.row.base_tariff")} value={`${formatInr(effectiveTariff)} / kWh`} />
              <Row label={t("booking_page.row.total_paid")} value={formatInr(booking.price)} highlight />
              <Row label={t("booking_page.row.payment_status")} value={statusLabel} />
              <Row label={t("booking_page.row.booking_id")} value={booking.id.slice(0, 8).toUpperCase()} />
            </dl>

            {isCancellable && (
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setCancelling(true);
                }}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[#fdf2f2] hover:bg-[#fae8e8] text-[14px] font-semibold text-[#9e3a3a] border border-[#f5c6cb] transition-colors cursor-pointer"
              >
                {t("common.cancel_booking")}
              </button>
            )}

            <Link
              to="/driver"
              className={`flex h-12 items-center justify-center rounded-2xl bg-[#2e5b44] text-[14px] font-semibold text-white shadow-md hover:bg-[#254b38] transition-colors ${
                isCancellable ? "mt-3" : "mt-6"
              }`}
            >
              {t("booking_page.back_home")}
            </Link>
          </div>
        ) : null}
      </ScreenState>

      {/* Cancellation Modal Dialog */}
      {cancelling && booking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl relative border border-driver-line text-driver-ink">
            <button
              type="button"
              onClick={() => setCancelling(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-driver-muted hover:bg-gray-100 hover:text-driver-ink transition-colors"
              disabled={submittingCancel}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-4">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight">{t("common.cancel_modal_title")}</h2>
                <p className="mt-1 text-[13px] text-driver-muted">
                  {t("common.cancel_modal_body")}
                </p>
              </div>

              {/* Booking Summary Box */}
              <div className="rounded-xl bg-[#f7f8f5] border border-driver-line p-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-driver-muted">
                  {t("common.reservation_detail")}
                </p>
                <div className="text-[13px] space-y-1">
                  <p className="font-bold">{stationName}</p>
                  <p className="text-driver-muted">{dateLabel} · {timeLabel}</p>
                  <p className="font-semibold text-[#3d7a5a]">
                    {t("common.price_label", { amount: formatInr(booking.price) })}
                  </p>
                </div>
              </div>

              {actionError && (
                <p className="text-[12px] font-medium text-[#9e3a3a]">{actionError}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelling(false)}
                  className="flex-1 flex h-11 items-center justify-center rounded-xl border border-driver-line text-[13px] font-bold hover:bg-gray-50 transition-colors"
                  disabled={submittingCancel}
                >
                  {t("common.keep_booking")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelConfirm()}
                  className="flex-1 flex h-11 items-center justify-center rounded-xl bg-[#9e3a3a] hover:bg-[#853030] text-[13px] font-bold text-white transition-colors"
                  disabled={submittingCancel}
                >
                  {submittingCancel ? t("common.cancelling") : t("common.cancel_booking")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-[13px]">
      <dt className="text-driver-muted">{label}</dt>
      <dd className={`font-semibold ${highlight ? "text-[16px] text-vo-good-ink" : "text-driver-ink"}`}>{value}</dd>
    </div>
  );
}
