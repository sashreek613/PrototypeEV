import type { Charger, Site } from "../types";
import { haversineKm } from "./geo";

export interface SiteInsights {
  chargerGapKm: number;
  headroomKva: number;
  peakLoadPct: number;
  utilisationPct: number;
  paybackYears: number;
  transformerKva: number;
  feederName: string;
  connectionLead: string;
}

export function insightsForSite(site: Site): SiteInsights {
  const chargerGapKm = Math.max(0.8, Number((site.charger_gap_score / 19).toFixed(1)));
  const headroomKva = Math.round(site.grid_capacity_score * 8.15);
  const peakLoadPct = Math.round(100 - site.grid_capacity_score * 0.42);
  const utilisationPct = Math.round(site.demand_score * 0.76);
  const paybackYears = Number((7.2 - site.demand_score / 38).toFixed(1));
  const transformerKva = Math.round(1200 + site.grid_capacity_score * 6);
  const feederName = feederLabel(site);
  const connectionLead =
    site.recommendation === "BUILD"
      ? "6–8 weeks"
      : site.recommendation === "BUILD_IF_MANAGED"
        ? "10–14 weeks"
        : "Not recommended";

  return {
    chargerGapKm,
    headroomKva,
    peakLoadPct,
    utilisationPct,
    paybackYears,
    transformerKva,
    feederName,
    connectionLead,
  };
}

export function feederLabel(site: Site): string {
  const prefix = site.id.replace("site-", "").slice(0, 2).toUpperCase();
  const shortName = site.name.split(" ")[0] ?? site.name;
  return `${prefix}-11 ${shortName}`;
}

export function nearbyChargers(site: Site, chargers: Charger[], limit = 3): Array<Charger & { km: number }> {
  return chargers
    .map((charger) => ({
      ...charger,
      km: haversineKm(site.latitude, site.longitude, charger.latitude, charger.longitude),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function managedLoadSeries(gridCapacityScore: number): Array<{ hour: string; base: number; unmanaged: number }> {
  return Array.from({ length: 24 }, (_, hour) => {
    const evening = hour >= 18 && hour <= 22;
    const base = 38 + (100 - gridCapacityScore) * 0.22 + (evening ? 18 : 0);
    const unmanaged = evening ? base + 14 : base + 3;
    return {
      hour: `${hour.toString().padStart(2, "0")}:00`,
      base: Math.round(base),
      unmanaged: Math.round(unmanaged),
    };
  });
}
