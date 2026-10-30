import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, PlugZap, Plus, RefreshCw } from "lucide-react";

import { ScreenState } from "../../components/common/ScreenState";
import { ThemeToggle } from "../../components/common/ThemeToggle";
import { OperatorValuePanels } from "../../components/operator/OperatorValuePanels";
import { useAuth } from "../../hooks/useAuth";
import {
  createOperatorCharger,
  getOperatorAnalytics,
  getOperatorBookings,
  getOperatorChargers,
  updateOperatorCharger,
  simulateOperatorPhysicalStatus,
} from "../../services/api";
import type { OperatorAnalytics, OperatorBooking, OperatorCharger } from "../../types";
import { formatInr } from "../../utils/format";
import { isOperatorDemoProfile } from "../../lib/operatorDemo";

const STATUSES = ["AVAILABLE", "OFFLINE", "MAINTENANCE"] as const;
const PHYSICAL = ["AVAILABLE", "PREPARING", "CHARGING", "FINISHING", "UNAVAILABLE", "FAULTED"] as const;

function occupancyLabel(value: string): string {
  if (value === "AVAILABLE") return "Available";
  if (value === "RESERVED") return "Reserved";
  if (value === "OCCUPIED") return "Occupied";
  if (value === "MAINTENANCE") return "Maintenance";
  if (value === "OFFLINE") return "Offline";
  if (value === "UNAVAILABLE") return "Unavailable";
  return value;
}

function occupancyClass(value: string): string {
  if (value === "AVAILABLE") return "bg-vo-good-bg text-vo-good-ink border-vo-good-border";
  if (value === "RESERVED") return "bg-vo-warn-bg text-vo-warn-ink border-vo-warn-border";
  if (value === "OCCUPIED") return "bg-vo-bad-bg text-vo-bad-ink border-vo-bad-border";
  if (value === "UNAVAILABLE") return "bg-vo-bad-bg text-vo-bad-ink border-vo-bad-border";
  return "bg-vo-card text-vo-muted border-vo-line";
}

