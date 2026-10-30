import { useState, type FormEvent } from "react";
import { X, Zap, Trash2, Search } from "lucide-react";
import type { Vehicle, VehicleCreate, VehicleUpdate } from "../../types";
import { EV_CATALOG, findCatalogEntry, type EvCatalogEntry, type SpecSource } from "../../data/evCatalog";
import { useT } from "../../i18n";

// Keys into locales/en.json for evCatalog.ts's SOURCE_LABEL values -- kept
// here rather than in the data file so evCatalog.ts (shared, non-driver-only
// data) doesn't need to depend on the driver i18n context.
const SOURCE_LABEL_KEY: Record<SpecSource, string> = {
  manufacturer_real_world: "vehicle_modal.source.manufacturer_real_world",
  arai: "vehicle_modal.source.arai",
  estimated: "vehicle_modal.source.estimated",
};

interface VehicleModalProps {
  isOpen: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
  onSave: (payload: VehicleCreate | VehicleUpdate) => Promise<void>;
  onDelete?: (vehicleId: string) => Promise<void>;
}

const DEFAULT_ENTRY = findCatalogEntry("tata-nexon-ev-lr");

export function VehicleModal({
  isOpen,
  vehicle,
  onClose,
  onSave,
  onDelete,
}: VehicleModalProps) {
  const t = useT();
  // Editing an existing vehicle: we don't know which catalog entry (if any)
  // it came from, so start in free-text mode showing its current values --
  // same as before this catalog existed. Adding a new one: pre-fill from a
  // sensible catalog default, fully editable, same as picking one manually.
  const seedEntry = vehicle ? null : DEFAULT_ENTRY;

  const [make, setMake] = useState(vehicle?.make ?? seedEntry?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? seedEntry?.model ?? "");
  const [capacity, setCapacity] = useState(vehicle?.battery_capacity_kwh ?? seedEntry?.battery_capacity_kwh ?? 40);
  const [efficiency, setEfficiency] = useState(vehicle?.efficiency_wh_km ?? seedEntry?.efficiency_wh_km ?? 150);
  const [currentPct, setCurrentPct] = useState(vehicle?.current_battery_pct ?? 50);
  // Registration/purchase date -- optional. Used only to derive vehicle age
  // for the battery-health range factor (never re-typed as an age itself);
  // omitting it is a documented no-op, same as any other optional range input.
  const [registrationDate, setRegistrationDate] = useState(vehicle?.registration_date ?? "");
  const [pickedSpec, setPickedSpec] = useState<{ source: SpecSource; note: string } | null>(
    seedEntry ? { source: seedEntry.source, note: seedEntry.note } : null,
  );
  const [catalogQuery, setCatalogQuery] = useState(vehicle ? "" : `${seedEntry?.make ?? ""} ${seedEntry?.model ?? ""}`.trim());
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredCatalog =
    catalogQuery.trim().length === 0
      ? EV_CATALOG
      : EV_CATALOG.filter((entry) => `${entry.make} ${entry.model}`.toLowerCase().includes(catalogQuery.toLowerCase()));

  function selectCatalogEntry(entry: EvCatalogEntry) {
    setMake(entry.make);
    setModel(entry.model);
    setCapacity(entry.battery_capacity_kwh);
    setEfficiency(entry.efficiency_wh_km);
    setPickedSpec({ source: entry.source, note: entry.note });
    setCatalogQuery(`${entry.make} ${entry.model}`);
    setCatalogOpen(false);
  }

  function selectCustomVehicle() {
    setPickedSpec(null);
    setCatalogQuery("");
    setCatalogOpen(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        make,
        model,
        battery_capacity_kwh: Number(capacity),
        efficiency_wh_km: Number(efficiency),
        current_battery_pct: Number(currentPct),
        is_primary: true,
        registration_date: registrationDate.trim() === "" ? null : registrationDate,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("vehicle_modal.error_save"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!vehicle || !onDelete) return;
    if (!confirm(t("vehicle_modal.confirm_delete"))) return;
    setSaving(true);
    try {
      await onDelete(vehicle.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("vehicle_modal.error_delete"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-vo-line bg-vo-card p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto text-vo-text">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-vo-muted hover:text-vo-text hover:bg-vo-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2.5 text-emerald-400">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-vo-text">
            {vehicle ? t("vehicle_modal.title_edit") : t("common.add_your_ev")}
          </h2>
        </div>

        {error ? <p className="text-xs text-vo-red">{error}</p> : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 text-xs">
          <div className="relative">
            <label className="block font-semibold text-vo-muted mb-1 uppercase tracking-wider">
              {t("vehicle_modal.find_vehicle_label")}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-vo-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={catalogQuery}
                onChange={(e) => {
                  setCatalogQuery(e.target.value);
                  setCatalogOpen(true);
                }}
                onFocus={() => setCatalogOpen(true)}
                placeholder="Search e.g. Nexon, Ather 450X, Treo..."
                className="w-full rounded-xl border border-vo-line bg-vo-elevated pl-8 pr-3 py-2.5 text-vo-text focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {catalogOpen ? (
              <ul className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto rounded-xl border border-vo-line bg-vo-card shadow-2xl">
                {(["2W", "3W", "4W"] as const).map((segment) => {
                  const rows = filteredCatalog.filter((entry) => entry.segment === segment);
                  if (rows.length === 0) return null;
                  return (
                    <li key={segment}>
                      <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-vo-muted">{segment}</p>
                      {rows.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectCatalogEntry(entry);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5"
                        >
                          <span className="text-vo-text">
                            {entry.make} {entry.model}
                          </span>
                          <span className="text-[10px] text-vo-muted shrink-0">{entry.battery_capacity_kwh} kWh</span>
                        </button>
                      ))}
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectCustomVehicle();
                    }}
                    className="w-full px-3 py-2 text-left text-vo-accent border-t border-vo-line/60 hover:bg-white/5"
                  >
                    {t("vehicle_modal.not_listed")}
                  </button>
                </li>
              </ul>
            ) : null}
          </div>

          {pickedSpec ? (
            <p className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 text-[11px] text-vo-soft">
              <span className="font-semibold text-emerald-400">{t(SOURCE_LABEL_KEY[pickedSpec.source])}: </span>
              {pickedSpec.note}
            </p>
          ) : null}

          <div>
            <label className="block font-semibold text-vo-muted mb-1 uppercase tracking-wider">{t("vehicle_modal.make_label")}</label>
            <input
              type="text"
              required
              value={make}
              onChange={(e) => {
                setMake(e.target.value);
                setPickedSpec(null);
              }}
              placeholder="e.g. Tata / MG / Hyundai"
              className="w-full rounded-xl border border-vo-line bg-vo-card px-3 py-2.5 text-vo-text focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-vo-muted mb-1 uppercase tracking-wider">{t("vehicle_modal.model_label")}</label>
            <input
              type="text"
              required
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setPickedSpec(null);
              }}
              placeholder="e.g. Nexon EV / ZS EV / Ioniq 5"
              className="w-full rounded-xl border border-vo-line bg-vo-card px-3 py-2.5 text-vo-text focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-vo-muted mb-1 uppercase tracking-wider">{t("vehicle_modal.capacity_label")}</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="200"
                required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full rounded-xl border border-vo-line bg-vo-card px-3 py-2.5 text-vo-text focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-vo-muted mb-1 uppercase tracking-wider">{t("vehicle_modal.efficiency_label")}</label>
              <input
                type="number"
                step="1"
                min="15"
                max="400"
                required
                value={efficiency}
                onChange={(e) => setEfficiency(Number(e.target.value))}
                className="w-full rounded-xl border border-vo-line bg-vo-card px-3 py-2.5 text-vo-text focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-vo-muted mb-1 uppercase tracking-wider">
              {t("vehicle_modal.registration_label")} <span className="normal-case font-normal text-vo-muted/70">{t("vehicle_modal.optional")}</span>
            </label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={registrationDate}
              onChange={(e) => setRegistrationDate(e.target.value)}
              className="w-full rounded-xl border border-vo-line bg-vo-card px-3 py-2.5 text-vo-text focus:border-emerald-400 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-vo-muted">
              {t("vehicle_modal.registration_hint")}
            </p>
          </div>

          <div>
            <div className="flex justify-between font-semibold text-vo-muted mb-1 uppercase tracking-wider">
              <span>{t("vehicle_modal.current_battery_label")}</span>
              <span className="text-emerald-400 font-mono">{currentPct}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              value={currentPct}
              onChange={(e) => setCurrentPct(Number(e.target.value))}
              className="w-full h-2 bg-driver-line rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            {vehicle && onDelete ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                title={t("vehicle_modal.delete_title")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : <div />}

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-vo-line text-vo-muted hover:text-vo-text transition-colors"
              >
                {t("vehicle_modal.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-semibold transition-all shadow-md shadow-emerald-400/10"
              >
                {saving ? t("vehicle_modal.saving") : t("vehicle_modal.save_vehicle")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
