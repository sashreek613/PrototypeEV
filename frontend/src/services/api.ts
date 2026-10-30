import axios, { AxiosHeaders, isAxiosError, type InternalAxiosRequestConfig } from "axios";

import { supabase } from "../lib/supabase";
import type {
  Booking,
  BookingCreate,
  CapacityGap,
  Charger,
  ChargingQuote,
  ChargingSummary,
  ClassifiedSite,
  DriverIntelligence,
  DriverPreference,
  DrivingProfile,
  HealthStatus,
  LocationSuggestion,
  OperatorAnalytics,
  OperatorBooking,
  OperatorCharger,
  PricingTier,
  Profile,
  RangeEstimate,
  RecommendedSite,
  FastTrackStatus,
  Site,
  Vehicle,
  VehicleCreate,
  VehicleUpdate,
} from "../types";

const baseURL = import.meta.env.VITE_API_BASE_URL;

if (!baseURL) {
  throw new Error("VITE_API_BASE_URL is not set. Copy frontend/.env.example to frontend/.env.");
}

const client = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

const inflightGets = new Map<string, Promise<unknown>>();

function coalesceGet<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflightGets.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const pending = run().finally(() => {
    inflightGets.delete(key);
  });
  inflightGets.set(key, pending);
  return pending;
}

function attachAuthorization(config: InternalAxiosRequestConfig, token: string): void {
  const headers = AxiosHeaders.from(config.headers);
  headers.set("Authorization", `Bearer ${token}`);
  config.headers = headers;
}

function shouldRetryGet(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  if (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK") {
    return true;
  }
  const status = error.response?.status;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

client.interceptors.request.use(async (config) => {
  const headers = AxiosHeaders.from(config.headers);
  if (headers.get("Authorization")) {
    config.headers = headers;
    return config;
  }
  const stored = localStorage.getItem("vidyutone-mock-session");
  if (stored) {
    try {
      const mockSession = JSON.parse(stored);
      if (mockSession.access_token) {
        attachAuthorization(config, mockSession.access_token);
        return config;
      }
    } catch {
      // ignore
    }
  }
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        attachAuthorization(config, token);
      }
    } catch {
      // ignore
    }
  }
  return config;
});

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await client.get<HealthStatus>("/api/health");
  return data;
}

