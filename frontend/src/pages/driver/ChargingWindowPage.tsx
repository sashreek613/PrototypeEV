import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, ShieldCheck } from "lucide-react";
import { isAxiosError } from "axios";

import { StatusBar } from "../../components/driver/StatusBar";
import { DynamicPriceCard } from "../../components/driver/DynamicPriceCard";
import { PeakOffPeakCompare } from "../../components/driver/PeakOffPeakCompare";
import { ScreenState } from "../../components/common/ScreenState";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { useCharger } from "../../hooks/useApiData";
import {
  createBooking,
  createPaymentOrder,
  getChargingQuote,
  getVehicles,
  verifyPayment,
} from "../../services/api";
import type { ChargingSlotQuote, PricingTier, Vehicle } from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { formatInr, formatKwh } from "../../utils/format";
import { useLocale, useT } from "../../i18n";

// labelKey resolved via t() inside the component -- this constant lives
// outside it, so it can't call useT() itself.
const DURATION_OPTIONS = [
  { minutes: 30, labelKey: "charging_window.duration.30" },
  { minutes: 45, labelKey: "charging_window.duration.45" },
  { minutes: 60, labelKey: "charging_window.duration.60" },
  { minutes: 90, labelKey: "charging_window.duration.90" },
  { minutes: 120, labelKey: "charging_window.duration.120" },
];

function loadRazorpaySdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// t is threaded in (rather than called here) because this runs inside a
// useMemo -- see its call site, which lists t in that memo's deps so "Today"
// / "Tomorrow" re-translate on a language switch. Weekday/month names stay
// "en-IN" on purpose -- see the call site comment on why.
function generateDateOptions(t: (key: string) => string): Array<{ date: Date; key: string; label: string; subLabel: string }> {
  const options = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const key = d.toISOString().split("T")[0]!;
    const label = i === 0 ? t("charging_window.today") : i === 1 ? t("charging_window.tomorrow") : d.toLocaleDateString("en-IN", { weekday: "short" });
    const subLabel = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    options.push({ date: d, key, label, subLabel });
  }
  return options;
}

function generateTimeSlotsForDate(baseDate: Date): Date[] {
  const slots: Date[] = [];
  const isToday = baseDate.toDateString() === new Date().toDateString();
  const currentHour = new Date().getHours();

  for (let hour = 0; hour < 24; hour++) {
    if (isToday && hour <= currentHour) {
      continue;
    }
    const slot = new Date(baseDate);
    slot.setHours(hour, 0, 0, 0);
    slots.push(slot);
  }
  return slots;
}

