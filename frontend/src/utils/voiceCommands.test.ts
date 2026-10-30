import { describe, expect, it } from "vitest";

import { matchVoiceCommand } from "./voiceCommands";

describe("matchVoiceCommand", () => {
  it("matches a location search phrase and extracts the query", () => {
    expect(matchVoiceCommand("search Koramangala")).toEqual({ type: "search_location", query: "Koramangala" });
    expect(matchVoiceCommand("find chargers near Indiranagar")).toEqual({
      type: "search_location",
      query: "Indiranagar",
    });
    expect(matchVoiceCommand("navigate near HSR Layout")).toEqual({ type: "search_location", query: "HSR Layout" });
    expect(matchVoiceCommand("chargers in Whitefield")).toEqual({ type: "search_location", query: "Whitefield" });
  });

  it("matches cheapest", () => {
    expect(matchVoiceCommand("cheapest")).toEqual({ type: "sort_cheapest" });
    expect(matchVoiceCommand("show me the lowest price")).toEqual({ type: "sort_cheapest" });
  });

  it("matches fastest", () => {
    expect(matchVoiceCommand("fastest")).toEqual({ type: "sort_fastest" });
    expect(matchVoiceCommand("fast charging please")).toEqual({ type: "sort_fastest" });
  });

  it("matches sort_nearest ONLY for explicit sort phrasing, not a bare nearest/closest", () => {
    expect(matchVoiceCommand("sort by nearest")).toEqual({ type: "sort_nearest" });
    expect(matchVoiceCommand("sort nearest first")).toEqual({ type: "sort_nearest" });
    expect(matchVoiceCommand("show nearest first")).toEqual({ type: "sort_nearest" });
  });

  // Regression guard: these used to be swallowed by a bare /nearest/i or
  // /closest/i pattern in SORT_NEAREST_PATTERNS, always answering "sorted by
  // nearest" instead of the actual question. "nearest"/"closest" alone (no
  // "charger"/"station") has no fixed match and must fall through to Lyzr.
  it("matches nearest_charger for nearest/closest charger or station questions, not sort_nearest", () => {
    expect(matchVoiceCommand("nearest charger")).toEqual({ type: "nearest_charger" });
    expect(matchVoiceCommand("what's the nearby charging station")).toEqual({ type: "nearest_charger" });
    expect(matchVoiceCommand("what is the nearest charging station")).toEqual({ type: "nearest_charger" });
    expect(matchVoiceCommand("closest charger")).toEqual({ type: "nearest_charger" });
    expect(matchVoiceCommand("what's the closest station")).toEqual({ type: "nearest_charger" });
    expect(matchVoiceCommand("where's the nearest station")).toEqual({ type: "nearest_charger" });
  });

  it("does not match sort_nearest or nearest_charger for a bare 'nearest'/'closest' with no charger/station/sort wording", () => {
    expect(matchVoiceCommand("nearest")).toBeNull();
    expect(matchVoiceCommand("closest one")).toBeNull();
  });

  it("matches clear search / reset", () => {
    expect(matchVoiceCommand("clear search")).toEqual({ type: "clear_search" });
    expect(matchVoiceCommand("back to my location")).toEqual({ type: "clear_search" });
    expect(matchVoiceCommand("reset")).toEqual({ type: "clear_search" });
  });

  it("matches how far can I go / range questions", () => {
    expect(matchVoiceCommand("how far can I go")).toEqual({ type: "show_range" });
    expect(matchVoiceCommand("what's my range")).toEqual({ type: "show_range" });
    expect(matchVoiceCommand("how much range do I have")).toEqual({ type: "show_range" });
    expect(matchVoiceCommand("battery range")).toEqual({ type: "show_range" });
  });

  it("returns null for an unmatched phrase, falling through to the Lyzr agent", () => {
    expect(matchVoiceCommand("what's the weather like today")).toBeNull();
    expect(matchVoiceCommand("")).toBeNull();
    expect(matchVoiceCommand("   ")).toBeNull();
  });
});
