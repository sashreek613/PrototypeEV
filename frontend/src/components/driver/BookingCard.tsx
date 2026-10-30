import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Booking } from "../../types";
import { formatInr } from "../../utils/format";
import { useT } from "../../i18n";

interface BookingCardProps {
  booking: Booking;
  onCancelRequest?: (booking: Booking) => void;
}

export function BookingCard({ booking, onCancelRequest }: BookingCardProps) {
  const t = useT();
  const stationName = booking.charger?.name.replace(" (demo)", "") ?? booking.charger_id;

  const dateLabel = useMemo(() => {
    return new Date(booking.slot_time).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [booking.slot_time]);

  const statusBadge = useMemo(() => {
    switch (booking.status) {
      case "BOOKED":
        return (
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0b7a52]">
            {t("booking_card.status.confirmed")}
          </span>
        );
      case "ACTIVE":
        return (
          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700 animate-pulse">
            {t("booking_card.status.active")}
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
            {t("booking_card.status.completed")}
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-red-600">
            {t("booking_card.status.cancelled")}
          </span>
        );
      default:
        return (
          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
            {booking.status}
          </span>
        );
    }
    // t's identity changes with the active locale (see useT()), so it must
    // be a dep here -- otherwise the badge would keep showing stale-locale
    // text after a language switch until booking.status itself changed.
  }, [booking.status, t]);

  const isCancellable = useMemo(() => {
    return booking.status === "BOOKED" && new Date() < new Date(booking.slot_time);
  }, [booking.status, booking.slot_time]);

  return (
    <div className="rounded-2xl border border-driver-line bg-driver-card p-4 shadow-sm space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-driver-ink">{stationName}</h3>
          <p className="mt-0.5 text-[12px] text-driver-muted font-medium">
            {dateLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-bold text-driver-ink">{formatInr(booking.price)}</p>
          <div className="mt-1">{statusBadge}</div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-driver-line/50 text-[11px] text-driver-muted font-mono">
        <span>ID: {booking.id.slice(0, 8).toUpperCase()}</span>
        {booking.duration_minutes ? (
          <span>{booking.duration_minutes} mins charge</span>
        ) : null}
      </div>

      <div className="flex gap-2.5 pt-1">
        <Link
          to={`/driver/booking/${booking.id}`}
          className="flex-1 flex h-9 items-center justify-center rounded-xl bg-[#f7f8f5] hover:bg-[#eceee8] text-[12px] font-bold text-driver-ink border border-driver-line transition-colors"
        >
          View Details
        </Link>
        {isCancellable && onCancelRequest ? (
          <button
            type="button"
            onClick={() => onCancelRequest(booking)}
            className="flex-1 flex h-9 items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-[12px] font-bold text-red-600 border border-red-200/50 transition-colors"
          >
            Cancel Booking
          </button>
        ) : null}
      </div>
    </div>
  );
}
