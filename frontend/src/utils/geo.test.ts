import { describe, expect, it } from "vitest";

import { centroid, haversineKm, isWithinRange } from "./geo";

describe("isWithinRange", () => {
  const origin = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru

  it("includes a point well inside the radius", () => {
    const nearby = { latitude: 12.9352, longitude: 77.6245 }; // ~5km away
    expect(isWithinRange(origin, nearby, 10)).toBe(true);
  });

  it("excludes a point well outside the radius", () => {
    const far = { latitude: 13.5, longitude: 78.0 }; // well beyond 10km
    expect(isWithinRange(origin, far, 10)).toBe(false);
  });

  it("boundary: a point just inside the radius is included", () => {
    const distanceKm = haversineKm(origin.latitude, origin.longitude, 12.9352, 77.6245);
    const point = { latitude: 12.9352, longitude: 77.6245 };
    expect(isWithinRange(origin, point, distanceKm + 0.01)).toBe(true);
  });

  it("boundary: a point just outside the radius is excluded", () => {
    const distanceKm = haversineKm(origin.latitude, origin.longitude, 12.9352, 77.6245);
    const point = { latitude: 12.9352, longitude: 77.6245 };
    expect(isWithinRange(origin, point, distanceKm - 0.01)).toBe(false);
  });

  it("boundary: a point exactly at the radius is included (inclusive comparison)", () => {
    const distanceKm = haversineKm(origin.latitude, origin.longitude, 12.9352, 77.6245);
    const point = { latitude: 12.9352, longitude: 77.6245 };
    expect(isWithinRange(origin, point, distanceKm)).toBe(true);
  });

  it("zero range excludes everything except the origin itself", () => {
    expect(isWithinRange(origin, origin, 0)).toBe(true);
    expect(isWithinRange(origin, { latitude: 12.9352, longitude: 77.6245 }, 0)).toBe(false);
  });
});

describe("centroid", () => {
  it("returns a default when given no points", () => {
    expect(centroid([])).toEqual({ latitude: 12.9716, longitude: 77.5946 });
  });

  it("averages a set of points", () => {
    const result = centroid([
      { latitude: 10, longitude: 20 },
      { latitude: 20, longitude: 40 },
    ]);
    expect(result).toEqual({ latitude: 15, longitude: 30 });
  });
});
