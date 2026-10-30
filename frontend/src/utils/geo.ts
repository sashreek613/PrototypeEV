const EARTH_KM = 6371;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Pulled out as its own pure function (rather than left inline in
 * DriverHomePage's filter) specifically so the boundary case -- a charger
 * just inside vs just outside the range radius -- is unit-testable without
 * mounting the component. See utils/geo.test.ts. */
export function isWithinRange(
  origin: { latitude: number; longitude: number },
  point: { latitude: number; longitude: number },
  rangeKm: number,
): boolean {
  return haversineKm(origin.latitude, origin.longitude, point.latitude, point.longitude) <= rangeKm;
}

export function centroid(
  points: Array<{ latitude: number; longitude: number }>,
): { latitude: number; longitude: number } {
  if (points.length === 0) {
    return { latitude: 12.9716, longitude: 77.5946 };
  }
  const sum = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}
