import type { Charger } from "../types";

export type ChargerSort = "nearest" | "cheapest" | "fastest";
export type BookableFilter = "all" | "bookable" | "info";
export type AvailabilityFilter = "all" | "available" | "unavailable" | "unknown";

export interface ChargerFilterState {
  sort: ChargerSort;
  bookable: BookableFilter;
  availability: AvailabilityFilter;
  connector: string;
  maxPrice: number | null;
}

export const DEFAULT_CHARGER_FILTERS: ChargerFilterState = {
  sort: "nearest",
  bookable: "all",
  availability: "all",
  connector: "all",
  maxPrice: null,
};

export function isChargerBookable(charger: Pick<Charger, "bookable">): boolean {
  return charger.bookable !== false;
}

export function hasValidCoordinates(point: { latitude: number; longitude: number }): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export interface FilterableChargerRow {
  km: number;
  charger: Charger;
}

export function applyChargerFilters<T extends FilterableChargerRow>(
  rows: T[],
  filters: ChargerFilterState,
): T[] {
  let list = rows.filter((row) => {
    if (filters.bookable === "bookable" && !isChargerBookable(row.charger)) {
      return false;
    }
    if (filters.bookable === "info" && isChargerBookable(row.charger)) {
      return false;
    }
    if (filters.availability === "available" && row.charger.availability !== true) {
      return false;
    }
    if (filters.availability === "unavailable" && row.charger.availability !== false) {
      return false;
    }
    if (filters.availability === "unknown" && row.charger.availability !== null) {
      return false;
    }
    if (filters.connector !== "all" && row.charger.connector_type !== filters.connector) {
      return false;
    }
    if (filters.maxPrice !== null) {
      if (row.charger.price_per_kwh === null) {
        return false;
      }
      if (row.charger.price_per_kwh > filters.maxPrice) {
        return false;
      }
    }
    return true;
  });

  list = [...list].sort((a, b) => {
    if (filters.sort === "cheapest") {
      const aPrice = a.charger.price_per_kwh;
      const bPrice = b.charger.price_per_kwh;
      if (aPrice === null && bPrice === null) {
        return a.km - b.km;
      }
      if (aPrice === null) {
        return 1;
      }
      if (bPrice === null) {
        return -1;
      }
      if (aPrice !== bPrice) {
        return aPrice - bPrice;
      }
      return a.km - b.km;
    }
    if (filters.sort === "fastest") {
      const aPower = a.charger.power_kw;
      const bPower = b.charger.power_kw;
      if (aPower === null && bPower === null) {
        return a.km - b.km;
      }
      if (aPower === null) {
        return 1;
      }
      if (bPower === null) {
        return -1;
      }
      if (aPower !== bPower) {
        return bPower - aPower;
      }
      return a.km - b.km;
    }
    return a.km - b.km;
  });

  return list;
}

export function uniqueConnectors(chargers: Charger[]): string[] {
  return [...new Set(chargers.map((charger) => charger.connector_type).filter(Boolean))].sort();
}
