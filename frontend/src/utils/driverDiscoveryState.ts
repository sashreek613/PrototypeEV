import { DEFAULT_CHARGER_FILTERS, type ChargerFilterState } from "./chargerFilters";

const STORAGE_KEY = "vidyutone-driver-discovery";

export interface StoredSearchedLocation {
  latitude: number;
  longitude: number;
  name: string;
}

export interface DriverDiscoveryState {
  query: string;
  filters: ChargerFilterState;
  searchedLocation: StoredSearchedLocation | null;
  showAllReachable: boolean;
}

export function loadDriverDiscoveryState(): DriverDiscoveryState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DriverDiscoveryState>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      filters: { ...DEFAULT_CHARGER_FILTERS, ...(parsed.filters ?? {}) },
      searchedLocation: parsed.searchedLocation ?? null,
      showAllReachable: Boolean(parsed.showAllReachable),
    };
  } catch {
    return null;
  }
}

export function saveDriverDiscoveryState(state: DriverDiscoveryState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private-mode failures
  }
}
