// Curated real Indian-market EV catalog. Segments matter here because the
// project's own problem statement centers on 2W/3W as the majority of
// India's EV fleet, not just 4W passenger cars.
//
// efficiency_wh_km is derived from the BEST real range figure findable for
// each vehicle, preferring a manufacturer-quoted real-world range over the
// ARAI test-cycle figure where both exist -- ARAI's lab cycle is known to
// overstate range, and this app uses efficiency to decide which chargers a
// driver can actually reach, so an optimistic number would be actively
// misleading rather than just imprecise. `source` and `note` say exactly
// where each number came from; `source: "estimated"` entries are ARAI
// figures derated by ~22%, the gap observed between ARAI and real-world on
// the two comparable vehicles here where both figures were published
// (Nexon EV LR: 489 ARAI -> ~360 real; MG ZS EV: 461 ARAI -> ~385 real).
//
// Figures checked August 2026; battery/efficiency specs on these vehicles
// do change across model-year revisions, so re-verify before relying on
// this for anything beyond the demo.

export type VehicleSegment = "2W" | "3W" | "4W";

export type SpecSource =
  | "manufacturer_real_world" // manufacturer's own quoted real-world range
  | "arai" // ARAI test-cycle certified range, used directly (no real-world figure published)
  | "estimated"; // ARAI range derated ~22% -- see module docstring

export interface EvCatalogEntry {
  id: string;
  make: string;
  model: string;
  segment: VehicleSegment;
  battery_capacity_kwh: number;
  efficiency_wh_km: number;
  source: SpecSource;
  note: string;
}

export const EV_CATALOG: EvCatalogEntry[] = [
  // -- 2W --
  {
    id: "ola-s1-pro-gen2",
    make: "Ola Electric",
    model: "S1 Pro Gen 2",
    segment: "2W",
    battery_capacity_kwh: 4.0,
    efficiency_wh_km: 30,
    source: "manufacturer_real_world",
    note: "Ola's claimed real-world range in Normal mode (135 km on 4 kWh); ARAI-certified figure is higher (~195 km) but not used here.",
  },
  {
    id: "ather-450x",
    make: "Ather",
    model: "450X (3.7 kWh)",
    segment: "2W",
    battery_capacity_kwh: 3.7,
    efficiency_wh_km: 28,
    source: "manufacturer_real_world",
    note: "Ather's TrueRange (real-world, SmartEco mode) claim of ~130 km; ARAI-certified is 161 km.",
  },
  {
    id: "tvs-iqube-st",
    make: "TVS",
    model: "iQube ST",
    segment: "2W",
    battery_capacity_kwh: 5.3,
    efficiency_wh_km: 25,
    source: "arai",
    note: "ARAI-certified range (212 km) -- no manufacturer real-world figure published.",
  },

  // -- 3W --
  {
    id: "mahindra-treo-plus",
    make: "Mahindra",
    model: "Treo Plus",
    segment: "3W",
    battery_capacity_kwh: 10.24,
    efficiency_wh_km: 68,
    source: "manufacturer_real_world",
    note: "Real-world range up to ~150 km on a full charge; ARAI-certified is 167 km.",
  },
  {
    id: "piaggio-ape-e-city",
    make: "Piaggio",
    model: "Ape E-City (fixed battery)",
    segment: "3W",
    battery_capacity_kwh: 7.5,
    efficiency_wh_km: 68,
    source: "manufacturer_real_world",
    note: "Manufacturer-quoted driving range of 110 km on the fixed 7.5 kWh pack.",
  },

  // -- 4W --
  {
    id: "tata-nexon-ev-lr",
    make: "Tata",
    model: "Nexon EV (Long Range, 45 kWh)",
    segment: "4W",
    battery_capacity_kwh: 45.0,
    efficiency_wh_km: 125,
    source: "manufacturer_real_world",
    note: "Tata's own real-world claim of 350-370 km (midpoint used); ARAI-certified is 489 km.",
  },
  {
    id: "mg-zs-ev",
    make: "MG",
    model: "ZS EV",
    segment: "4W",
    battery_capacity_kwh: 50.3,
    efficiency_wh_km: 131,
    source: "manufacturer_real_world",
    note: "Real-world range reported as 350-420 km (midpoint used); ARAI-certified is 461 km.",
  },
  {
    id: "hyundai-kona-electric",
    make: "Hyundai",
    model: "Kona Electric",
    segment: "4W",
    battery_capacity_kwh: 39.2,
    efficiency_wh_km: 111,
    source: "estimated",
    note: "No manufacturer real-world figure found. ARAI-certified range (452 km) derated ~22% to align with the ARAI-to-real-world gap seen on comparable 4Ws above.",
  },
  {
    id: "tata-tiago-ev-24",
    make: "Tata",
    model: "Tiago EV (24 kWh)",
    segment: "4W",
    battery_capacity_kwh: 24.0,
    efficiency_wh_km: 108,
    source: "estimated",
    note: "No manufacturer real-world figure found. ARAI-certified range (285 km) derated ~22%, same basis as the Kona Electric entry above.",
  },
];

export const CUSTOM_VEHICLE_ID = "custom";

export function findCatalogEntry(id: string): EvCatalogEntry | undefined {
  return EV_CATALOG.find((entry) => entry.id === id);
}

export function catalogMakes(): string[] {
  return Array.from(new Set(EV_CATALOG.map((entry) => entry.make))).sort();
}

export function catalogModelsForMake(make: string): EvCatalogEntry[] {
  return EV_CATALOG.filter((entry) => entry.make === make);
}

export const SOURCE_LABEL: Record<SpecSource, string> = {
  manufacturer_real_world: "Real-world (manufacturer)",
  arai: "ARAI certified",
  estimated: "Estimated",
};