export function OperatorDashboardPage() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const demoMode = isOperatorDemoProfile(profile);

  const [chargers, setChargers] = useState<OperatorCharger[]>([]);
  const [bookings, setBookings] = useState<OperatorBooking[]>([]);
  const [analytics, setAnalytics] = useState<OperatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("12.9716");
  const [longitude, setLongitude] = useState("77.5946");
  const [powerKw, setPowerKw] = useState("60");
  const [price, setPrice] = useState("18");
  const [connector, setConnector] = useState("CCS2");

  async function loadData(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [nextChargers, nextBookings, nextAnalytics] = await Promise.all([
        getOperatorChargers(),
        getOperatorBookings(),
        getOperatorAnalytics(),
      ]);
      setChargers(nextChargers);
      setBookings(nextBookings);
      setAnalytics(nextAnalytics);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load operator dashboard.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadData();
    const interval = window.setInterval(() => {
      void loadData(true);
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const lat = Number(latitude);
    const lon = Number(longitude);
    const power = Number(powerKw);
    const tariff = Number(price);
    if (!name.trim()) {
      setFormError("Enter a station name.");
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(power) || !Number.isFinite(tariff)) {
      setFormError("Enter valid coordinates, power, and price.");
      return;
    }
    setSaving(true);
    try {
      const created = await createOperatorCharger({
        name: name.trim(),
        latitude: lat,
        longitude: lon,
        power_kw: power,
        price_per_kwh: tariff,
        connector_type: connector.trim() || "CCS2",
      });
      setChargers((current) => [created, ...current]);
      setName("");
      setShowForm(false);
      const next = await getOperatorAnalytics();
      setAnalytics(next);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not add station.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(chargerId: string, status: string) {
    setUpdatingId(chargerId);
    setActionError(null);
    try {
      const updated = await updateOperatorCharger(chargerId, { status });
      setChargers((current) => current.map((row) => (row.id === chargerId ? updated : row)));
      const next = await getOperatorAnalytics();
      setAnalytics(next);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not update charger status.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handlePhysical(chargerId: string, physicalStatus: string) {
    setUpdatingId(chargerId);
    setActionError(null);
    try {
      const updated = await simulateOperatorPhysicalStatus(chargerId, physicalStatus);
      setChargers((current) => current.map((row) => (row.id === chargerId ? updated : row)));
      const next = await getOperatorAnalytics();
      setAnalytics(next);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not simulate physical status.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-screen pb-12 bg-vo-bg text-vo-text">
      <header className="sticky top-0 z-20 border-b border-vo-line bg-vo-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4F6F9F] text-white">
              <PlugZap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight">VidyutOne</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-vo-muted">
                {demoMode ? "Operator Demo Mode" : "Operator console"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="truncate text-xs font-bold">{profile?.full_name ?? "Operator"}</p>
              <p className="truncate text-[11px] text-vo-muted">{profile?.organization ?? "Private charging"}</p>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-vo-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <ScreenState loading={loading} error={error} empty={false}>
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">Station overview</h1>
              <p className="text-xs text-vo-muted">
                {demoMode
                  ? "Demo Operator catalog — isolated from production chargers. Bookings are anonymized."
                  : "Your chargers only. Bookings are anonymized — no driver names or emails."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-xl border border-vo-line p-2 text-vo-muted hover:text-vo-text"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {actionError ? (
            <p className="rounded-xl border border-vo-bad-border bg-vo-bad-bg px-3 py-2 text-sm text-vo-bad-ink">{actionError}</p>
          ) : null}

          {analytics ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi label="Stations" value={String(analytics.total_stations)} hint="Chargers you operate" />
              <Kpi label="Available now" value={String(analytics.available_chargers)} hint={`${analytics.occupied_chargers} occupied / reserved`} />
              <Kpi label="Utilization" value={`${analytics.utilization_pct}%`} hint="Occupied plugs ÷ your chargers" />
              <Kpi label="Revenue" value={formatInr(analytics.revenue)} hint={demoMode ? "DEMO counted booking prices" : "Sum of counted booking prices"} />
              <Kpi
                label="Avg booking"
                value={analytics.average_booking_value != null ? formatInr(analytics.average_booking_value) : "—"}
                hint={`${analytics.total_bookings} counted bookings`}
              />
            </div>
          ) : null}

          {analytics ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-vo-muted">Upcoming bookings</p>
                <p className="font-mono text-2xl font-bold">{analytics.upcoming_bookings}</p>
                <p className="text-xs text-vo-muted">{analytics.total_bookings} counted bookings total</p>
              </div>
              <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-vo-muted">Peak usage</p>
                <p className="text-lg font-bold">{analytics.peak_usage_period ?? "Not enough bookings yet"}</p>
                <p className="text-xs text-vo-muted">Derived from your counted booking hours</p>
              </div>
              <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-vo-muted">Repeat users</p>
                <p className="font-mono text-2xl font-bold">{analytics.repeat_users ?? "—"}</p>
                <p className="text-xs text-vo-muted">Anonymized ids with 2+ counted bookings</p>
              </div>
            </div>
          ) : null}

          {analytics ? (
            <OperatorValuePanels
              demo={demoMode}
              insights={analytics.insights ?? []}
              stationInsights={analytics.station_insights ?? []}
            />
          ) : null}
          {analytics?.provenance_note ? <p className="text-[11px] text-vo-muted">{analytics.provenance_note}</p> : null}

          <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold">Your chargers</h2>
                <p className="text-xs text-vo-muted">Status is stored. Occupied / reserved is derived from overlapping bookings.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F6F9F] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3F5F8F]"
              >
                <Plus className="h-3.5 w-3.5" />
                {showForm ? "Close" : "Add station"}
              </button>
            </div>

            {showForm ? (
              <form onSubmit={(event) => void handleCreate(event)} className="grid gap-3 rounded-xl border border-vo-line bg-vo-bg p-4 sm:grid-cols-2 lg:grid-cols-3">
                {formError ? <p className="sm:col-span-2 lg:col-span-3 text-sm text-vo-bad-ink">{formError}</p> : null}
                <label className="space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-vo-muted">Name</span>
                  <input className="w-full rounded-lg border border-vo-line bg-vo-card px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-vo-muted">Latitude</span>
                  <input className="w-full rounded-lg border border-vo-line bg-vo-card px-3 py-2" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-vo-muted">Longitude</span>
                  <input className="w-full rounded-lg border border-vo-line bg-vo-card px-3 py-2" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-vo-muted">Power (kW)</span>
                  <input className="w-full rounded-lg border border-vo-line bg-vo-card px-3 py-2" value={powerKw} onChange={(e) => setPowerKw(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-vo-muted">Price / kWh</span>
                  <input className="w-full rounded-lg border border-vo-line bg-vo-card px-3 py-2" value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-vo-muted">Connector</span>
                  <input className="w-full rounded-lg border border-vo-line bg-vo-card px-3 py-2" value={connector} onChange={(e) => setConnector(e.target.value)} />
                </label>
                <div className="sm:col-span-2 lg:col-span-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#4F6F9F] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Adding…" : "Save station"}
                  </button>
                </div>
              </form>
            ) : null}

            {chargers.length === 0 ? (
              <p className="rounded-xl border border-vo-line bg-vo-bg px-4 py-6 text-center text-sm text-vo-muted">
                No stations yet. Add a charger to appear in driver discovery.
              </p>
            ) : (
              <div className="space-y-3">
                {chargers.map((charger) => (
                  <div key={charger.id} className="flex flex-col gap-3 rounded-xl border border-vo-line bg-vo-bg p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{charger.name}</p>
                      <p className="text-xs text-vo-muted">
                        {charger.power_kw} kW · {formatInr(charger.price_per_kwh)}/kWh · {charger.connector_type}
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-vo-muted">
                        {charger.latitude.toFixed(4)}, {charger.longitude.toFixed(4)}
                      </p>
                      <p className="mt-1 text-[11px] text-vo-muted">
                        Physical: {charger.physical_status ?? "AVAILABLE"} · source {charger.physical_status_source ?? "MANUAL"}
                      </p>
                      {charger.unexpected_occupancy ? (
                        <p className="mt-1 text-[11px] font-semibold text-vo-bad-ink">Unexpected occupancy detected</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-vo-muted">
                        QR (charger identity only): {typeof window !== "undefined" ? window.location.origin : ""}
                        {charger.qr_path ?? `/charger/${charger.id}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${occupancyClass(charger.occupancy)}`}>
                        {occupancyLabel(charger.occupancy)}
                      </span>
                      <select
                        value={charger.physical_status ?? "AVAILABLE"}
                        disabled={updatingId === charger.id}
                        onChange={(event) => void handlePhysical(charger.id, event.target.value)}
                        className="rounded-lg border border-vo-line bg-vo-card px-2 py-1.5 text-xs"
                        title="Simulator only — writes status_source=SIMULATOR"
                      >
                        {PHYSICAL.map((status) => (
                          <option key={status} value={status}>
                            Simulate {status}
                          </option>
                        ))}
                      </select>
                      <select
                        value={charger.status}
                        disabled={updatingId === charger.id}
                        onChange={(event) => void handleStatus(charger.id, event.target.value)}
                        className="rounded-lg border border-vo-line bg-vo-card px-2 py-1.5 text-xs"
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold">Bookings</h2>
              <p className="text-xs text-vo-muted">Slot, price, and status only — no customer identity.</p>
            </div>
            {bookings.length === 0 ? (
              <p className="text-sm text-vo-muted">No bookings on your chargers yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-vo-muted uppercase tracking-wider">
                    <tr>
                      <th className="pb-2 font-semibold">Charger</th>
                      <th className="pb-2 font-semibold">Slot (UTC)</th>
                      <th className="pb-2 font-semibold">Window</th>
                      <th className="pb-2 font-semibold">Duration</th>
                      <th className="pb-2 font-semibold">Price</th>
                      <th className="pb-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking.id} className="border-t border-vo-line/70">
                        <td className="py-2.5 font-medium">{booking.charger_name}</td>
                        <td className="py-2.5 font-mono">{new Date(booking.slot_time).toISOString().slice(0, 16).replace("T", " ")}</td>
                        <td className="py-2.5">{booking.window_label}</td>
                        <td className="py-2.5">{booking.duration_minutes} min</td>
                        <td className="py-2.5">{formatInr(booking.price)}</td>
                        <td className="py-2.5">{booking.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </ScreenState>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-vo-line bg-vo-card p-5 space-y-1 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-vo-muted">{label}</p>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <p className="text-xs text-vo-muted">{hint}</p>
    </div>
  );
}
