import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, QrCode } from "lucide-react";

import { StatusBar } from "../../components/driver/StatusBar";
import { LanguageToggle } from "../../components/driver/LanguageToggle";
import { ThemeToggle } from "../../components/common/ThemeToggle";
import { useT } from "../../i18n";
import {
  checkFastTrack,
  confirmFastTrack,
  getDriverIntelligence,
} from "../../services/api";
import type { FastTrackStatus, RecommendedChargerInfo } from "../../types";
import { occupancyTone } from "../../utils/occupancy";
import { getErrorMessage } from "../../utils/errors";
import { formatInr } from "../../utils/format";

const POLL_MS = 5000;

export function FastTrackPage() {
  const t = useT();
  const navigate = useNavigate();
  const { chargerId: routeChargerId } = useParams<{ chargerId?: string }>();
  const [params] = useSearchParams();
  const initialId = routeChargerId || params.get("charger") || "";

  const [chargerId, setChargerId] = useState(initialId);
  const [draftId, setDraftId] = useState(initialId);
  const [status, setStatus] = useState<FastTrackStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [alternative, setAlternative] = useState<RecommendedChargerInfo | null>(null);

  useEffect(() => {
    if (!chargerId) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await checkFastTrack(chargerId);
        if (!cancelled) {
          setStatus(next);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(err));
          setStatus(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    const interval = window.setInterval(() => {
      void checkFastTrack(chargerId)
        .then((next) => {
          if (!cancelled) {
            setStatus(next);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getErrorMessage(err));
          }
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chargerId]);

  useEffect(() => {
    if (!status || status.occupancy === "AVAILABLE" || status.latitude == null || status.longitude == null) {
      setAlternative(null);
      return;
    }
    let cancelled = false;
    void getDriverIntelligence({
      latitude: status.latitude,
      longitude: status.longitude,
      preference: "balanced",
    })
      .then((intel) => {
        if (cancelled) {
          return;
        }
        const alt = intel.alternative?.recommended ?? intel.ranked.find((row) => row.charger_id !== status.charger_id) ?? null;
        setAlternative(alt);
      })
      .catch(() => {
        if (!cancelled) {
          setAlternative(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const occupancy = status?.occupancy ?? null;
  const heading = useMemo(() => {
    if (occupancy === "AVAILABLE") return t("fast_track.state.available");
    if (occupancy === "OCCUPIED") return t("fast_track.state.occupied");
    if (occupancy === "RESERVED") return t("fast_track.state.reserved");
    if (occupancy) return t("fast_track.state.unavailable");
    return t("fast_track.checking");
  }, [occupancy, t]);

  function identify() {
    const next = draftId.trim();
    if (!next) {
      setError(t("fast_track.enter_id"));
      return;
    }
    setConfirmMessage(null);
    setChargerId(next);
    navigate(`/charger/${encodeURIComponent(next)}`, { replace: true });
  }

  async function handleConfirm() {
    if (!chargerId) {
      return;
    }
    setConfirming(true);
    setConfirmMessage(null);
    setError(null);
    try {
      const booking = await confirmFastTrack(chargerId);
      setConfirmMessage(t("fast_track.booked"));
      navigate(`/driver/booking/${booking.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      try {
        const next = await checkFastTrack(chargerId);
        setStatus(next);
      } catch {
        // keep previous status
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-driver-bg pb-16 text-driver-ink">
      <StatusBar />
      <div className="flex items-center justify-between px-5 py-3">
        <button
          type="button"
          onClick={() => navigate("/driver")}
          className="inline-flex items-center gap-1 text-[13px] text-driver-muted"
        >
          <ArrowLeft size={16} />
          {t("common.home")}
        </button>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle compact />
        </div>
      </div>

      <div className="space-y-4 px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2e5b44] text-white">
            <QrCode size={18} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">{t("fast_track.eyebrow")}</p>
            <h1 className="text-[20px] font-bold">{t("fast_track.title")}</h1>
          </div>
        </div>
        <p className="text-[12px] text-vo-muted">{t("fast_track.qr_note")}</p>

        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("fast_track.charger_id")}</span>
          <div className="flex gap-2">
            <input
              value={draftId}
              onChange={(event) => setDraftId(event.target.value)}
              placeholder={t("fast_track.placeholder")}
              className="w-full rounded-[10px] border border-driver-line bg-driver-card px-3 py-2.5 text-[14px]"
            />
            <button
              type="button"
              onClick={identify}
              className="rounded-[10px] bg-[#2e5b44] px-3 text-[12px] font-bold text-white"
            >
              {t("fast_track.check")}
            </button>
          </div>
        </label>

        {loading && !status ? <p className="text-sm text-vo-muted">{t("fast_track.checking")}</p> : null}
        {error ? <p className="rounded-xl border border-vo-bad-border bg-vo-bad-bg px-3 py-2 text-sm text-vo-bad-ink">{error}</p> : null}
        {confirmMessage ? <p className="rounded-xl border border-vo-good-border bg-vo-good-bg px-3 py-2 text-sm text-vo-good-ink">{confirmMessage}</p> : null}

        {status ? (
          <div className="space-y-3 rounded-[18px] border border-driver-line bg-driver-card p-4">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${occupancyTone(status.occupancy)}`}>
              {heading}
            </span>
            <p className="text-[16px] font-semibold">{status.name}</p>
            <p className="font-mono text-[11px] text-vo-muted">{status.charger_id}</p>
            <p className="text-[13px]">{status.driver_message}</p>
            <p className="text-[11px] text-vo-muted">
              {status.power_kw ? `${status.power_kw} kW` : t("common.power_fallback")}
              {status.price_per_kwh != null ? ` · ${formatInr(status.price_per_kwh)}/kWh` : ""}
            </p>
            <p className="text-[11px] text-vo-muted">{t("fast_track.poll_hint")}</p>
            <p className="text-[10px] uppercase tracking-wider text-vo-muted">
              {t("fast_track.source")}: {status.physical_status_source}
            </p>

            {status.occupancy === "AVAILABLE" ? (
              <button
                type="button"
                disabled={confirming || !status.bookable}
                onClick={() => void handleConfirm()}
                className="w-full rounded-full bg-[#2e5b44] py-3 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {confirming ? t("fast_track.confirming") : t("fast_track.book")}
              </button>
            ) : null}

            {status.occupancy === "OCCUPIED" || status.occupancy === "UNAVAILABLE" || status.occupancy === "RESERVED" ? (
              <div className="space-y-2">
                {alternative ? (
                  <Link
                    to={`/driver/charger/${alternative.charger_id}`}
                    className="block rounded-[12px] border border-vo-accent/30 bg-vo-bg px-3 py-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">{t("fast_track.find_alternative")}</p>
                    <p className="mt-1 text-[14px] font-semibold">{alternative.name}</p>
                    <p className="text-[12px] text-vo-muted">
                      {alternative.km.toFixed(1)} km · {Math.round(alternative.estimated_wait_minutes)} min {t("intel.stat.wait").toLowerCase()}
                    </p>
                  </Link>
                ) : (
                  <Link to="/driver" className="block text-center text-[13px] font-semibold text-vo-accent-ink">
                    {t("fast_track.find_alternative")}
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
