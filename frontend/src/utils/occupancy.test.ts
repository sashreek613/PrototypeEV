import { chargerStatusKind, occupancyMark, occupancyTone } from "./occupancy";
import { describe, expect, it } from "vitest";

describe("occupancyMark", () => {
  it("keeps the four driver-facing states", () => {
    expect(occupancyMark("AVAILABLE")).toBe("AVAILABLE");
    expect(occupancyMark("OCCUPIED")).toBe("OCCUPIED");
    expect(occupancyMark("RESERVED")).toBe("RESERVED");
    expect(occupancyMark("FAULTED")).toBe("UNAVAILABLE");
  });
});

describe("chargerStatusKind", () => {
  it("maps occupancy first, then physical status, then operator status", () => {
    expect(chargerStatusKind({ occupancy: "AVAILABLE", physical_status: "FAULTED" })).toBe("available");
    expect(chargerStatusKind({ occupancy: "OCCUPIED", availability: true })).toBe("busy");
    expect(chargerStatusKind({ occupancy: "UNAVAILABLE", availability: true })).toBe("unavailable");
    expect(chargerStatusKind({ physical_status: "CHARGING" })).toBe("busy");
    expect(chargerStatusKind({ physical_status: "FAULTED" })).toBe("unavailable");
    expect(chargerStatusKind({ status: "OFFLINE" })).toBe("unavailable");
  });

  it("maps operational synonyms and the availability boolean", () => {
    expect(chargerStatusKind({ status: "OPERATIONAL" })).toBe("available");
    expect(chargerStatusKind({ status: "OPERATIVE" })).toBe("available");
    expect(chargerStatusKind({ status: "LIMITED" })).toBe("busy");
    expect(chargerStatusKind({ availability: true })).toBe("available");
    expect(chargerStatusKind({ availability: false })).toBe("unavailable");
    expect(chargerStatusKind({ availability: null })).toBe("unknown");
  });
});

describe("occupancyTone", () => {
  it("uses green / yellow / red for available, busy, and down", () => {
    expect(occupancyTone("AVAILABLE")).toContain("vo-good");
    expect(occupancyTone("OCCUPIED")).toContain("vo-warn");
    expect(occupancyTone("CHARGING")).toContain("vo-warn");
    expect(occupancyTone("UNAVAILABLE")).toContain("vo-bad");
    expect(occupancyTone("FAULTED")).toContain("vo-bad");
  });
});
