import { useEffect, useState } from "react";
import { Battery, BatteryMedium, Building2, Edit2, Gauge, Plus, RefreshCw, Route, Shuffle, Thermometer, Wind, Zap } from "lucide-react";
import type { DrivingProfile, Vehicle } from "../../types";
import { useVehicleRange } from "../../hooks/useApiData";
import { useT } from "../../i18n";

interface VehicleWidgetProps {
  vehicle: Vehicle | null;
  onAddVehicle: () => void;
  onEditVehicle: (vehicle: Vehicle) => void;
  onUpdateBattery: (vehicleId: string, newPct: number) => Promise<void>;
  /** Driver's current location (DriverHomePage's `origin` -- real GPS or
   * the centroid fallback either way) -- used only to look up ambient
   * temperature, both here (for display) and via useVehicleRange (for the
   * actual backend adjustment). Omit to skip temperature entirely. */
  location?: { latitude: number; longitude: number } | null;
  // Controlled, not local state: DriverHomePage's OWN useVehicleRange call
  // (used for the reachable-chargers filter) needs these same values, so
  // the filter and this widget's displayed range never disagree -- see
  // DriverHomePage.tsx.
  climateControl: boolean;
  onClimateControlChange: (value: boolean) => void;
  drivingProfile: DrivingProfile;
  onDrivingProfileChange: (value: DrivingProfile) => void;
}

// Mirrors range_service.py's constants -- used ONLY for the instant
// client-side preview while actively dragging the battery slider or
// flipping a control, before the settled value arrives from
// useVehicleRange (a real backend call, which is what DriverHomePage.tsx's
// charger filter actually uses). Never a second source of truth for the
// committed value, only for immediate feedback mid-interaction.
const PREVIEW_RESERVE_PCT = 10;
const PREVIEW_CLIMATE_CONTROL_MULTIPLIER = 0.9;
const PREVIEW_DRIVING_PROFILE_MULTIPLIERS: Record<DrivingProfile, number> = { city: 1.05, mixed: 1.0, highway: 0.85 };

// Mirrors backend/app/services/battery_health_service.py's constants --
// registration_date doesn't change while dragging the slider, but mirroring
// it here keeps the preview and settled values from ever visibly disagreeing.
const PREVIEW_FIRST_YEAR_LOSS_FRACTION = 0.05;
const PREVIEW_ANNUAL_LOSS_FRACTION_AFTER_YEAR_ONE = 0.018;
const PREVIEW_MIN_HEALTH_MULTIPLIER = 0.5;

