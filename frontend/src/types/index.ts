export type Recommendation = "BUILD" | "BUILD_IF_MANAGED" | "DONT_BUILD";

// How much to trust a sub-score. REAL/DERIVED/ESTIMATED are the honesty
// tiers the scoring engine is built on (see backend/app/engines/site_scoring.py);
// DEMO flags a value that's placeholder data, not a real source yet (e.g.
// coverage_gap before OpenChargeMap is wired in).
export type Provenance = "REAL" | "DERIVED" | "ESTIMATED" | "DEMO";

export interface ScoredFactor {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  provenance: Provenance;
  detail: string;
}

export type BookingStatus =
  | "AVAILABLE"
  | "PAYMENT_PENDING"
  | "BOOKED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "PAYMENT_FAILED";

export type UserRole = "planner" | "driver" | "admin" | "operator";

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  organization?: string | null;
  phone_number?: string | null;
  designation?: string | null;
  is_verified?: boolean;
  is_active?: boolean;
  verification_status?: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  created_at: string;
}


export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  demand_score: number;
  grid_capacity_score: number;
  accessibility_score: number;
  charger_gap_score: number;
  site_score: number;
  recommendation: Recommendation;
  // Optional so pages/components compiled against the old API shape keep
  // working -- present once the backend scoring engine (Phase B) is live.
  factors?: ScoredFactor[];
  explanation?: string;
}

export interface RecommendedSite extends Site {
  rank: number;
}

export interface NearestCandidate {
  id: string;
  name: string;
  site_score: number;
  recommendation: Recommendation;
  distance_km: number;
}

// GET /api/sites/classify -- an arbitrary lat/lon or name-resolved point,
// scored by the same engine as Site/RecommendedSite. Deliberately has no
// `id`: this point may not correspond to any seeded candidate.
export interface ClassifiedSite {
  name: string;
  latitude: number;
  longitude: number;
  demand_score: number;
  grid_capacity_score: number;
  accessibility_score: number;
  charger_gap_score: number;
  site_score: number;
  recommendation: Recommendation;
  factors: ScoredFactor[];
  explanation: string;
  in_bbox: boolean;
  nearest_candidate: NearestCandidate | null;
}

// GET /api/sites/suggest -- offline name-index autocomplete result.
export interface LocationSuggestion {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: "candidate_site" | "locality";
}

export type ChargerProvenance = "DEMO" | "REAL";

export interface Charger {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  // Nullable because REAL (OpenChargeMap) entries honestly don't always
  // have these -- DEMO entries always populate every one. Not a rename;
  // mirrors backend/app/schemas/charger.py's ChargerBase exactly.
  power_kw: number | null;
  price_per_kwh: number | null;
  // Infrastructure-operational status for REAL chargers (OCM's StatusType),
  // NOT live per-plug occupancy -- null means OCM had no status data.
  // DEMO chargers keep the old true/false live-occupancy meaning.
  availability: boolean | null;
  connector_type: string;
  site_id: string | null;
  // Optional so any code still constructing a Charger against the old
  // shape keeps compiling; the live API always sends both.
  provenance?: ChargerProvenance;
  bookable?: boolean;
  status?: string | null;
  operator_id?: string | null;
  physical_status?: string | null;
  physical_status_source?: string | null;
  occupancy?: string | null;
  occupancy_detail?: string | null;
}

export interface Booking {
  id: string;
  user_id: string;
  charger_id: string;
  slot_time: string;
  price: number;
  status: BookingStatus;
  created_at: string;
  duration_minutes?: number;
  charger?: Charger;
}

export interface BookingCreate {
  charger_id: string;
  slot_time: string;
  price?: number;
  duration_minutes?: number;
}

