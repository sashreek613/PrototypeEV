export type OccupancyState = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "UNAVAILABLE";

export type ChargerStatusKind = "available" | "busy" | "unavailable" | "unknown";

const GREEN_STATUSES = new Set(["AVAILABLE", "OPERATIVE", "OPERATIONAL"]);
const YELLOW_STATUSES = new Set([
  "BUSY",
  "CHARGING",
  "LIMITED",
  "OCCUPIED",
  "RESERVED",
  "PREPARING",
  "SUSPENDED",
  "FINISHING",
]);
const RED_STATUSES = new Set(["OFFLINE", "FAULTED", "UNAVAILABLE", "MAINTENANCE"]);

function kindFromToken(value: string | null | undefined): ChargerStatusKind | null {
  const token = (value ?? "").trim().toUpperCase();
  if (!token) {
    return null;
  }
  if (GREEN_STATUSES.has(token)) {
    return "available";
  }
  if (YELLOW_STATUSES.has(token)) {
    return "busy";
  }
  if (RED_STATUSES.has(token)) {
    return "unavailable";
  }
  return null;
}

export function chargerStatusKind(charger: {
  occupancy?: string | null;
  physical_status?: string | null;
  status?: string | null;
  availability?: boolean | null;
}): ChargerStatusKind {
  return (
    kindFromToken(charger.occupancy) ??
    kindFromToken(charger.physical_status) ??
    kindFromToken(charger.status) ??
    (charger.availability === true ? "available" : charger.availability === false ? "unavailable" : "unknown")
  );
}

export function occupancyTone(occupancy: string | null | undefined): string {
  const kind = kindFromToken(occupancy) ?? "unknown";
  if (kind === "available") {
    return "bg-vo-good-bg text-vo-good-ink border-vo-good-border";
  }
  if (kind === "busy") {
    return "bg-vo-warn-bg text-vo-warn-ink border-vo-warn-border";
  }
  if (kind === "unavailable") {
    return "bg-vo-bad-bg text-vo-bad-ink border-vo-bad-border";
  }
  return "bg-vo-card text-vo-muted border-vo-line";
}

export function chargerStatusTextClass(kind: ChargerStatusKind): string {
  if (kind === "available") {
    return "text-[#3d7a5a]";
  }
  if (kind === "busy") {
    return "text-[#9e7d3b]";
  }
  if (kind === "unavailable") {
    return "text-vo-bad-ink";
  }
  return "text-driver-muted";
}

export function occupancyMark(occupancy: string | null | undefined): string {
  if (occupancy === "AVAILABLE") return "AVAILABLE";
  if (occupancy === "OCCUPIED") return "OCCUPIED";
  if (occupancy === "RESERVED") return "RESERVED";
  return "UNAVAILABLE";
}
