import { ArrowLeft, Navigation } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";

import { DriverMap } from "../../components/driver/DriverMap";
import { StatusBar } from "../../components/driver/StatusBar";
import { ScreenState } from "../../components/common/ScreenState";
import { useCharger, useChargers } from "../../hooks/useApiData";
import { formatInr, formatKm } from "../../utils/format";
import { centroid, haversineKm } from "../../utils/geo";
import { loadDriverDiscoveryState } from "../../utils/driverDiscoveryState";
import { useT } from "../../i18n";

export function ChargerDetailsPage() {
  const t = useT();
  const { chargerId } = useParams<{ chargerId: string }>();
  const navigate = useNavigate();
  const { data: charger, error, loading } = useCharger(chargerId);
  const all = useChargers();
  const storedSearch = useMemo(() => loadDriverDiscoveryState()?.searchedLocation ?? null, []);

  const origin = useMemo(
    () => storedSearch ?? centroid(all.data ?? []),
    [all.data, storedSearch],
  );

  const siblings = useMemo(() => {
    if (!charger || charger.site_id === null) {
      return charger ? [charger] : [];
    }
    return (all.data ?? []).filter((item) => item.site_id === charger.site_id);
  }, [all.data, charger]);

  const km = charger ? haversineKm(origin.latitude, origin.longitude, charger.latitude, charger.longitude) : 0;
  const isReal = charger?.provenance === "REAL";

  return (
    <div className="flex min-h-screen flex-col bg-driver-bg pb-28 text-driver-ink">
      {/* 1. Large Clean Location Map Preview */}
      <div className="relative h-[340px] w-full border-b border-driver-line shadow-xs">
        {charger ? (
          <DriverMap
            chargers={siblings.length ? siblings : [charger]}
            origin={origin}
            selectedChargerId={charger.id}
            onSelectCharger={(id) => {
              if (id === null) {
                if (window.history.length > 1) {
                  void navigate(-1);
                } else {
                  void navigate("/driver");
                }
              }
            }}
          />
        ) : (
          <div className="h-full bg-[#f2f4f2] animate-pulse" />
        )}
        <div className="absolute inset-x-0 top-0 pointer-events-none">
          <StatusBar />
          <div className="px-5 mt-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  void navigate(-1);
                } else {
                  void navigate("/driver");
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur text-driver-ink shadow-md border border-driver-line hover:bg-white transition-colors"
              aria-label={t("common.back")}
            >
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>
      </div>

      <ScreenState
        loading={loading}
        error={error}
        tone="light"
        loadingText={t("common.loading")}
        errorLabel={t("common.load_error_prefix")}
      >
        {charger ? (
          <div className="px-5 pt-6">
            {/* Charger Main Title & Meta */}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[26px] leading-tight font-bold text-driver-ink">
                  {charger.name.replace(" (demo)", "")}
                </h1>
                {isReal ? (
                  <span className="rounded-full bg-[#f0f4f8] border border-[#d6e0ea] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#476072]">
                    OpenChargeMap
                  </span>
                ) : charger.provenance === "DEMO" ? (
                  <span className="rounded-full bg-[#f7f1e4] border border-[#e6d7b8] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#8a6a2f]">
                    Demo
                  </span>
                ) : (
                  <span className="rounded-full bg-[#edf6f0] border border-[#cbe4d3] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#3d7a5a]">
                    VidyutOne
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-driver-muted">
                {charger.connector_type} · {isReal ? t("charger_details.descriptor.verified") : t("charger_details.descriptor.hub")}
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-[12px]">
                <span
                  className={`h-2 w-2 rounded-full ${
                    charger.availability === true
                      ? "bg-[#6b9e78]"
                      : charger.availability === false
                        ? "bg-[#c5a66a]"
                        : "bg-slate-400"
                  }`}
                />
                <span className="text-driver-ink font-medium">
                  {charger.availability === true
                    ? t("charger_details.status.operational_ready")
                    : charger.availability === false
                      ? t("charger_details.status.currently_in_use")
                      : t("charger_details.status.operational_status_reported")}
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Metric label={t("charger_details.metric.distance")} value={formatKm(km)} />
              <Metric label={t("charger_details.metric.eta")} value={`${Math.max(4, Math.round(km * 4))} mins`} />
              <Metric
                label={t("charger_details.metric.power")}
                value={charger.power_kw !== null ? `${charger.power_kw} kW` : t("common.power_fallback")}
              />
              <Metric
                label={t("charger_details.metric.tariff")}
                value={
                  charger.price_per_kwh !== null
                    ? `${formatInr(charger.price_per_kwh)} /kWh`
                    : "₹18.00 /kWh"
                }
                sublabel={isReal && charger.price_per_kwh === 18 ? t("charger_details.vidyutone_tariff") : undefined}
              />
              <Metric
                label={t("charger_details.metric.wait")}
                value={charger.availability === true ? "0 min" : charger.availability === false ? "15 min" : t("charger_details.wait.low")}
              />
              <Metric label={t("charger_details.metric.connector")} value={charger.connector_type} />
            </div>

            {/* Connectors / Bays Section */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-driver-ink">{t("charger_details.bays_heading")}</h2>
                <span className="text-[10px] font-semibold tracking-wider text-driver-muted uppercase">
                  {siblings.length === 1
                    ? t("charger_details.bays_total_singular", { count: siblings.length || 1 })
                    : t("charger_details.bays_total_plural", { count: siblings.length || 1 })}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-driver-line rounded-2xl border border-driver-line bg-driver-card px-4">
                {(siblings.length ? siblings : [charger]).map((bay, index) => (
                  <li key={bay.id} className="flex items-center justify-between py-3 text-[13px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          bay.availability === true ? "bg-[#6b9e78]" : "bg-[#c5a66a]"
                        }`}
                      />
                      <span className="font-medium text-driver-ink">
                        {t("charger_details.bay_prefix")} {String(index + 1).padStart(2, "0")} · {bay.connector_type}
                      </span>
                      <span className="text-[12px] text-driver-muted">
                        ({bay.power_kw !== null ? `${bay.power_kw} kW` : t("common.standard")})
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold tracking-wider uppercase ${
                        bay.availability === true ? "text-[#3d7a5a]" : "text-[#9e7d3b]"
                      }`}
                    >
                      {bay.availability === true ? t("common.charger_status.available") : t("charger_details.bay_in_use")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bottom action bar: Navigate + Book Now */}
            <div className="fixed bottom-5 left-1/2 z-30 flex w-[min(382px,calc(100%-40px))] -translate-x-1/2 items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${charger.latitude},${charger.longitude}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#e2ebe4] border border-[#cbe4d3] px-5 text-[14px] font-semibold text-[#1e4530] hover:bg-[#d6e5d9] transition-colors shadow-sm shrink-0 cursor-pointer"
              >
                <Navigation size={16} />
                {t("common.navigate")}
              </button>
              <Link
                to={`/driver/charger/${charger.id}/book`}
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[#2e5b44] text-[14px] font-semibold text-white shadow-md hover:bg-[#254b38] active:bg-[#1d3c2d] transition-colors cursor-pointer"
              >
                {t("common.book_now")}
              </Link>
            </div>
          </div>
        ) : null}
      </ScreenState>
    </div>
  );
}

function Metric({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-[18px] border border-driver-line bg-driver-card px-4 py-3 shadow-[0_4px_16px_rgba(16,24,20,0.03)]">
      <p className="text-[10px] font-bold tracking-[0.14em] text-driver-muted uppercase">{label}</p>
      <p className="mt-1 text-[17px] font-semibold text-driver-ink leading-snug">{value}</p>
      {sublabel && <p className="mt-0.5 text-[10px] text-driver-muted font-medium">{sublabel}</p>}
    </div>
  );
}