export interface Vehicle {
  id: string;
  user_id: string;
  make: string;
  model: string;
  battery_capacity_kwh: number;
  current_battery_pct: number;
  efficiency_wh_km: number;
  is_primary: boolean;
  // Registration/purchase date (YYYY-MM-DD), null if unknown. Age is always
  // derived fresh from this on every range calculation -- never re-typed.
  // See backend/app/services/battery_health_service.py.
  registration_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleCreate {
  make: string;
  model: string;
  battery_capacity_kwh: number;
  current_battery_pct?: number;
  efficiency_wh_km?: number;
  is_primary?: boolean;
  registration_date?: string | null;
}

export interface VehicleUpdate {
  make?: string;
  model?: string;
  battery_capacity_kwh?: number;
  current_battery_pct?: number;
  efficiency_wh_km?: number;
  is_primary?: boolean;
  registration_date?: string | null;
}

export type DrivingProfile = "city" | "mixed" | "highway";

// One multiplier in range_service.py's transparent adjustment chain --
// same "show your work" pattern as ScoredFactor on the planner side.
export interface RangeFactor {
  key: string;
  label: string;
  multiplier: number;
  detail: string;
}

export interface RangeEstimate {
  battery_capacity_kwh: number;
  current_battery_pct: number;
  available_kwh: number;
  efficiency_wh_km: number;
  estimated_range_km: number;
  // Reserve-adjusted figures -- see RESERVE_BATTERY_PCT in
  // backend/app/services/range_service.py. buffered_range_km is the one to
  // use for any "can I reach this charger" decision.
  buffered_range_km: number;
  reserve_pct: number;
  // Temperature / climate control / driving profile / battery health by
  // age adjustments -- always 4 entries, each defaulting to multiplier 1.0
  // (no-op) when the caller doesn't opt into them / the vehicle has no
  // registration_date on file.
  factors: RangeFactor[];
}

export interface PricingTier {
  slot_iso: string;
  price: number;
  is_peak: boolean;
  is_off_peak: boolean;
  savings_amount: number;
  description: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

export interface ChargingSession {
  booking_id: string;
  charger_id: string;
  station_name: string;
  slot_time: string;
  window_label: string;
  is_peak: boolean;
  is_off_peak: boolean;
  energy_kwh: number | null;
  cost: number;
  savings: number | null;
  status: BookingStatus;
}

export interface MonthlyChargingSummary {
  sessions: number;
  cost: number | null;
  savings: number | null;
  energy_kwh: number | null;
  avg_cost_per_session: number | null;
  avg_cost_per_kwh: number | null;
}

export interface MonthlyTrendPoint {
  month: string;
  label: string;
  cost: number;
  energy_kwh: number | null;
}

export interface ChargingInsight {
  kind: "saved" | "could_save";
  amount: number;
  text: string;
}

export interface ChargingSummary {
  history: ChargingSession[];
  month: MonthlyChargingSummary;
  trend: MonthlyTrendPoint[];
  last_session: ChargingSession | null;
  insight: ChargingInsight | null;
  total_energy_kwh: number | null;
}

export interface ChargingSlotQuote {
  slot_time: string;
  tariff_per_kwh: number;
  total: number;
  is_peak: boolean;
  is_off_peak: boolean;
  savings_amount: number;
  description: string;
  window_label: string;
}

export interface ChargingQuote {
  energy_kwh: number;
  quotes: ChargingSlotQuote[];
}

// ── Planner Consideration & Reports ─────────────────────────────────────────

export interface ConsiderationItem {
  id: string;
  site_id: string;
  added_at: string;
}

export interface PlannerReport {
  id: string;
  title: string;
  site_ids: string[];
  division: string | null;
  created_at: string;
}

export interface ReportCreate {
  site_ids: string[];
  title?: string;
  division?: string | null;
}

export type DriverPreference = "balanced" | "minimize_time" | "minimize_cost";

export interface CongestionInfo {
  charger_id: string;
  level: "LOW" | "MODERATE" | "HIGH";
  estimated_wait_minutes: number;
  upcoming_bookings_2h: number;
  occupancy_now: boolean;
  busy_period_label: string;
  provenance: string;
  detail: string;
}

export interface RecommendedChargerInfo {
  charger_id: string;
  name: string;
  km: number;
  power_kw: number | null;
  price_per_kwh: number | null;
  estimated_wait_minutes: number;
  estimated_charge_minutes: number;
  estimated_travel_minutes: number;
  estimated_cost: number;
  energy_kwh: number;
  overall_score: number;
  congestion: CongestionInfo;
  station_utilization: number;
  why: string;
  reachable: boolean;
  provenance: string;
}

export interface OptimizerOption {
  kind: "fastest" | "cheapest" | "best_overall" | string;
  charger: RecommendedChargerInfo;
  reason?: string;
}

export interface AlternativeRecommendation {
  congested: RecommendedChargerInfo;
  recommended: RecommendedChargerInfo;
  extra_km: number;
  wait_saved_minutes: number;
  cost_saved: number;
  explanation: string;
}

export interface SmartTimeRecommendation {
  charger_id: string;
  charger_name: string;
  slot_iso: string;
  label: string;
  estimated_cost: number;
  current_cost: number;
  savings: number;
  is_off_peak: boolean;
  is_peak: boolean;
  expected_demand: string;
  provenance: string;
  detail: string;
}

export interface DriverIntelligence {
  preference: DriverPreference;
  recommended: RecommendedChargerInfo | null;
  ranked: RecommendedChargerInfo[];
  congestion: CongestionInfo[];
  optimizer: OptimizerOption[];
  alternative: AlternativeRecommendation | null;
  smart_time: SmartTimeRecommendation | null;
  weights: Record<string, number>;
  provenance_note: string;
}

export interface CapacityGap {
  cell_id: string;
  area_label: string;
  latitude: number;
  longitude: number;
  charger_count: number;
  total_kw: number;
  bookings_24h: number;
  peak_utilization: number;
  demand: string;
  capacity: string;
  expected_congestion: string;
  nearest_site_id: string | null;
  nearest_site_name: string | null;
  site_recommendation: string | null;
  action: string;
  provenance: string;
  detail: string;
}

export interface OperatorCharger {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  power_kw: number;
  price_per_kwh: number;
  connector_type: string;
  status: string;
  availability: boolean;
  occupancy: string;
  site_id: string | null;
  created_at: string;
  physical_status?: string | null;
  physical_status_source?: string | null;
  unexpected_occupancy?: boolean;
  occupancy_detail?: string | null;
  qr_path?: string | null;
}

export interface OperatorBooking {
  id: string;
  charger_id: string;
  charger_name: string;
  slot_time: string;
  duration_minutes: number;
  price: number;
  status: string;
  window_label: string;
}

export interface OperatorInsight {
  kind: string;
  title: string;
  body: string;
  provenance: string;
  charger_id?: string | null;
  charger_name?: string | null;
}

export interface OperatorAnalytics {
  total_stations: number;
  total_chargers: number;
  available_chargers: number;
  occupied_chargers: number;
  maintenance_chargers: number;
  upcoming_bookings: number;
  total_bookings: number;
  utilization_pct: number;
  revenue: number;
  average_booking_value?: number | null;
  peak_usage_period: string | null;
  repeat_users: number | null;
  insights: OperatorInsight[];
  station_insights?: OperatorInsight[];
  provenance_note: string;
}

export interface FastTrackStatus {
  charger_id: string;
  name: string;
  occupancy: string;
  physical_status: string;
  physical_status_source: string;
  booking_state: string;
  driver_message: string;
  bookable: boolean;
  unexpected_occupancy: boolean;
  conflict: boolean;
  provenance: string;
  power_kw: number | null;
  price_per_kwh: number | null;
  latitude: number | null;
  longitude: number | null;
  poll_hint: string;
}
