import { describe, expect, it } from "vitest";

import { homeForRole } from "./authRoutes";
import type { Profile } from "../types";

function profile(partial: Partial<Profile> & Pick<Profile, "role">): Profile {
  return {
    id: "user-1",
    full_name: "Test User",
    email: "test@example.com",
    is_verified: true,
    is_active: true,
    verification_status: "approved",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("homeForRole", () => {
  it("sends admin to /admin even if verification fields are missing", () => {
    expect(homeForRole(profile({ role: "admin", verification_status: undefined }))).toBe("/admin");
    expect(homeForRole("admin")).toBe("/admin");
  });

  it("sends drivers to /driver without admin approval", () => {
    expect(homeForRole(profile({ role: "driver", verification_status: "pending" }))).toBe("/driver");
  });

  it("keeps unapproved planners on the pending page", () => {
    expect(
      homeForRole(
        profile({
          role: "planner",
          is_verified: false,
          is_active: false,
          verification_status: "pending",
        }),
      ),
    ).toBe("/planner-pending");
    expect(
      homeForRole(
        profile({
          role: "planner",
          is_verified: false,
          is_active: false,
          verification_status: "rejected",
        }),
      ),
    ).toBe("/planner-pending");
  });

  it("sends approved planners to /planner", () => {
    expect(homeForRole(profile({ role: "planner", verification_status: "approved" }))).toBe("/planner");
  });

  it("sends operators to /operator without admin approval", () => {
    expect(homeForRole(profile({ role: "operator", verification_status: "pending" }))).toBe("/operator");
  });
});
