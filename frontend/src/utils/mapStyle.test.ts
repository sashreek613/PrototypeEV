import { describe, expect, it } from "vitest";

import { getLightBasemapStyle } from "./mapStyle";

describe("getLightBasemapStyle", () => {
  it("returns a raster OSM style when no env style/key is set", () => {
    const style = getLightBasemapStyle();
    expect(typeof style).toBe("object");
    if (typeof style === "string") {
      throw new Error("expected inline raster style");
    }
    expect(style.version).toBe(8);
    expect(style.sources.osm).toMatchObject({ type: "raster" });
    const tiles = (style.sources.osm as { tiles?: string[] }).tiles ?? [];
    expect(tiles.some((tile) => tile.includes("tile.openstreetmap.org"))).toBe(true);
    expect(style.layers.some((layer) => layer.type === "raster" && layer.source === "osm")).toBe(true);
    expect(JSON.stringify(style)).not.toContain("openfreemap");
    expect(JSON.stringify(style)).not.toContain("cartocdn.com");
  });

  it("returns a stable cached identity across calls", () => {
    expect(getLightBasemapStyle()).toBe(getLightBasemapStyle());
  });
});