function formatSlotTime(slot: Date, durationMinutes: number): string {
  const startStr = slot.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const end = new Date(slot.getTime() + durationMinutes * 60_000);
  const endStr = end.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${startStr} - ${endStr}`;
}

function quoteAsPricing(quote: ChargingSlotQuote): PricingTier {
  return {
    slot_iso: quote.slot_time,
    price: quote.tariff_per_kwh,
    is_peak: quote.is_peak,
    is_off_peak: quote.is_off_peak,
    savings_amount: quote.savings_amount,
    description: quote.description,
  };
}

// Fixed bar sits above the slot scroller's compositing layer so taps reach the CTA.
const CTA_BAR_CLASS =
  "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-5 pb-5";
const CTA_BUTTON_CLASS =
  "pointer-events-auto relative flex h-12 w-full max-w-[382px] items-center justify-center rounded-2xl bg-[#2e5b44] text-[14px] font-bold text-white shadow-lg hover:bg-[#254b38] active:bg-[#1d3c2d] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#2e5b44] cursor-pointer transition-colors";

export function ChargingWindowPage() {
  const t = useT();
  const { locale } = useLocale();
  const { theme } = useTheme();
  const { chargerId } = useParams<{ chargerId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: charger, error, loading } = useCharger(chargerId);
  const cardTone = theme === "dark" ? "dark" : "light";

  // useT() returns a new function each render. Depend on locale so this list
  // (and the quotes effect below) does not reset on every paint.
  const dateOptions = useMemo(() => generateDateOptions(t), [locale]);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(dateOptions[0]!.key);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [selectedSlotTimeIso, setSelectedSlotTimeIso] = useState<string | null>(null);

  const [bookingStep, setBookingStep] = useState<"select_slot" | "payment">("select_slot");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const paymentLock = useRef(false);

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [quotesByIso, setQuotesByIso] = useState<Record<string, ChargingSlotQuote>>({});
  const [energyKwh, setEnergyKwh] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Preload Razorpay SDK script on component mount
  useEffect(() => {
    void loadRazorpaySdk();
  }, []);

  const selectedDateObj = useMemo(() => {
    const found = dateOptions.find((d) => d.key === selectedDateKey);
    return found ? found.date : dateOptions[0]!.date;
  }, [dateOptions, selectedDateKey]);

  const candidateSlots = useMemo(() => {
    return generateTimeSlotsForDate(selectedDateObj);
  }, [selectedDateObj]);

  const primaryVehicle = useMemo(
    () => vehicles?.find((item) => item.is_primary) ?? vehicles?.[0] ?? null,
    [vehicles],
  );

  useEffect(() => {
    let cancelled = false;
    void getVehicles()
      .then((list) => {
        if (!cancelled) setVehicles(list);
      })
      .catch(() => {
        if (!cancelled) setVehicles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch live quotes whenever charger, candidateSlots, or selectedDuration changes
  useEffect(() => {
    if (!charger || candidateSlots.length === 0) {
      setQuotesByIso({});
      setEnergyKwh(null);
      return;
    }

    const slotIsoStrings = candidateSlots.map((s) => s.toISOString());
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);

    void getChargingQuote(charger.id, slotIsoStrings, selectedDuration)
      .then((result) => {
        if (cancelled) return;
        const nextQuotes: Record<string, ChargingSlotQuote> = {};
        result.quotes.forEach((q, idx) => {
          const reqIso = slotIsoStrings[idx];
          if (reqIso) {
            nextQuotes[reqIso] = q;
          } else {
            nextQuotes[new Date(q.slot_time).toISOString()] = q;
          }
        });
        setQuotesByIso(nextQuotes);
        setEnergyKwh(result.energy_kwh);
        // Default to first slot if none selected or if selected slot is not in new list
        if (!selectedSlotTimeIso || !nextQuotes[selectedSlotTimeIso]) {
          setSelectedSlotTimeIso(slotIsoStrings[0] ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setQuoteError(getErrorMessage(err));
          setQuotesByIso({});
          setEnergyKwh(null);
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [charger, candidateSlots, selectedDuration]);

  useEffect(() => {
    setPendingBookingId(null);
  }, [selectedSlotTimeIso, selectedDuration, selectedDateKey]);

  const selectedQuote = selectedSlotTimeIso ? quotesByIso[selectedSlotTimeIso] : undefined;
  const selectedPricing = selectedQuote ? quoteAsPricing(selectedQuote) : undefined;
  const selectedTotal = selectedQuote?.total ?? null;

  // Sample Peak and Off-peak quotes for comparison
  const samplePeakQuote = useMemo(
    () => Object.values(quotesByIso).find((q) => q.is_peak),
    [quotesByIso],
  );
  const sampleOffPeakQuote = useMemo(
    () => Object.values(quotesByIso).find((q) => q.is_off_peak),
    [quotesByIso],
  );

  const cheaper: "peak" | "off-peak" | "same" =
    samplePeakQuote && sampleOffPeakQuote
      ? sampleOffPeakQuote.tariff_per_kwh < samplePeakQuote.tariff_per_kwh
        ? "off-peak"
        : "same"
      : "same";

  const peakTotal = samplePeakQuote?.total ?? null;
  const offPeakTotal = sampleOffPeakQuote?.total ?? null;
  const savingsTotal =
    peakTotal != null && offPeakTotal != null ? Math.round((peakTotal - offPeakTotal) * 100) / 100 : null;
  const savingsPct =
    peakTotal != null && savingsTotal != null && peakTotal > 0
      ? Math.round((savingsTotal / peakTotal) * 100)
      : null;

  async function handleLaunchRazorpayPayment() {
    if (!charger) return;
    if (paymentLock.current) return;
    if (!profile) {
      setSubmitError(t("charging_window.error_not_signed_in"));
      return;
    }
    if (!selectedSlotTimeIso || !selectedQuote) {
      setSubmitError(t("charging_window.error_invalid_slot"));
      return;
    }

    paymentLock.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const sdkReady = await loadRazorpaySdk();
      if (!sdkReady || !window.Razorpay) {
        throw new Error(t("charging_window.error_gateway_load"));
      }

      let bookingId = pendingBookingId;
      if (!bookingId) {
        const booking = await createBooking({
          charger_id: charger.id,
          slot_time: selectedSlotTimeIso,
          duration_minutes: selectedDuration,
        });
        bookingId = booking.id;
        setPendingBookingId(booking.id);
      }

      const orderData = await createPaymentOrder({
        booking_id: bookingId,
        amount: selectedQuote.total,
        currency: "INR",
      });

      const rzpOptions = {
        key: orderData.razorpay_key_id,
        amount: orderData.amount_paise,
        currency: orderData.currency,
        name: "VidyutOne",
        description: `${charger.name.replace(" (demo)", "")} - Charging Reservation`,
        order_id: orderData.razorpay_order_id,
        prefill: {
          name: profile.full_name || "EV Driver",
          email: profile.email || "driver@vidyutone.com",
          contact: profile.phone_number || "9999999999",
        },
        theme: {
          color: "#2e5b44",
        },
        modal: {
          ondismiss: () => {
            paymentLock.current = false;
            setSubmitting(false);
            setSubmitError(t("charging_window.error_payment_dismissed"));
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            setSubmitting(true);
            const verifyRes = await verifyPayment({
              booking_id: bookingId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.success) {
              void navigate(`/driver/booking/${bookingId}`);
            } else {
              setSubmitError(verifyRes.message || t("charging_window.error_verification_failed"));
              paymentLock.current = false;
              setSubmitting(false);
            }
          } catch (err: unknown) {
            if (isAxiosError(err) && !err.response) {
              void navigate(`/driver/booking/${bookingId}`);
              return;
            }
            setSubmitError(getErrorMessage(err));
            paymentLock.current = false;
            setSubmitting(false);
          }
        },
      };

      const razorpayInstance = new window.Razorpay(rzpOptions);
      razorpayInstance.on("payment.failed", (response: { error?: { description?: string } }) => {
        setSubmitError(response.error?.description || t("charging_window.error_payment_failed"));
        paymentLock.current = false;
        setSubmitting(false);
      });

      razorpayInstance.open();
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err));
      paymentLock.current = false;
      setSubmitting(false);
    }
  }

  const proceedButtonLabel = submitting
    ? t("charging_window.processing")
    : selectedTotal != null
      ? t("charging_window.proceed_with_amount", { amount: formatInr(selectedTotal) })
      : t("charging_window.proceed_plain");

  const payButtonLabel = submitting
    ? t("charging_window.processing")
    : selectedTotal != null
      ? t("charging_window.pay_with_amount", { amount: formatInr(selectedTotal) })
      : t("charging_window.confirm_pay_title");

  return (
    <div className="flex min-h-screen flex-col bg-driver-bg pb-28 text-driver-ink">
      <StatusBar />
      <ScreenState
        loading={loading}
        error={error}
        tone={cardTone}
        loadingText={t("common.loading")}
        errorLabel={t("common.load_error_prefix")}
      >
        {charger ? (
          <div className="px-5 pt-4">
            <button
              type="button"
              onClick={() => {
                if (bookingStep === "payment") {
                  setBookingStep("select_slot");
                } else {
                  void navigate(-1);
                }
              }}
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-driver-card shadow border border-driver-line text-driver-ink hover:bg-driver-line transition-colors cursor-pointer"
              aria-label={t("common.back")}
            >
              <ArrowLeft size={16} />
            </button>

            {bookingStep === "select_slot" ? (
              <>
                <p className="text-[11px] tracking-[0.18em] text-driver-muted uppercase font-semibold">
                  — {charger.name.replace(" (demo)", "")}
                </p>
                <h1 className="mt-2 text-[26px] leading-tight font-bold tracking-tight">{t("charging_window.select_window_title")}</h1>

                {charger.bookable === false || charger.price_per_kwh === null ? (
                  <div className="mt-4 rounded-2xl border border-vo-accent/40 bg-vo-accent-dim px-4 py-3.5 text-[13px] text-vo-accent-ink">
                    <strong>{t("charging_window.info_only_title")}</strong> {t("charging_window.info_only_body")}
                  </div>
                ) : (
                  <>
                    <p className="mt-1.5 text-[13px] text-driver-muted">
                      {t("charging_window.live_tariff_note")}
                    </p>

                    {primaryVehicle ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-driver-card px-3 py-1.5 text-[12px] text-driver-ink border border-driver-line">
                        <span className="font-semibold">{primaryVehicle.make} {primaryVehicle.model}</span>
                        <span className="text-driver-muted">·</span>
                        <span>{Math.round(primaryVehicle.current_battery_pct)}% → 80%</span>
                        {energyKwh != null && (
                          <>
                            <span className="text-driver-muted">·</span>
                            <span className="font-medium text-vo-good-ink">{formatKwh(energyKwh)}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] text-driver-muted">
                        {t("charging_window.energy_estimate", {
                          power: charger.power_kw !== null ? `${charger.power_kw} kW` : t("charging_window.standard_power"),
                          duration: selectedDuration,
                        })}
                      </p>
                    )}

                    {/* --- 1. Date Selector --- */}
                    <div className="mt-5">
                      <div className="flex items-center gap-1.5 text-[12px] font-bold text-driver-muted uppercase tracking-wider mb-2.5">
                        <Calendar size={14} />
                        <span>{t("charging_window.step1_date")}</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {dateOptions.map((opt) => {
                          const active = opt.key === selectedDateKey;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                setSelectedDateKey(opt.key);
                                setSelectedSlotTimeIso(null);
                              }}
                              className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2.5 min-w-[80px] border transition-all text-center cursor-pointer disabled:cursor-not-allowed ${
                                active
                                  ? "bg-vo-text border-vo-text text-vo-bg shadow-sm"
                                  : "bg-driver-card border-driver-line text-driver-ink hover:bg-driver-line"
                              }`}
                            >
                              <span className="text-[13px] font-bold">{opt.label}</span>
                              <span className={`text-[11px] ${active ? "text-vo-muted" : "text-driver-muted"}`}>
                                {opt.subLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* --- 2. Duration Selector --- */}
                    <div className="mt-5">
                      <div className="flex items-center gap-1.5 text-[12px] font-bold text-driver-muted uppercase tracking-wider mb-2.5">
                        <Clock size={14} />
                        <span>{t("charging_window.step2_duration")}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {DURATION_OPTIONS.map((opt) => {
                          const active = opt.minutes === selectedDuration;
                          return (
                            <button
                              key={opt.minutes}
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                setSelectedDuration(opt.minutes);
                              }}
                              className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold border transition-all cursor-pointer disabled:cursor-not-allowed ${
                                active
                                  ? "bg-[#2e5b44] border-[#2e5b44] text-white shadow-sm"
                                  : "bg-driver-card border-driver-line text-driver-ink hover:bg-driver-line"
                              }`}
                            >
                              {t(opt.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* --- 3. Time Slots Grid --- */}
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-bold text-driver-muted uppercase tracking-wider">
                          {t("charging_window.step3_slots", { count: candidateSlots.length })}
                        </span>
                        {quoteLoading && <span className="text-[11px] text-driver-muted animate-pulse">{t("charging_window.updating_rates")}</span>}
                      </div>

                      {candidateSlots.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-driver-line p-6 text-center text-[13px] text-driver-muted">
                          {t("charging_window.no_slots")}
                        </div>
                      ) : (
                        <div className="relative z-0 grid grid-cols-1 gap-2.5 max-h-[320px] overflow-y-auto overscroll-contain pr-1">
                          {candidateSlots.map((slot) => {
                            const iso = slot.toISOString();
                            const active = iso === selectedSlotTimeIso;
                            const quote = quotesByIso[iso];
                            const total = quote?.total ?? null;

                            return (
                              <button
                                key={iso}
                                type="button"
                                disabled={submitting}
                                onClick={() => setSelectedSlotTimeIso(iso)}
                                className={`flex items-center justify-between rounded-2xl p-3.5 text-left border transition-all cursor-pointer disabled:cursor-not-allowed ${
                                  active
                                    ? "bg-vo-text border-vo-text text-vo-bg shadow-md"
                                    : "bg-driver-card border-driver-line text-driver-ink hover:bg-driver-line"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                      active ? "border-vo-accent bg-vo-accent" : "border-driver-muted"
                                    }`}
                                  >
                                    {active ? <span className="h-1.5 w-1.5 rounded-full bg-vo-bg" /> : null}
                                  </span>

                                  <div>
                                    <span className="block text-[14px] font-bold">
                                      {formatSlotTime(slot, selectedDuration)}
                                    </span>

                                    {quote ? (
                                      <div className="mt-0.5 flex items-center gap-2">
                                        <span
                                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                            quote.is_off_peak
                                              ? active ? "bg-emerald-700 text-emerald-100" : "bg-vo-good-bg text-vo-good-ink"
                                              : quote.is_peak
                                                ? active ? "bg-amber-700 text-amber-100" : "bg-vo-warn-bg text-vo-warn-ink"
                                                : active ? "bg-vo-elevated text-vo-muted" : "bg-driver-line text-driver-ink"
                                          }`}
                                        >
                                          {quote.is_off_peak ? t("charging_window.badge_off_peak") : quote.is_peak ? t("charging_window.badge_peak") : t("common.standard")}
                                        </span>
                                        <span className={`text-[11px] ${active ? "text-vo-muted" : "text-driver-muted"}`}>
                                          {formatInr(quote.tariff_per_kwh)} / kWh
                                        </span>
                                      </div>
                                    ) : (
                                      <span className={`text-[11px] ${active ? "text-vo-muted" : "text-driver-muted"}`}>
                                        {t("charging_window.calculating")}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="text-right">
                                  {quote ? (
                                    <span className={`block text-[16px] font-bold ${active ? "text-emerald-500" : "text-driver-ink"}`}>
                                      {formatInr(total ?? quote.total)}
                                    </span>
                                  ) : (
                                    <span className="text-[12px] text-driver-muted">—</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {quoteError && <p className="mt-3 text-[13px] font-medium text-vo-red">{quoteError}</p>}

                    {/* --- Selected Slot Breakdown Card --- */}
                    <div className="mt-5">
                      {selectedPricing && selectedQuote ? (
                        <DynamicPriceCard
                          pricing={selectedPricing}
                          total={selectedQuote.total}
                          tone={cardTone}
                        />
                      ) : (
                        <div className="rounded-xl border border-driver-line bg-driver-card p-3.5 text-[12px] text-driver-muted">
                          {quoteLoading ? t("charging_window.loading_calc") : t("charging_window.select_slot_prompt")}
                        </div>
                      )}
                    </div>

                    {/* --- Peak vs Off-Peak Savings Insights --- */}
                    <div className="mt-5">
                      <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-driver-muted mb-2">
                        {t("charging_window.compare_heading")}
                      </h2>
                      <div>
                        {samplePeakQuote && sampleOffPeakQuote ? (
                          <PeakOffPeakCompare
                            peakTariff={samplePeakQuote.tariff_per_kwh}
                            offPeakTariff={sampleOffPeakQuote.tariff_per_kwh}
                            peakTotal={peakTotal}
                            offPeakTotal={offPeakTotal}
                            savingsTotal={savingsTotal}
                            savingsPct={savingsPct}
                            cheaper={cheaper}
                            tone={cardTone}
                          />
                        ) : (
                          <p className="text-[12px] text-driver-muted">
                            {t("charging_window.comparing_note")}
                          </p>
                        )}
                      </div>
                    </div>

                    {submitError && (
                      <div className="mt-4 rounded-xl bg-vo-bad-bg border border-vo-bad-border p-3 text-[13px] font-medium text-vo-bad-ink">
                        {submitError}
                      </div>
                    )}

                    <div className={CTA_BAR_CLASS}>
                      <button
                        type="button"
                        disabled={!selectedQuote || submitting}
                        onClick={() => {
                          setSubmitError(null);
                          setBookingStep("payment");
                          void handleLaunchRazorpayPayment();
                        }}
                        className={CTA_BUTTON_CLASS}
                      >
                        {submitting ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            {t("charging_window.processing")}
                          </span>
                        ) : (
                          proceedButtonLabel
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              /* --- Step 2: Razorpay Payment Checkout Step --- */
              <>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-vo-good-bg border border-vo-good-border px-2.5 py-1 text-[10px] font-semibold tracking-wider text-vo-good-ink uppercase">
                    {t("charging_window.test_mode_badge")}
                  </span>
                  <span className="text-[12px] font-mono text-driver-muted">{t("charging_window.step_2_of_2")}</span>
                </div>
                <h1 className="mt-2 text-[26px] leading-tight font-bold text-driver-ink">{t("charging_window.confirm_pay_title")}</h1>
                <p className="mt-1 text-[13px] text-driver-muted">
                  {t("charging_window.review_note")}
                </p>

                {/* Booking Order Summary */}
                <div className="mt-5 rounded-2xl border border-driver-line bg-driver-card p-5 space-y-3 shadow-[0_4px_16px_rgba(16,24,20,0.03)]">
                  <div className="flex items-center justify-between border-b border-driver-line pb-3">
                    <span className="text-[11px] font-bold text-driver-muted uppercase tracking-wider">{t("charging_window.summary.hub")}</span>
                    <span className="text-[14px] font-semibold text-driver-ink">{charger.name.replace(" (demo)", "")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-driver-muted">{t("charging_window.summary.datetime")}</span>
                    <span className="text-[13px] font-semibold text-driver-ink">
                      {selectedSlotTimeIso ? formatSlotTime(new Date(selectedSlotTimeIso), selectedDuration) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-driver-muted">{t("charging_window.summary.duration_energy")}</span>
                    <span className="text-[13px] font-medium text-driver-ink">
                      {selectedDuration} mins {energyKwh != null ? `(${formatKwh(energyKwh)})` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-driver-muted">{t("charging_window.summary.tariff")}</span>
                    <div className="text-right">
                      <span className="text-[13px] font-medium text-driver-ink">
                        {selectedQuote ? `${formatInr(selectedQuote.tariff_per_kwh)} / kWh` : "—"}
                      </span>
                      {selectedQuote && (
                        <span className="block text-[10px] text-driver-muted">
                          {selectedQuote.is_off_peak
                            ? t("charging_window.rate_off_peak")
                            : selectedQuote.is_peak
                              ? t("charging_window.rate_peak")
                              : t("charging_window.rate_standard")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-driver-line pt-3 flex items-center justify-between font-bold">
                    <span className="text-[14px] text-driver-ink">{t("charging_window.summary.total")}</span>
                    <span className="text-[20px] text-vo-good-ink">{selectedTotal != null ? formatInr(selectedTotal) : "—"}</span>
                  </div>
                </div>

                {/* Razorpay Gateway Info */}
                <div className="mt-5 rounded-2xl border border-driver-line bg-driver-card p-4 text-[12px] text-driver-muted space-y-2">
                  <div className="flex items-center gap-2 text-driver-ink font-semibold">
                    <ShieldCheck size={16} className="text-vo-good-ink" />
                    <span>{t("charging_window.gateway_heading")}</span>
                  </div>
                  <p className="leading-relaxed">
                    {t("charging_window.gateway_body")}
                  </p>
                </div>

                {submitError && (
                  <div className="mt-4 rounded-xl bg-vo-bad-bg border border-vo-bad-border p-3 text-[13px] font-medium text-vo-bad-ink">
                    {submitError}
                  </div>
                )}

                <div className={CTA_BAR_CLASS}>
                  <button
                    type="button"
                    disabled={submitting || !selectedQuote}
                    onClick={() => void handleLaunchRazorpayPayment()}
                    className={CTA_BUTTON_CLASS}
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        {t("charging_window.processing")}
                      </span>
                    ) : (
                      payButtonLabel
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </ScreenState>
    </div>
  );
}
