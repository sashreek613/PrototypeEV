import { ArrowUpRight, LocateFixed, LogOut, MapPin, QrCode, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { VehicleWidget } from "../../components/driver/VehicleWidget";
import { VehicleModal } from "../../components/driver/VehicleModal";
import { ChargerCard } from "../../components/driver/ChargerCard";
import { DriverMap } from "../../components/driver/DriverMap";
import { NetworkIntelligencePanel } from "../../components/driver/NetworkIntelligencePanel";
import { StatusBar } from "../../components/driver/StatusBar";
import { VoiceAssistantButton } from "../../components/driver/VoiceAssistantButton";
import { LanguageToggle } from "../../components/driver/LanguageToggle";
import { ScreenState } from "../../components/common/ScreenState";
import { ThemeToggle } from "../../components/common/ThemeToggle";
import { useT } from "../../i18n";
// Reused as-is from the planner side -- generic offline place search
// (GET /api/sites/suggest), nothing planner-specific about it.
import { LocationSearchBox } from "../../components/planner/LocationSearchBox";
import { useChargers, useVehicleRange } from "../../hooks/useApiData";
import { useAuth } from "../../hooks/useAuth";
import { createVehicle, deleteVehicle, getChargers, getDriverIntelligence, getVehicles, suggestLocations, updateVehicle } from "../../services/api";
import type { Charger, DriverIntelligence, DriverPreference, DrivingProfile, LocationSuggestion, Vehicle, VehicleCreate, VehicleUpdate } from "../../types";
import {
  applyChargerFilters,
  DEFAULT_CHARGER_FILTERS,
  uniqueConnectors,
  type ChargerFilterState,
} from "../../utils/chargerFilters";
import { sortByRecommendation } from "../../utils/chargerRanking";
import { firstNameFromFullName, greetingBucketForHour, initialsFromName } from "../../utils/format";
import { centroid, haversineKm, isWithinRange } from "../../utils/geo";
import { loadDriverDiscoveryState, saveDriverDiscoveryState } from "../../utils/driverDiscoveryState";

interface DriverLocation {
  latitude: number;
  longitude: number;
}

interface SearchedLocation {
  latitude: number;
  longitude: number;
  name: string;
}

// "pending" while the request is in flight; every other value is terminal
// until a "Try again" click resets to "pending". "insecure_context" is
// detected BEFORE ever calling getCurrentPosition -- on a plain-HTTP LAN IP
// (e.g. demoing from a phone against the laptop's IP over venue wifi) the
// browser refuses geolocation outright, and without this check that trap
// would otherwise silently look identical to "denied".
type GeoStatus = "pending" | "granted" | "denied" | "unavailable" | "insecure_context";

// Keys into locales/en.json -- resolved to actual copy inside the component
// via t(), since GEO_STATUS_COPY itself lives outside any component and
// can't call the useT() hook.
const GEO_STATUS_KEY: Record<Exclude<GeoStatus, "granted">, string> = {
  pending: "driver_home.geo.pending",
  denied: "driver_home.geo.denied",
  unavailable: "driver_home.geo.unavailable",
  insecure_context: "driver_home.geo.insecure_context",
};

const REFRESH_COOLDOWN_MS = 60_000;
const PREFERENCE_STORAGE_KEY = "vidyutone_driver_preference";

function readStoredPreference(): DriverPreference {
  try {
    const stored = window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
    if (stored === "balanced" || stored === "minimize_time" || stored === "minimize_cost") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "balanced";
}

export function DriverHomePage() {
  const t = useT();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: chargers, error, loading } = useChargers();
  const [polledChargers, setPolledChargers] = useState<Charger[] | null>(null);
  const [intelTick, setIntelTick] = useState(0);
  const [query, setQuery] = useState(() => loadDriverDiscoveryState()?.query ?? "");
  const [filters, setFilters] = useState<ChargerFilterState>(() => loadDriverDiscoveryState()?.filters ?? DEFAULT_CHARGER_FILTERS);
  const [selectedChargerId, setSelectedChargerId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("pending");
  const [refreshedReal, setRefreshedReal] = useState<Charger[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  // Only ever written from an effect or event handler, never read via a
  // fresh Date.now() call during render -- render only does arithmetic on
  // this and lastRefreshAt, which is pure.
  const [nowTick, setNowTick] = useState<number | null>(null);
  // Controlled state for VehicleWidget's climate-control toggle and driving-
  // profile control -- lifted here (not owned by VehicleWidget) so this
  // page's OWN useVehicleRange call below (used for the reachable-chargers
  // filter) uses the exact same adjusted range VehicleWidget displays.
  const [climateControl, setClimateControl] = useState(false);
  const [drivingProfile, setDrivingProfile] = useState<DrivingProfile>("mixed");
  const [showAllReachable, setShowAllReachable] = useState(() => loadDriverDiscoveryState()?.showAllReachable ?? false);
  const [searchedLocation, setSearchedLocation] = useState<SearchedLocation | null>(() => loadDriverDiscoveryState()?.searchedLocation ?? null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchBoxKey, setSearchBoxKey] = useState(0);
  const [preference, setPreference] = useState<DriverPreference>(() => readStoredPreference());
  const [intelligence, setIntelligence] = useState<DriverIntelligence | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  // Bumped on every "recenter to my location" tap -- see DriverMap's
  // recenterSignal prop. A plain counter, not a boolean: it must change on
  // every click (even consecutive ones) for DriverMap's effect to refire.
  const [recenterSignal, setRecenterSignal] = useState(0);
  const geoRequestId = useRef(0);
  const geoWatchId = useRef<number | null>(null);
  const hour = new Date().getHours();

  useEffect(() => {
    if (lastRefreshAt === null) {
      return;
    }
    setNowTick(Date.now());
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now - lastRefreshAt >= REFRESH_COOLDOWN_MS) {
        window.clearInterval(interval);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [lastRefreshAt]);

  const primaryVehicle = useMemo(
    () => vehicles.find((v) => v.is_primary) ?? vehicles[0] ?? null,
    [vehicles],
  );

  // A searched location takes priority over real GPS -- searching is an
  // explicit "show me chargers over there instead" action. Clearing the
  // search (see handleClearSearch) drops back to GPS. Distances/range still
  // use the charger-centroid only until a real browser fix exists so the
  // list does not break; the map marker never uses that fallback.
  const liveOrigin = searchedLocation ?? driverLocation;
  const origin = useMemo(
    () => liveOrigin ?? centroid(chargers ?? []),
    [liveOrigin, chargers],
  );

  async function handleSelectSearchSuggestion(suggestion: LocationSuggestion) {
    setSearchError(null);
    setSelectedChargerId(null);
    setSearchedLocation({ latitude: suggestion.latitude, longitude: suggestion.longitude, name: suggestion.name });
  }

  async function handleSubmitSearchFreeText(query: string) {
    setSearchError(null);
    try {
      const matches = await suggestLocations(query, 1);
      const best = matches[0];
      if (!best) {
        setSearchError(t("driver_home.search_no_match", { query }));
        return;
      }
      setSelectedChargerId(null);
      setSearchedLocation({ latitude: best.latitude, longitude: best.longitude, name: best.name });
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : t("driver_home.search_error_generic"));
    }
  }

  function handleClearSearch() {
    setSelectedChargerId(null);
    setSearchedLocation(null);
    setSearchError(null);
    setSearchBoxKey((key) => key + 1);
  }

  // Always fetch a fresh GPS fix. Previously, if geoStatus was already
  // "granted", this only flew the camera to the existing origin -- which is
  // often the charger-centroid fallback from before GPS resolved, or a
  // stale reading. Bump recenterSignal after the request settles so the
  // map recenters even when coordinates did not change (user panned).
  function handleRecenter() {
    if (searchedLocation) {
      handleClearSearch();
    }
    requestLocation(() => {
      setRecenterSignal((n) => n + 1);
    });
  }

  function handleMapPickLocation(lat: number, lon: number) {
    setSearchError(null);
    setSelectedChargerId(null);
    setSearchedLocation({
      latitude: lat,
      longitude: lon,
      name: t("driver_home.selected_map_location"),
    });
    setSearchBoxKey((key) => key + 1);
  }

  // The one authoritative range source (backend/app/services/range_service.py
  // via GET /vehicles/{id}/range) -- recomputes whenever the vehicle, its
  // committed battery %, or any of the three adjustment controls change.
  // Same params VehicleWidget passes to its own call, so the reachable-
  // chargers filter below and what the widget displays never disagree.
  const { data: range } = useVehicleRange(primaryVehicle, {
    lat: origin.latitude,
    lon: origin.longitude,
    climateControl,
    drivingProfile,
  });

  useEffect(() => {
    let cancelled = false;
    async function loadVehicles() {
      try {
        const list = await getVehicles();
        if (!cancelled) setVehicles(list);
      } catch {
        // Ignored if unauthenticated or error
      }
    }
    void loadVehicles();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real driver location via the browser Geolocation API (watchPosition so
  // the marker follows the device). On denial / unavailability / timeout,
  // driverLocation stays at its last real fix (or null) -- never a fake
  // coordinate. The map marker is only shown when liveOrigin is set.
  function clearGeoWatch() {
    if (geoWatchId.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(geoWatchId.current);
      geoWatchId.current = null;
    }
  }

  function requestLocation(onSettled?: () => void) {
    const requestId = ++geoRequestId.current;
    clearGeoWatch();

    if (!window.isSecureContext) {
      setGeoStatus("insecure_context");
      onSettled?.();
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      onSettled?.();
      return;
    }
    setGeoStatus("pending");
    let settled = false;
    const settleOnce = () => {
      if (!settled) {
        settled = true;
        onSettled?.();
      }
    };

    geoWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        if (requestId !== geoRequestId.current) {
          return;
        }
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return;
        }
        setDriverLocation({ latitude, longitude });
        setGeoStatus("granted");
        settleOnce();
      },
      (err) => {
        if (requestId !== geoRequestId.current) {
          return;
        }
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus("denied");
          clearGeoWatch();
          settleOnce();
          return;
        }
        setGeoStatus((prev) => (prev === "granted" ? "granted" : "unavailable"));
        settleOnce();
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  }

  useEffect(() => {
    requestLocation();
    return () => {
      clearGeoWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestLocation is stable in behaviour (reads window/navigator, not props/state) and is also exposed as the "Try again" handler; re-running this effect on every render would re-trigger the browser permission flow.
  }, []);

  useEffect(() => {
    const poll = () => {
      void getChargers()
        .then(setPolledChargers)
        .catch(() => {});
    };
    const chargersId = window.setInterval(poll, 8000);
    const intelId = window.setInterval(() => setIntelTick((tick) => tick + 1), 8000);
    return () => {
      window.clearInterval(chargersId);
      window.clearInterval(intelId);
    };
  }, []);

  const bufferedRangeKm = primaryVehicle ? (range?.buffered_range_km ?? null) : null;
  // true once we actually have a range figure to filter by -- not merely
  // "a vehicle is selected", so the list doesn't flash-filter-to-empty
  // before the first range fetch resolves.
  const isRangeLimited = primaryVehicle !== null && bufferedRangeKm !== null;

  // Manual refresh replaces the cached GET /api/chargers payload in-place
  // (safe data source). It does not call live OpenChargeMap.
  const effectiveChargers = useMemo(() => {
    const overlay = polledChargers;
    if (refreshedReal.length > 0) {
      if (!overlay) {
        return refreshedReal;
      }
      const byId = new Map(overlay.map((row) => [row.id, row]));
      return refreshedReal.map((row) => byId.get(row.id) ?? row);
    }
    return overlay ?? chargers ?? [];
  }, [chargers, refreshedReal, polledChargers]);

  const connectorOptions = useMemo(() => uniqueConnectors(effectiveChargers), [effectiveChargers]);

  const allRanked = useMemo(() => {
    const list = effectiveChargers;
    return list
      .map((charger) => {
        // REAL chargers all share site_id: null -- grouping by site_id
        // would otherwise lump every one of them into one giant "site".
        // Only DEMO chargers (real, non-null site_id) get grouped; a REAL
        // charger is always its own group of one.
        const siteMates = charger.site_id !== null ? list.filter((item) => item.site_id === charger.site_id) : [charger];
        return {
          charger,
          km: haversineKm(origin.latitude, origin.longitude, charger.latitude, charger.longitude),
          freeCount: siteMates.filter((item) => item.availability === true).length,
          totalCount: siteMates.length,
        };
      })
      .filter((row) => row.charger.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.km - b.km);
  }, [effectiveChargers, origin, query]);

  // No vehicle (or its range hasn't loaded yet) -- keep today's behaviour:
  // everything, sorted by distance. Vehicle + range known -- filter to
  // what's actually reachable. Recomputes automatically whenever
  // bufferedRangeKm changes (battery %, vehicle swap, spec edit) or the
  // driver's location changes -- no page refresh needed.
  const reachable = useMemo(() => {
    if (!isRangeLimited) {
      return allRanked;
    }
    return allRanked.filter((row) => isWithinRange(origin, row.charger, bufferedRangeKm!));
  }, [allRanked, isRangeLimited, bufferedRangeKm, origin]);

  const ranked = useMemo(() => applyChargerFilters(reachable, filters), [reachable, filters]);

  const congestionByCharger = useMemo(() => {
    const map = new Map<string, { level: "LOW" | "MODERATE" | "HIGH"; wait: number }>();
    for (const row of intelligence?.congestion ?? []) {
      map.set(row.charger_id, { level: row.level, wait: row.estimated_wait_minutes });
    }
    return map;
  }, [intelligence]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCE_STORAGE_KEY, preference);
    } catch {
      // ignore
    }
  }, [preference]);

  const originLatKey = origin.latitude.toFixed(4);
  const originLonKey = origin.longitude.toFixed(4);
  const rankedIdKey = ranked
    .slice(0, 40)
    .map((row) => row.charger.id)
    .join(",");
  const rangeKey = bufferedRangeKm == null ? "" : String(Math.round(bufferedRangeKm));

  useEffect(() => {
    if (!rankedIdKey) {
      setIntelligence(null);
      setIntelError(null);
      return;
    }
    const chargerIds = rankedIdKey.split(",");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIntelLoading(true);
      setIntelError(null);
      void getDriverIntelligence({
        latitude: Number(originLatKey),
        longitude: Number(originLonKey),
        preference,
        range_km: rangeKey === "" ? null : Number(rangeKey),
        charger_ids: chargerIds,
      })
        .then((data) => {
          if (!cancelled) {
            setIntelligence(data);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setIntelError(err instanceof Error ? err.message : "Couldn't load charging intelligence.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIntelLoading(false);
          }
        });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [originLatKey, originLonKey, preference, rankedIdKey, rangeKey, intelTick]);

  useEffect(() => {
    if (selectedChargerId && !ranked.some((row) => row.charger.id === selectedChargerId)) {
      setSelectedChargerId(null);
    }
  }, [ranked, selectedChargerId]);

  useEffect(() => {
    if (!selectedChargerId) {
      return;
    }
    const el = document.getElementById(`charger-card-${selectedChargerId}`);
    if (!el) {
      setShowAllReachable(true);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedChargerId, showAllReachable]);

  // When range-limited, anchor the distance score to the driver's actual
  // range (a charger at the edge of range scores ~0 on distance, one right
  // beside the driver scores ~100). Without a vehicle there's no range to
  // anchor to -- fall back to the farthest charger actually in the
  // (unfiltered) list so the score still spans a meaningful 0-100.
  const maxRelevantKm = isRangeLimited ? bufferedRangeKm! : Math.max(1, ...ranked.map((row) => row.km));

  const recommended = useMemo(
    () => sortByRecommendation(ranked, maxRelevantKm).slice(0, 5),
    [ranked, maxRelevantKm],
  );

  const visibleRecommended = useMemo(() => {
    if (!selectedChargerId || recommended.some((row) => row.charger.id === selectedChargerId)) {
      return recommended;
    }
    const extra = ranked.find((row) => row.charger.id === selectedChargerId);
    return extra ? [...recommended, extra] : recommended;
  }, [recommended, ranked, selectedChargerId]);

  const mapChargers = useMemo(() => ranked.map((row) => row.charger), [ranked]);

  useEffect(() => {
    saveDriverDiscoveryState({
      query,
      filters,
      searchedLocation,
      showAllReachable,
    });
  }, [query, filters, searchedLocation, showAllReachable]);

  async function handleSaveVehicle(payload: VehicleCreate | VehicleUpdate) {
    if (editingVehicle) {
      const updated = await updateVehicle(editingVehicle.id, payload as VehicleUpdate);
      setVehicles((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } else {
      const created = await createVehicle(payload as VehicleCreate);
      setVehicles((prev) => [created, ...prev]);
    }
  }

  async function handleDeleteVehicle(vehicleId: string) {
    await deleteVehicle(vehicleId);
    setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
  }

  async function handleUpdateBattery(vehicleId: string, newPct: number) {
    const updated = await updateVehicle(vehicleId, { current_battery_pct: newPct });
    setVehicles((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  }

  const refreshCooldownRemainingMs =
    lastRefreshAt === null || nowTick === null ? 0 : Math.max(0, REFRESH_COOLDOWN_MS - (nowTick - lastRefreshAt));

  async function handleRefreshNearby() {
    if (refreshing || refreshCooldownRemainingMs > 0) {
      return;
    }
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await getChargers();
      setRefreshedReal(fresh);
      setLastRefreshAt(Date.now());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("driver_home.refresh_error_generic");
      setRefreshError(msg);
    } finally {
      setRefreshing(false);
    }

  }

  return (
    <div className="flex min-h-screen flex-col bg-driver-bg text-driver-ink pb-8">
      <StatusBar />
      <div className="px-5 pt-4 space-y-4">
        {/* Language toggle gets its own row -- with the greeting, theme
            toggle, avatar and logout all in one row, "EN / ಕನ್ನಡ / हिंदी"
            plus a long Kannada/Hindi greeting has no room at 390px width. */}
        <div className="flex items-center justify-end">
          <LanguageToggle />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">{t("driver_home.portal_label")}</p>
            <h1 className="text-[26px] font-bold tracking-tight">
              {t(`driver_home.greeting_${greetingBucketForHour(hour)}`)}, {firstNameFromFullName(profile?.full_name ?? "there")}
            </h1>
          </div>
          <div className="flex items-center space-x-3 shrink-0">
            <ThemeToggle compact />
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2F7] dark:bg-[#1c242f] border border-[#4F6F9F]/30 dark:border-[#6F8FB8]/40 text-[13px] font-bold text-[#4F6F9F] dark:text-[#6F8FB8] select-none">
              {initialsFromName(profile?.full_name ?? "Driver")}
            </span>
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => navigate("/", { replace: true }));
              }}
              className="vo-hover-interactive p-2 rounded-[8px] bg-driver-card hover:bg-driver-line text-driver-muted hover:text-driver-ink transition-colors"
              title={t("driver_home.logout_title")}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <VoiceAssistantButton
          onSearchLocation={(q) => void handleSubmitSearchFreeText(q)}
          onClearSearch={handleClearSearch}
          onSetSort={(sort) => setFilters((current) => ({ ...current, sort }))}
          bufferedRangeKm={bufferedRangeKm}
          recommended={recommended}
        />

        {/* Vehicle Widget */}
        <VehicleWidget
          vehicle={primaryVehicle}
          onAddVehicle={() => {
            setEditingVehicle(null);
            setModalOpen(true);
          }}
          onEditVehicle={(v) => {
            setEditingVehicle(v);
            setModalOpen(true);
          }}
          onUpdateBattery={handleUpdateBattery}
          location={origin}
          climateControl={climateControl}
          onClimateControlChange={setClimateControl}
          drivingProfile={drivingProfile}
          onDrivingProfileChange={setDrivingProfile}
        />

        <Link
          to="/driver/savings"
          className="vo-hover-interactive block rounded-[12px] border border-vo-border bg-vo-card p-4 hover:border-vo-accent/40"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">
            {t("driver_home.savings_card.eyebrow")}
          </p>
          <p className="mt-1 text-[16px] font-bold text-driver-ink">{t("driver_home.savings_card.title")}</p>
          <p className="mt-1 text-[12px] text-vo-muted">{t("driver_home.savings_card.subtitle")}</p>
        </Link>

        <Link
          to="/driver/fast-track"
          className="vo-hover-interactive block rounded-[12px] border border-vo-border bg-vo-card p-4 hover:border-vo-accent/40"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">{t("fast_track.eyebrow")}</p>
          <p className="mt-1 flex items-center gap-2 text-[16px] font-bold text-driver-ink">
            <QrCode size={16} />
            {t("fast_track.title")}
          </p>
          <p className="mt-1 text-[12px] text-vo-muted">{t("fast_track.home_subtitle")}</p>
        </Link>

        <Link
          to="/driver/bookings"
          className="vo-hover-interactive block rounded-[12px] border border-vo-border bg-vo-card p-4 hover:border-vo-accent/40"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-vo-accent-ink">
            {t("driver_home.bookings_card.eyebrow")}
          </p>
          <p className="mt-1 text-[16px] font-bold text-driver-ink">{t("common.my_bookings")}</p>
          <p className="mt-1 text-[12px] text-vo-muted">{t("driver_home.bookings_card.subtitle")}</p>
        </Link>

        {/* Name filter only -- location search sits on the map so choosing a
            place updates origin, distances, and markers rather than this list. */}
        <label className="flex h-12 items-center gap-3 rounded-[8px] border border-vo-line bg-vo-card px-4 shadow-inner">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-emerald-400 text-black shrink-0">
            <ArrowUpRight size={14} />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("driver_home.filter_placeholder")}
            className="w-full bg-transparent text-[14px] text-driver-ink outline-none placeholder:text-vo-muted"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshNearby()}
            disabled={refreshing || refreshCooldownRemainingMs > 0}
            className="vo-hover-interactive flex items-center gap-1.5 rounded-[8px] border border-vo-line bg-vo-card px-3 py-1.5 text-[11px] font-medium text-vo-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {refreshing
              ? t("driver_home.refresh_refreshing")
              : refreshCooldownRemainingMs > 0
                ? t("driver_home.refresh_cooldown", { seconds: Math.ceil(refreshCooldownRemainingMs / 1000) })
                : t("driver_home.refresh_nearby")}
          </button>
          {refreshError ? <p className="text-[11px] text-vo-bad-ink">{refreshError}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("driver_home.filter.sort_label")}</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as ChargerFilterState["sort"] }))}
              className="w-full rounded-[6px] border border-vo-line bg-vo-card px-2.5 py-2 text-[11px] text-driver-ink"
            >
              <option value="nearest">{t("driver_home.filter.sort_nearest")}</option>
              <option value="cheapest">{t("driver_home.filter.sort_cheapest")}</option>
              <option value="fastest">{t("driver_home.filter.sort_fastest")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("driver_home.filter.booking_label")}</span>
            <select
              value={filters.bookable}
              onChange={(event) => setFilters((current) => ({ ...current, bookable: event.target.value as ChargerFilterState["bookable"] }))}
              className="w-full rounded-[6px] border border-vo-line bg-vo-card px-2.5 py-2 text-[11px] text-driver-ink"
            >
              <option value="all">{t("driver_home.filter.booking_all")}</option>
              <option value="bookable">{t("driver_home.filter.booking_bookable")}</option>
              <option value="info">{t("driver_home.filter.booking_info")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("driver_home.filter.status_label")}</span>
            <select
              value={filters.availability}
              onChange={(event) => setFilters((current) => ({ ...current, availability: event.target.value as ChargerFilterState["availability"] }))}
              className="w-full rounded-[6px] border border-vo-line bg-vo-card px-2.5 py-2 text-[11px] text-driver-ink"
            >
              <option value="all">{t("driver_home.filter.status_all")}</option>
              <option value="available">{t("driver_home.filter.status_available")}</option>
              <option value="unavailable">{t("driver_home.filter.status_unavailable")}</option>
              <option value="unknown">{t("driver_home.filter.status_unknown")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("driver_home.filter.connector_label")}</span>
            <select
              value={filters.connector}
              onChange={(event) => setFilters((current) => ({ ...current, connector: event.target.value }))}
              className="w-full rounded-[6px] border border-vo-line bg-vo-card px-2.5 py-2 text-[11px] text-driver-ink"
            >
              <option value="all">{t("driver_home.filter.connector_all")}</option>
              {connectorOptions.map((connector) => (
                <option key={connector} value={connector}>
                  {connector}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vo-muted">{t("driver_home.filter.max_price_label")}</span>
            <input
              type="number"
              min={0}
              step={1}
              value={filters.maxPrice ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                setFilters((current) => ({
                  ...current,
                  maxPrice: raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw),
                }));
              }}
              placeholder={t("driver_home.filter.max_price_placeholder")}
              className="w-full rounded-[6px] border border-vo-line bg-vo-card px-2.5 py-2 text-[11px] text-driver-ink placeholder:text-vo-muted"
            />
          </label>
        </div>
      </div>

      <ScreenState
        loading={loading}
        error={error}
        empty={!loading && !error && allRanked.length === 0}
        emptyMessage={t("driver_home.empty_no_chargers")}
        loadingText={t("common.loading")}
        errorLabel={t("common.load_error_prefix")}
      >
        <div className="mt-4 px-5 space-y-4">
          <div className="relative z-20 space-y-2">
            <LocationSearchBox
              key={searchBoxKey}
              initialQuery={searchedLocation?.name ?? ""}
              placeholder={t("driver_home.search_placeholder")}
              onSelectSuggestion={(s) => void handleSelectSearchSuggestion(s)}
              onSubmitFreeText={(q) => void handleSubmitSearchFreeText(q)}
              onClear={handleClearSearch}
            />
            {searchError ? (
              <p className="rounded-lg border border-vo-bad-border bg-vo-bad-bg px-2 py-1 text-[11px] text-vo-bad-ink">
                {searchError}
              </p>
            ) : null}
          </div>

          <div className="h-[280px] overflow-hidden rounded-[16px] border border-vo-line">
            <DriverMap
              chargers={mapChargers}
              origin={liveOrigin ?? undefined}
              rangeKm={liveOrigin && isRangeLimited ? bufferedRangeKm : null}
              isLiveLocation={geoStatus === "granted" && driverLocation !== null && !searchedLocation}
              selectedChargerId={selectedChargerId}
              onSelectCharger={setSelectedChargerId}
              onMapClick={handleMapPickLocation}
              onRecenter={handleRecenter}
              recenterSignal={recenterSignal}
            />
          </div>

          {searchedLocation ? (
            <div className="flex items-center justify-between gap-2 rounded-[8px] border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-vo-info-ink">
                <MapPin size={12} />
                <span>{t("driver_home.search_showing_near", { name: searchedLocation.name })}</span>
              </div>
              <button
                type="button"
                onClick={handleClearSearch}
                className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-vo-info-ink hover:opacity-80"
              >
                <X size={12} />
                {t("driver_home.back_to_my_location")}
              </button>
            </div>
          ) : geoStatus === "granted" && driverLocation ? (
            <div className="flex items-center gap-1.5 text-[11px] text-vo-accent-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-vo-accent-ink" />
              <span>{t("driver_home.using_live_location")}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-[8px] border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div
                className="flex items-center gap-1.5 text-[11px] text-vo-warn-ink"
                title={geoStatus === "granted" ? undefined : t(GEO_STATUS_KEY[geoStatus])}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-vo-warn-ink" />
                <span>
                  {geoStatus === "granted"
                    ? t("driver_home.geo.estimated_area")
                    : t(GEO_STATUS_KEY[geoStatus])}
                </span>
              </div>
              {geoStatus === "denied" || geoStatus === "unavailable" ? (
                <button
                  type="button"
                  onClick={() => requestLocation()}
                  className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-vo-warn-ink hover:opacity-80"
                >
                  <LocateFixed size={12} />
                  {t("driver_home.try_again")}
                </button>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-driver-ink">
              {isRangeLimited ? t("driver_home.reachable_chargers") : t("driver_home.nearby_chargers")}
            </h2>
            <span className="text-[12px] text-vo-accent-ink font-mono">
              {isRangeLimited
                ? t("driver_home.within_range_count", { count: ranked.length, km: Math.round(bufferedRangeKm!) })
                : t("driver_home.available_count", { count: ranked.length })}
            </span>
          </div>

          {isRangeLimited && ranked.length === 0 && reachable.length === 0 ? (
            <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-1.5">
              <p className="text-sm font-semibold text-vo-warn-ink">{t("driver_home.no_range_title")}</p>
              <p className="text-xs text-vo-muted">{t("driver_home.no_range_body")}</p>
            </div>
          ) : ranked.length === 0 ? (
            <div className="rounded-[12px] border border-vo-line bg-vo-card p-6 text-center space-y-1.5">
              <p className="text-sm font-semibold text-driver-ink">{t("driver_home.no_match_title")}</p>
              <p className="text-xs text-vo-muted">{t("driver_home.no_match_body")}</p>
            </div>
          ) : (
            <>
              <NetworkIntelligencePanel
                intelligence={intelligence}
                loading={intelLoading}
                error={intelError}
                preference={preference}
                onPreferenceChange={setPreference}
                onSelectCharger={setSelectedChargerId}
              />

              <div className="flex items-center justify-between pt-1">
                <h3 className="text-[13px] font-bold text-driver-ink">{t("driver_home.recommended_heading")}</h3>
                <span className="text-[10px] uppercase tracking-wider text-vo-muted">{t("driver_home.recommended_caption")}</span>
              </div>
              {/* No placeholder rows when fewer than 5 are in range --
                  .slice(0, 5) already just returns what exists. */}
              <div className="flex flex-col gap-3">
                {visibleRecommended.map((row, index) => (
                  <ChargerCard
                    key={row.charger.id}
                    charger={row.charger}
                    km={row.km}
                    freeCount={row.freeCount}
                    totalCount={row.totalCount}
                    rank={index + 1}
                    origin={origin}
                    selected={selectedChargerId === row.charger.id}
                    onSelect={setSelectedChargerId}
                    congestionLevel={congestionByCharger.get(row.charger.id)?.level}
                    estimatedWaitMinutes={congestionByCharger.get(row.charger.id)?.wait}
                  />
                ))}
              </div>

              {ranked.length > recommended.length ? (
                <button
                  type="button"
                  onClick={() => setShowAllReachable((v) => !v)}
                  className="text-[12px] font-medium text-vo-accent-ink hover:opacity-80"
                >
                  {showAllReachable ? t("driver_home.hide_full_list") : t("driver_home.show_all_reachable", { count: ranked.length })}
                </button>
              ) : null}

              {/* Never permanently hidden -- this is the escape hatch, the
                  rest of the reachable set is always one click away. */}
              {showAllReachable && ranked.length > recommended.length ? (
                <div className="flex flex-col gap-3 border-t border-vo-line/40 pt-3">
                  {ranked.map((row) => (
                    <ChargerCard
                      key={row.charger.id}
                      charger={row.charger}
                      km={row.km}
                      freeCount={row.freeCount}
                      totalCount={row.totalCount}
                      origin={origin}
                      selected={selectedChargerId === row.charger.id}
                      onSelect={setSelectedChargerId}
                      congestionLevel={congestionByCharger.get(row.charger.id)?.level}
                      estimatedWaitMinutes={congestionByCharger.get(row.charger.id)?.wait}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </ScreenState>

      {/* Vehicle Modal Dialog */}
      <VehicleModal
        isOpen={modalOpen}
        vehicle={editingVehicle}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveVehicle}
        onDelete={handleDeleteVehicle}
      />
    </div>
  );
}