function previewBatteryHealthMultiplier(registrationDate: string | null): number {
  if (!registrationDate) return 1;
  const ageDays = (Date.now() - new Date(registrationDate).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  const ageYears = ageDays / 365.25;
  const raw =
    ageYears <= 1
      ? 1 - PREVIEW_FIRST_YEAR_LOSS_FRACTION * ageYears
      : 1 - PREVIEW_FIRST_YEAR_LOSS_FRACTION - PREVIEW_ANNUAL_LOSS_FRACTION_AFTER_YEAR_ONE * (ageYears - 1);
  return Math.max(PREVIEW_MIN_HEALTH_MULTIPLIER, Math.min(1, raw));
}

function previewTemperatureMultiplier(tempC: number | null): number {
  if (tempC === null) return 1;
  if (tempC < 0) return 0.7;
  if (tempC < 15) return 0.85;
  if (tempC <= 35) return 1.0;
  if (tempC <= 45) return 0.9;
  return 0.85;
}

function previewRangeKm(
  vehicle: Vehicle,
  pct: number,
  buffered: boolean,
  outdoorTempC: number | null,
  climateControl: boolean,
  drivingProfile: DrivingProfile,
): number {
  const effectivePct = buffered ? Math.max(0, pct - PREVIEW_RESERVE_PCT) : pct;
  const availableKwh = (vehicle.battery_capacity_kwh * effectivePct) / 100;
  const kwhPerKm = (vehicle.efficiency_wh_km || 150) / 1000;
  const base = availableKwh / kwhPerKm;
  const multiplier =
    previewTemperatureMultiplier(outdoorTempC) *
    (climateControl ? PREVIEW_CLIMATE_CONTROL_MULTIPLIER : 1) *
    PREVIEW_DRIVING_PROFILE_MULTIPLIERS[drivingProfile] *
    previewBatteryHealthMultiplier(vehicle.registration_date);
  return Math.round(base * multiplier);
}

// Module-level (not component state): the point of caching is surviving
// remounts within the TTL, not just re-renders of one mounted instance.
const OPEN_METEO_CACHE_TTL_MS = 5 * 60 * 1000;
let temperatureCache: { key: string; tempC: number; fetchedAt: number } | null = null;

async function fetchOutdoorTemperature(latitude: number, longitude: number): Promise<number | null> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const now = Date.now();
  if (temperatureCache && temperatureCache.key === key && now - temperatureCache.fetchedAt < OPEN_METEO_CACHE_TTL_MS) {
    return temperatureCache.tempC;
  }
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`,
    );
    if (!res.ok) {
      return null;
    }
    const body: unknown = await res.json();
    const tempC = (body as { current?: { temperature_2m?: unknown } })?.current?.temperature_2m;
    if (typeof tempC !== "number") {
      return null;
    }
    temperatureCache = { key, tempC, fetchedAt: now };
    return tempC;
  } catch {
    return null; // a weather-display hiccup must never block the widget
  }
}

// labelKey resolved via t() inside the component -- this constant lives
// outside it, so it can't call useT() itself.
const DRIVING_PROFILE_OPTIONS: { value: DrivingProfile; labelKey: string; icon: typeof Building2 }[] = [
  { value: "city", labelKey: "vehicle_widget.profile.city", icon: Building2 },
  { value: "mixed", labelKey: "vehicle_widget.profile.mixed", icon: Shuffle },
  { value: "highway", labelKey: "vehicle_widget.profile.highway", icon: Route },
];

export function VehicleWidget({
  vehicle,
  onAddVehicle,
  onEditVehicle,
  onUpdateBattery,
  location,
  climateControl,
  onClimateControlChange,
  drivingProfile,
  onDrivingProfileChange,
}: VehicleWidgetProps) {
  const t = useT();
  const [updating, setUpdating] = useState(false);
  const [tempPct, setTempPct] = useState<number | null>(null);
  const [outdoorTempC, setOutdoorTempC] = useState<number | null>(null);

  // Only re-fetches when the location actually changes (geolocation in
  // DriverHomePage.tsx fetches once, not continuously) or the cache TTL
  // above has elapsed -- not on every render.
  useEffect(() => {
    if (!location) {
      setOutdoorTempC(null);
      return;
    }
    let cancelled = false;
    fetchOutdoorTemperature(location.latitude, location.longitude).then((tempC) => {
      if (!cancelled) {
        setOutdoorTempC(tempC);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [location]);

  const { data: range } = useVehicleRange(vehicle, {
    lat: location?.latitude,
    lon: location?.longitude,
    climateControl,
    drivingProfile,
  });

  if (!vehicle) {
    return (
      <div className="rounded-[12px] border border-dashed border-emerald-500/30 bg-emerald-500/5 p-5 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-driver-ink">{t("vehicle_widget.empty_title")}</h3>
          <p className="text-xs text-vo-muted mt-1">
            {t("vehicle_widget.empty_body")}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddVehicle}
          className="vo-hover-interactive inline-flex items-center space-x-1.5 px-4 py-2 rounded-[8px] bg-emerald-400 hover:bg-emerald-300 text-black font-semibold text-xs transition-all shadow-md shadow-emerald-400/10"
        >
          <Plus className="w-4 h-4" />
          <span>{t("common.add_your_ev")}</span>
        </button>
      </div>
    );
  }

  const currentPct = tempPct ?? vehicle.current_battery_pct;
  const dragging = tempPct !== null;

  // Prefer the real backend detail string (range.factors) once settled --
  // it's computed server-side from the actual registration_date. While
  // dragging/loading, fall back to a locally computed percentage so the
  // row never just disappears mid-interaction.
  const batteryHealthFactor = range?.factors.find((f) => f.key === "battery_health");
  const batteryHealthLabel = batteryHealthFactor
    ? batteryHealthFactor.detail
    : vehicle.registration_date
      ? t("vehicle_widget.battery_health_preview", { pct: Math.round(previewBatteryHealthMultiplier(vehicle.registration_date) * 100) })
      : t("vehicle_widget.registration_not_on_file");

  // While dragging (or immediately after flipping a control, before the
  // backend call resolves): instant local preview mirroring all three
  // adjustments. Settled: the real backend figures from useVehicleRange.
  const rawRangeKm = dragging || !range
    ? previewRangeKm(vehicle, currentPct, false, outdoorTempC, climateControl, drivingProfile)
    : Math.round(range.estimated_range_km);
  const bufferedRangeKm = dragging || !range
    ? previewRangeKm(vehicle, currentPct, true, outdoorTempC, climateControl, drivingProfile)
    : Math.round(range.buffered_range_km);

  async function handleSliderCommit(newVal: number) {
    setUpdating(true);
    try {
      await onUpdateBattery(vehicle!.id, newVal);
    } finally {
      setUpdating(false);
      setTempPct(null);
    }
  }

  return (
    <div className="rounded-[12px] border border-driver-line bg-driver-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-[6px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">{t("vehicle_widget.your_vehicle")}</span>
            <h3 className="text-base font-bold text-driver-ink">
              {vehicle.make} {vehicle.model}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onEditVehicle(vehicle)}
          className="vo-hover-interactive p-2 rounded-[8px] bg-driver-bg hover:bg-driver-line text-driver-muted transition-colors"
          title={t("vehicle_widget.edit_title")}
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        {/* Battery Card */}
        <div className="rounded-[8px] border border-vo-line bg-vo-card/80 p-3 flex flex-col justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-vo-muted mb-1">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("vehicle_widget.battery_level")}</span>
          </div>
          <div className="text-xl font-bold text-driver-ink flex items-baseline space-x-1">
            <span>{Math.round(currentPct)}</span>
            <span className="text-xs font-normal text-emerald-500">%</span>
          </div>
        </div>

        {/* Range Card */}
        <div className="rounded-[8px] border border-vo-line bg-vo-card/80 p-3 flex flex-col justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-vo-muted mb-1">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("vehicle_widget.est_range")}</span>
          </div>
          <div className="text-xl font-bold text-driver-ink flex items-baseline space-x-1">
            <span>{rawRangeKm}</span>
            <span className="text-xs font-normal text-emerald-500">km</span>
          </div>
          <p className="text-[10px] text-vo-muted mt-0.5">{t("vehicle_widget.range_with_reserve", { km: bufferedRangeKm })}</p>
        </div>
      </div>

      {/* Battery Percentage Slider */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs text-vo-muted">
          <span className="flex items-center space-x-1">
            <span>{t("vehicle_widget.update_charge")}</span>
            {updating ? <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" /> : null}
          </span>
          <span className="font-mono text-vo-accent-ink">{Math.round(currentPct)}%</span>
        </div>
        <input
          type="range"
          min="5"
          max="100"
          value={currentPct}
          onChange={(e) => setTempPct(Number(e.target.value))}
          onMouseUp={(e) => void handleSliderCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => void handleSliderCommit(Number((e.target as HTMLInputElement).value))}
          className="w-full h-2 bg-driver-line rounded-lg appearance-none cursor-pointer accent-emerald-400"
        />
      </div>

      {/* Range factors: temperature (read-only, live), climate control (toggle), driving profile (3-way) */}
      <div className="space-y-2.5 pt-1 border-t border-vo-line/40">
        <div className="flex items-center justify-between text-xs pt-2.5">
          <span className="flex items-center space-x-1.5 text-vo-muted">
            <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("vehicle_widget.outside_temp")}</span>
          </span>
          <span className="font-mono text-driver-ink">{outdoorTempC !== null ? `${outdoorTempC.toFixed(1)}°C` : "—"}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center space-x-1.5 text-vo-muted">
            <BatteryMedium className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("vehicle_widget.battery_health")}</span>
          </span>
          <span className="font-mono text-driver-ink text-right max-w-[60%]" title={batteryHealthLabel}>
            {vehicle.registration_date
              ? `~${Math.round((batteryHealthFactor?.multiplier ?? previewBatteryHealthMultiplier(vehicle.registration_date)) * 100)}%`
              : t("common.unknown")}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onClimateControlChange(!climateControl)}
          className={`vo-hover-interactive flex w-full items-center justify-between rounded-[8px] border px-3 py-2 text-xs transition-colors ${
            climateControl
              ? "border-emerald-500/40 bg-emerald-500/10 text-vo-accent-ink"
              : "border-vo-line bg-vo-card/80 text-vo-muted"
          }`}
        >
          <span className="flex items-center space-x-1.5">
            <Wind className="w-3.5 h-3.5" />
            <span>{t("vehicle_widget.ac_label")}</span>
          </span>
          <span className="font-semibold">{climateControl ? t("common.on") : t("common.off")}</span>
        </button>

        <div className="grid grid-cols-3 gap-1.5">
          {DRIVING_PROFILE_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onDrivingProfileChange(value)}
              className={`vo-hover-interactive flex flex-col items-center gap-1 rounded-[8px] border px-2 py-2 text-[11px] transition-colors ${
                drivingProfile === value
                  ? "border-emerald-500/40 bg-emerald-500/10 text-vo-accent-ink"
                  : "border-vo-line bg-vo-card/80 text-vo-muted"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