export async function getMe(accessToken?: string): Promise<Profile> {
  return coalesceGet(`me:${accessToken ?? ""}`, async () => {
    const request = async () => {
      const { data } = await client.get<Profile>("/api/me", {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      return data;
    };
    try {
      return await request();
    } catch (error) {
      if (!shouldRetryGet(error)) {
        throw error;
      }
      return await request();
    }
  });
}

export async function getSites(): Promise<Site[]> {
  return coalesceGet("sites", async () => {
    const { data } = await client.get<Site[]>("/api/sites");
    return data;
  });
}

export async function getSite(id: string): Promise<Site> {
  const { data } = await client.get<Site>(`/api/sites/${id}`);
  return data;
}

export async function getRecommendedSites(limit: number = 10): Promise<RecommendedSite[]> {
  return coalesceGet(`sites-recommended:${limit}`, async () => {
    const { data } = await client.get<RecommendedSite[]>("/api/sites/recommended", { params: { limit } });
    return data;
  });
}

export async function classifyByCoords(lat: number, lon: number): Promise<ClassifiedSite> {
  const { data } = await client.get<ClassifiedSite>("/api/sites/classify", { params: { lat, lon } });
  return data;
}

export async function classifyByName(q: string): Promise<ClassifiedSite> {
  const { data } = await client.get<ClassifiedSite>("/api/sites/classify", { params: { q } });
  return data;
}

export async function suggestLocations(q: string, limit: number = 8): Promise<LocationSuggestion[]> {
  const { data } = await client.get<LocationSuggestion[]>("/api/sites/suggest", { params: { q, limit } });
  return data;
}

export async function getChargers(): Promise<Charger[]> {
  return coalesceGet("chargers", async () => {
    const { data } = await client.get<Charger[]>("/api/chargers");
    return data;
  });
}

export async function getCharger(id: string): Promise<Charger> {
  const { data } = await client.get<Charger>(`/api/chargers/${id}`);
  return data;
}

/** Explicit, user-triggered live OpenChargeMap call for the given area --
 * never call this automatically (on page load, battery-% change, etc.).
 * See DriverHomePage.tsx's "Refresh nearby chargers" control. */
export async function refreshNearbyChargers(lat: number, lon: number, radiusKm: number = 10): Promise<Charger[]> {
  const { data } = await client.post<Charger[]>("/api/chargers/refresh", null, {
    params: { lat, lon, radius_km: radiusKm },
  });
  return data;
}

export async function createBooking(payload: BookingCreate): Promise<Booking> {
  const { data } = await client.post<Booking>("/api/bookings", {
    charger_id: payload.charger_id,
    slot_time: payload.slot_time,
    duration_minutes: payload.duration_minutes,
  });
  return data;
}

export async function getBookings(): Promise<Booking[]> {
  const { data } = await client.get<Booking[]>("/api/bookings");
  return data;
}

export async function getBooking(id: string): Promise<Booking> {
  const { data } = await client.get<Booking>(`/api/bookings/${id}`);
  return data;
}

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const { data } = await client.patch<Booking>(`/api/bookings/${bookingId}/cancel`);
  return data;
}

export async function getVehicles(): Promise<Vehicle[]> {
  const { data } = await client.get<Vehicle[]>("/api/vehicles");
  return data;
}

export async function createVehicle(payload: VehicleCreate): Promise<Vehicle> {
  const { data } = await client.post<Vehicle>("/api/vehicles", payload);
  return data;
}

export async function updateVehicle(id: string, payload: VehicleUpdate): Promise<Vehicle> {
  const { data } = await client.patch<Vehicle>(`/api/vehicles/${id}`, payload);
  return data;
}

export async function deleteVehicle(id: string): Promise<void> {
  await client.delete(`/api/vehicles/${id}`);
}

export interface RangeQueryParams {
  /** Driver's current location (not the vehicle's -- vehicles have no
   * stored location), used server-side only to look up ambient
   * temperature. Omit either one to skip the temperature adjustment. */
  lat?: number;
  lon?: number;
  climateControl?: boolean;
  drivingProfile?: DrivingProfile;
}

export async function getVehicleRange(id: string, params: RangeQueryParams = {}): Promise<RangeEstimate> {
  const { data } = await client.get<RangeEstimate>(`/api/vehicles/${id}/range`, {
    params: {
      lat: params.lat,
      lon: params.lon,
      climate_control: params.climateControl,
      driving_profile: params.drivingProfile,
    },
  });
  return data;
}

export async function getSlotPrice(slotIso: string, basePrice: number = 120.0): Promise<PricingTier> {
  const { data } = await client.get<PricingTier>("/api/pricing/calculate", {
    params: { slot_time: slotIso, base_price: basePrice },
  });
  return data;
}

export async function getPricingSchedule(slots: string[], basePrice: number): Promise<PricingTier[]> {
  const { data } = await client.post<{ schedule: PricingTier[] }>("/api/pricing/schedule", {
    slots,
    base_price: basePrice,
  });
  return data.schedule;
}

export async function getChargingSummary(): Promise<ChargingSummary> {
  const { data } = await client.get<ChargingSummary>("/api/driver/charging-summary");
  return data;
}

export async function getChargingQuote(chargerId: string, slots: string[], durationMinutes?: number): Promise<ChargingQuote> {
  const { data } = await client.post<ChargingQuote>("/api/driver/charging-quote", {
    charger_id: chargerId,
    slots,
    duration_minutes: durationMinutes,
  });
  return data;
}

export async function getAdminPlanners(statusFilter?: string): Promise<Profile[]> {
  const { data } = await client.get<Profile[]>("/api/admin/planners", {
    params: statusFilter ? { status: statusFilter } : undefined,
  });
  return data;
}

export async function approvePlanner(userId: string): Promise<Profile> {
  const { data } = await client.post<Profile>(`/api/admin/planners/${userId}/approve`);
  return data;
}

export async function rejectPlanner(userId: string, reason?: string): Promise<Profile> {
  const { data } = await client.post<Profile>(`/api/admin/planners/${userId}/reject`, {
    rejection_reason: reason,
  });
  return data;
}

// Gemini/Lyzr-backed endpoints can genuinely take longer than the default
// 10s client timeout -- gemini_service.ask_assistant() tries up to 3 models
// in sequence (30s each) before giving up, so a slow-but-real reply can take
// well over 10s without anything being wrong. Longer per-request timeout
// only for these two calls; everything else keeps the snappy 10s default so
// a genuinely broken endpoint still fails fast.
const ASSISTANT_TIMEOUT_MS = 60_000;

export async function sendAssistantMessage(message: string, sessionId: string): Promise<{ reply: string }> {
  const { data } = await client.post(
    "/api/assistant/chat",
    { message, session_id: sessionId },
    { timeout: ASSISTANT_TIMEOUT_MS },
  );
  return data;
}

export async function sendDriverAssistantMessage(
  message: string,
  sessionId: string,
  contextSummary: string,
): Promise<{ reply: string }> {
  const { data } = await client.post(
    "/api/driver/voice-assistant",
    { message, session_id: sessionId, context_summary: contextSummary },
    { timeout: ASSISTANT_TIMEOUT_MS },
  );
  return data;
}

// ── Planner Consideration ────────────────────────────────────────────────────

export async function getConsideration(): Promise<import("../types").ConsiderationItem[]> {
  const { data } = await client.get("/api/planner/consideration");
  return data;
}

export async function addToConsideration(siteId: string): Promise<import("../types").ConsiderationItem> {
  const { data } = await client.post(`/api/planner/consideration/${siteId}`);
  return data;
}

export async function removeFromConsideration(siteId: string): Promise<void> {
  await client.delete(`/api/planner/consideration/${siteId}`);
}

// ── Planner Reports ──────────────────────────────────────────────────────────

export async function getPlannerReports(): Promise<import("../types").PlannerReport[]> {
  const { data } = await client.get("/api/planner/reports");
  return data;
}

export async function createPlannerReport(
  payload: import("../types").ReportCreate,
): Promise<import("../types").PlannerReport> {
  const { data } = await client.post("/api/planner/reports", payload);
  return data;
}

export async function getPlannerReport(id: string): Promise<import("../types").PlannerReport> {
  const { data } = await client.get(`/api/planner/reports/${id}`);
  return data;
}

export async function deletePlannerReport(id: string): Promise<void> {
  await client.delete(`/api/planner/reports/${id}`);
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface CreateOrderPayload {
  booking_id: string;
  amount: number;
  currency?: string;
}

export interface CreateOrderResult {
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  razorpay_key_id: string;
}

export interface VerifyPaymentPayload {
  booking_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  booking_id: string;
  payment_status: string;
  booking_status: string;
  message: string;
}

export async function createPaymentOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  const { data } = await client.post<CreateOrderResult>("/api/payments/create-order", payload);
  return data;
}

export async function verifyPayment(payload: VerifyPaymentPayload): Promise<VerifyPaymentResult> {
  const { data } = await client.post<VerifyPaymentResult>("/api/payments/verify", payload);
  return data;
}

export async function getDriverIntelligence(payload: {
  latitude: number;
  longitude: number;
  preference?: DriverPreference;
  range_km?: number | null;
  energy_kwh?: number | null;
  charger_ids?: string[];
  include_demo_tradeoffs?: boolean;
}): Promise<DriverIntelligence> {
  const { data } = await client.post<DriverIntelligence>("/api/driver/intelligence", {
    ...payload,
    include_demo_tradeoffs: payload.include_demo_tradeoffs ?? import.meta.env.DEV,
  });
  return data;
}

export async function getCapacityGaps(): Promise<CapacityGap[]> {
  const { data } = await client.get<CapacityGap[]>("/api/planner/capacity-gaps");
  return data;
}

export async function getOperatorChargers(): Promise<OperatorCharger[]> {
  const { data } = await client.get<OperatorCharger[]>("/api/operator/chargers");
  return data;
}

export async function createOperatorCharger(payload: {
  name: string;
  latitude: number;
  longitude: number;
  power_kw: number;
  price_per_kwh: number;
  connector_type?: string;
  status?: string;
}): Promise<OperatorCharger> {
  const { data } = await client.post<OperatorCharger>("/api/operator/chargers", payload);
  return data;
}

export async function updateOperatorCharger(
  chargerId: string,
  payload: { status?: string; availability?: boolean; price_per_kwh?: number; name?: string; power_kw?: number },
): Promise<OperatorCharger> {
  const { data } = await client.patch<OperatorCharger>(`/api/operator/chargers/${chargerId}`, payload);
  return data;
}

export async function getOperatorBookings(): Promise<OperatorBooking[]> {
  const { data } = await client.get<OperatorBooking[]>("/api/operator/bookings");
  return data;
}

export async function getOperatorAnalytics(): Promise<OperatorAnalytics> {
  const { data } = await client.get<OperatorAnalytics>("/api/operator/analytics");
  return data;
}

export async function checkFastTrack(chargerId: string): Promise<FastTrackStatus> {
  const { data } = await client.post<FastTrackStatus>("/api/driver/fast-track/check", { charger_id: chargerId });
  return data;
}

export async function getChargerLiveStatus(chargerId: string): Promise<FastTrackStatus> {
  const { data } = await client.get<FastTrackStatus>(`/api/chargers/${chargerId}/live-status`);
  return data;
}

export async function confirmFastTrack(chargerId: string): Promise<Booking> {
  const { data } = await client.post<Booking>("/api/driver/fast-track/confirm", { charger_id: chargerId });
  return data;
}

export async function simulateOperatorPhysicalStatus(
  chargerId: string,
  physicalStatus: string,
): Promise<OperatorCharger> {
  const { data } = await client.post<OperatorCharger>(`/api/operator/chargers/${chargerId}/simulate-status`, {
    physical_status: physicalStatus,
    source: "SIMULATOR",
  });
  return data;
}

