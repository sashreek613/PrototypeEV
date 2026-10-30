import { describe, expect, it } from "vitest";

import { applyChargerFilters, hasValidCoordinates, isChargerBookable } from "./chargerFilters";
import type { Charger } from "../types";

function charger(partial: Partial<Charger> & Pick<Charger, "id">): Charger {
  return {
    name: partial.id,
    latitude: 12.97,
    longitude: 77.59,
    power_kw: 22,
    price_per_kwh: 18,
    availability: true,
    connector_type: "CCS2",
    site_id: "site-1",
    provenance: "DEMO",
    bookable: true,
    ...partial,
  };
}

describe("isChargerBookable", () => {
  it("treats missing bookable as bookable", () => {
    expect(isChargerBookable({ bookable: undefined })).toBe(true);
  });

  it("treats explicit false as info-only", () => {
    expect(isChargerBookable({ bookable: false })).toBe(false);
  });
});

describe("hasValidCoordinates", () => {
  it("accepts finite in-range coordinates", () => {
    expect(hasValidCoordinates({ latitude: 12.97, longitude: 77.59 })).toBe(true);
  });

  it("rejects non-finite coordinates", () => {
    expect(hasValidCoordinates({ latitude: Number.NaN, longitude: 77.59 })).toBe(false);
    expect(hasValidCoordinates({ latitude: 12.97, longitude: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("applyChargerFilters", () => {
  const rows = [
    { km: 3, charger: charger({ id: "a", price_per_kwh: 20, power_kw: 22, bookable: true }) },
    { km: 1, charger: charger({ id: "b", price_per_kwh: null, power_kw: 60, bookable: false, provenance: "REAL" }) },
    { km: 2, charger: charger({ id: "c", price_per_kwh: 12, power_kw: null, bookable: true }) },
  ];

  it("sorts nearest first without inventing prices", () => {
    const result = applyChargerFilters(rows, {
      sort: "nearest",
      bookable: "all",
      availability: "all",
      connector: "all",
      maxPrice: null,
    });
    expect(result.map((row) => row.charger.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts cheapest known prices first and leaves unknown last", () => {
    const result = applyChargerFilters(rows, {
      sort: "cheapest",
      bookable: "all",
      availability: "all",
      connector: "all",
      maxPrice: null,
    });
    expect(result.map((row) => row.charger.id)).toEqual(["c", "a", "b"]);
  });

  it("excludes unknown prices from a max-price filter", () => {
    const result = applyChargerFilters(rows, {
      sort: "nearest",
      bookable: "all",
      availability: "all",
      connector: "all",
      maxPrice: 15,
    });
    expect(result.map((row) => row.charger.id)).toEqual(["c"]);
  });

  it("filters to bookable chargers only", () => {
    const result = applyChargerFilters(rows, {
      sort: "nearest",
      bookable: "bookable",
      availability: "all",
      connector: "all",
      maxPrice: null,
    });
    expect(result.every((row) => isChargerBookable(row.charger))).toBe(true);
  });
});
