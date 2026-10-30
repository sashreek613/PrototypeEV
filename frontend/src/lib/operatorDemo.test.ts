import { describe, expect, it } from "vitest";

import { demoOperatorProfile, isOperatorDemoProfile } from "./operatorDemo";

describe("operator demo identity", () => {
  it("labels the demo operator clearly", () => {
    const profile = demoOperatorProfile();
    expect(profile.role).toBe("operator");
    expect(profile.organization).toBe("Operator Demo Mode");
    expect(isOperatorDemoProfile(profile)).toBe(true);
  });
});
