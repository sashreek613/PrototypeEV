import { describe, expect, it } from "vitest";

import { congestionBadgeClass, congestionDotClass } from "./congestion";

describe("congestion helpers", () => {
  it("uses the good-token class for low demand", () => {
    expect(congestionBadgeClass("LOW")).toContain("vo-good");
    expect(congestionDotClass("LOW")).toContain("3d7a5a");
  });

  it("uses warn/bad tokens for moderate and high demand", () => {
    expect(congestionBadgeClass("MODERATE")).toContain("vo-warn");
    expect(congestionBadgeClass("HIGH")).toContain("vo-bad");
  });
});
