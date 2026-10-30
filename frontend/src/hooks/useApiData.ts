import { useCallback, useRef, useState } from "react";

import { classifyByCoords, classifyByName, getChargers, getCharger, getChargingSummary, getRecommendedSites, getSite, getSites, getBooking, getBookings, getVehicleRange } from "../services/api";
import type { RangeQueryParams } from "../services/api";
import type { ClassifiedSite, Vehicle } from "../types";
import { getErrorMessage } from "../utils/errors";
import { useAsync } from "./useAsync";

export function useSites() {
  return useAsync(() => getSites(), []);
}

export function useRecommendedSites(limit: number = 10) {
  return useAsync(() => getRecommendedSites(limit), [limit]);
}

export type ClassifyStatus = "empty" | "loading" | "result" | "error";

/** Imperative (not auto-fetching) -- classifyPoint/classifyName are called
 * on search submit or map click, not on mount. Guards against out-of-order
 * responses (a slow earlier request resolving after a faster later one)
 * with a request-id ref, the same way useAsync guards against a stale
 * response after unmount. */
export function useClassify() {
  const [status, setStatus] = useState<ClassifyStatus>("empty");
  const [result, setResult] = useState<ClassifiedSite | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const run = useCallback((promise: Promise<ClassifiedSite>) => {
    const requestId = ++requestIdRef.current;
    setStatus("loading"); // keep the previous `result` in place -- RESULT state must not blank while a new one loads
    setErrorMessage(null);
    promise
      .then((data) => {
        if (requestIdRef.current !== requestId) {
          return; // a newer request already superseded this one
        }
        setResult(data);
        setStatus("result");
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setResult(null);
        setErrorMessage(getErrorMessage(err));
        setStatus("error");
      });
  }, []);

  const classifyPoint = useCallback((lat: number, lon: number) => run(classifyByCoords(lat, lon)), [run]);
  const classifyName = useCallback((query: string) => run(classifyByName(query)), [run]);
  const clear = useCallback(() => {
    requestIdRef.current += 1; // invalidate any in-flight request so it can't land after clear()
    setStatus("empty");
    setResult(null);
    setErrorMessage(null);
  }, []);

  return { status, result, errorMessage, classifyPoint, classifyName, clear };
}

export function useSite(siteId: string | undefined) {
  return useAsync(() => {
    if (!siteId) {
      return Promise.reject(new Error("Missing site id"));
    }
    return getSite(siteId);
  }, [siteId]);
}

export function useChargers() {
  return useAsync(() => getChargers(), []);
}

export function useCharger(chargerId: string | undefined) {
  return useAsync(() => {
    if (!chargerId) {
      return Promise.reject(new Error("Missing charger id"));
    }
    return getCharger(chargerId);
  }, [chargerId]);
}

export function useBooking(bookingId: string | undefined) {
  return useAsync(() => {
    if (!bookingId) {
      return Promise.reject(new Error("Missing booking id"));
    }
    return getBooking(bookingId);
  }, [bookingId]);
}

export function useChargingSummary() {
  return useAsync(() => getChargingSummary(), []);
}

export function useBookings(deps: ReadonlyArray<unknown> = []) {
  return useAsync(() => getBookings(), deps);
}

/** The one source of truth for a vehicle's range -- backed by
 * GET /vehicles/{id}/range (backend/app/services/range_service.py), never
 * recomputed locally. Refetches whenever the committed vehicle state
 * changes (id, battery %, or spec edits); it does NOT fire on every slider
 * drag frame because `vehicle.current_battery_pct` itself only changes on
 * commit (see VehicleWidget's tempPct-until-commit pattern) -- no artificial
 * debounce needed on top of that. */
export function useVehicleRange(vehicle: Vehicle | null, params: RangeQueryParams = {}) {
  return useAsync(() => {
    if (!vehicle) {
      return Promise.reject(new Error("No vehicle"));
    }
    return getVehicleRange(vehicle.id, params);
  }, [
    vehicle?.id,
    vehicle?.current_battery_pct,
    vehicle?.battery_capacity_kwh,
    vehicle?.efficiency_wh_km,
    params.lat,
    params.lon,
    params.climateControl,
    params.drivingProfile,
  ]);
}
