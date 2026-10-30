import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, Info, X } from "lucide-react";

import { StatusBar } from "../../components/driver/StatusBar";
import { BookingCard } from "../../components/driver/BookingCard";
import { ScreenState } from "../../components/common/ScreenState";
import { useBookings } from "../../hooks/useApiData";
import { cancelBooking } from "../../services/api";
import type { Booking } from "../../types";
import { formatInr } from "../../utils/format";
import { useT } from "../../i18n";

type Tab = "upcoming" | "history";

export function BookingsPage() {
  const t = useT();
  const [refetchKey, setRefetchKey] = useState(0);
  const { data: bookings, error, loading } = useBookings([refetchKey]);

  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Group and sort bookings
  const upcomingBookings = useMemo(() => {
    if (!bookings) return [];
    return bookings
      .filter((b) => b.status === "BOOKED" || b.status === "ACTIVE")
      .sort((a, b) => new Date(a.slot_time).getTime() - new Date(b.slot_time).getTime());
  }, [bookings]);

  const historyBookings = useMemo(() => {
    if (!bookings) return [];
    return bookings
      .filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED")
      .sort((a, b) => new Date(b.slot_time).getTime() - new Date(a.slot_time).getTime());
  }, [bookings]);

  async function handleCancelConfirm() {
    if (!cancellingBooking) return;
    setSubmittingCancel(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await cancelBooking(cancellingBooking.id);
      setSuccessMessage(t("common.booking_cancelled_success"));
      setCancellingBooking(null);
      setRefetchKey((prev) => prev + 1);
      // Auto fade success message after 4s
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t("common.error_cancel_booking"));
    } finally {
      setSubmittingCancel(false);
    }
  }

  const currentList = activeTab === "upcoming" ? upcomingBookings : historyBookings;

  return (
    <div className="flex min-h-screen flex-col bg-driver-bg pb-28">
      <StatusBar />
      
      <div className="px-5 pt-3">
        <Link to="/driver" className="inline-flex items-center gap-1 text-[12px] text-[#0b7a52] font-semibold">
          <ArrowLeft size={14} />
          {t("common.home")}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold text-driver-ink tracking-tight">{t("common.my_bookings")}</h1>
        <p className="mt-1 text-[13px] text-driver-muted">{t("bookings_page.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="mx-5 mt-5 flex rounded-xl bg-gray-200/50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`flex-1 rounded-lg py-2.5 text-center text-[13px] font-bold transition-all ${
            activeTab === "upcoming"
              ? "bg-white text-driver-ink shadow-sm"
              : "text-driver-muted hover:text-driver-ink"
          }`}
        >
          {t("bookings_page.tab_upcoming", { count: upcomingBookings.length })}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-1 rounded-lg py-2.5 text-center text-[13px] font-bold transition-all ${
            activeTab === "history"
              ? "bg-white text-driver-ink shadow-sm"
              : "text-driver-muted hover:text-driver-ink"
          }`}
        >
          {t("bookings_page.tab_history", { count: historyBookings.length })}
        </button>
      </div>

      {/* Toast Alert Messages */}
      {successMessage && (
        <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200/50 p-3 text-[13px] text-[#0b7a52] font-medium shadow-sm animate-fade-in">
          <Info size={16} />
          <span>{successMessage}</span>
        </div>
      )}
      {actionError && (
        <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl bg-red-50 border border-red-200/50 p-3 text-[13px] text-red-600 font-medium shadow-sm animate-fade-in">
          <Info size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Bookings List */}
      <div className="mt-5 px-5">
        <ScreenState
          loading={loading}
          error={error}
          tone="light"
          loadingText={t("common.loading")}
          errorLabel={t("common.load_error_prefix")}
        >
          {currentList.length > 0 ? (
            <div className="flex flex-col gap-4">
              {currentList.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onCancelRequest={(b) => {
                    setActionError(null);
                    setCancellingBooking(b);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-driver-line p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-driver-muted">
                <Calendar size={20} />
              </div>
              <h3 className="mt-3 text-[15px] font-bold text-driver-ink">
                {activeTab === "upcoming" ? t("bookings_page.empty_title_upcoming") : t("bookings_page.empty_title_history")}
              </h3>
              <p className="mt-1 max-w-[220px] text-[12px] text-driver-muted">
                {activeTab === "upcoming"
                  ? t("bookings_page.empty_body_upcoming")
                  : t("bookings_page.empty_body_history")}
              </p>
              {activeTab === "upcoming" && (
                <Link
                  to="/driver"
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-[#0b7a52] px-4 text-[12px] font-bold text-white shadow-sm hover:bg-[#096342] transition-colors"
                >
                  {t("bookings_page.find_charger")}
                </Link>
              )}
            </div>
          )}
        </ScreenState>
      </div>

      {/* Cancellation Modal Dialog */}
      {cancellingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl relative border border-driver-line text-driver-ink">
            <button
              type="button"
              onClick={() => setCancellingBooking(null)}
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
                  <p className="font-bold">
                    {cancellingBooking.charger?.name.replace(" (demo)", "") ?? cancellingBooking.charger_id}
                  </p>
                  <p className="text-driver-muted">
                    {new Date(cancellingBooking.slot_time).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                  <p className="font-semibold text-[#0b7a52]">
                    {t("common.price_label", { amount: formatInr(cancellingBooking.price) })}
                  </p>
                </div>
              </div>

              {actionError && (
                <p className="text-[12px] font-medium text-red-600">{actionError}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingBooking(null)}
                  className="flex-1 flex h-11 items-center justify-center rounded-xl border border-driver-line text-[13px] font-bold hover:bg-gray-50 transition-colors"
                  disabled={submittingCancel}
                >
                  {t("common.keep_booking")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelConfirm()}
                  className="flex-1 flex h-11 items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-[13px] font-bold text-white transition-colors"
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
