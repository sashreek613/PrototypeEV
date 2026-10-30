// Deliberately a small, fixed vocabulary -- NOT NLU, NOT an LLM in the loop.
// Every command here executes instantly and deterministically against
// DriverHomePage's EXISTING handlers/state setters, with zero network calls
// -- same rule as the planner side's scoring engine never being touched by
// Lyzr. Only a transcript that matches NONE of these falls through to the
// driver Lyzr agent (see VoiceAssistantButton.tsx).
//
// Pure function, no side effects -- easy to unit test in isolation (see
// voiceCommands.test.ts) without any speech APIs or React involved.

export type VoiceCommand =
  | { type: "search_location"; query: string }
  | { type: "clear_search" }
  | { type: "sort_cheapest" }
  | { type: "sort_fastest" }
  | { type: "sort_nearest" }
  | { type: "nearest_charger" }
  | { type: "show_range" };

// Checked before the location-search patterns below -- "clear search" would
// otherwise never match anything on its own (no "X" to extract), but a
// phrase like "reset" must not be swallowed by a looser search pattern.
const CLEAR_SEARCH_PATTERNS = [/^clear search$/i, /^back to my location$/i, /^reset$/i];

const SORT_CHEAPEST_PATTERNS = [/cheapest/i, /lowest price/i];
const SORT_FASTEST_PATTERNS = [/fastest/i, /fast charging/i];
// Regression guard: this must ONLY match explicit "change the sort order"
// phrasing, never a bare "nearest"/"closest" -- those words show up in
// genuine questions ("what's the nearest charging station") that must fall
// through to nearest_charger (or the Lyzr agent), not get swallowed here.
// See voiceCommands.test.ts for the exact phrases that broke this before.
const SORT_NEAREST_PATTERNS = [/sort by nearest/i, /sort nearest first/i, /show nearest first/i];
// "nearest/closest charger/station" questions -- answered deterministically
// from the already-computed `recommended` list (see VoiceAssistantButton's
// nearestOf()), never sent to Lyzr. Checked BEFORE sort_nearest below since
// it's the more specific pattern of the two.
const NEAREST_CHARGER_PATTERNS = [/(nearest|closest|nearby)\s+(charging\s+)?(charger|station)/i];

const SHOW_RANGE_PATTERNS = [/how far can i go/i, /my range/i, /how much range/i, /battery range/i];

// Captures the remainder of the phrase as the search query -- "search
// Koramangala", "find chargers near indiranagar", "navigate near HSR
// Layout", "chargers in whitefield". Ordered longest-prefix-first so
// "find chargers near X" doesn't get short-circuited by a looser "find X".
const SEARCH_LOCATION_PATTERNS = [
  /^find chargers near\s+(.+)$/i,
  /^navigate near\s+(.+)$/i,
  /^chargers in\s+(.+)$/i,
  /^search\s+(.+)$/i,
  /^find\s+(.+)$/i,
];

export function matchVoiceCommand(transcript: string): VoiceCommand | null {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return null;
  }

  if (CLEAR_SEARCH_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "clear_search" };
  }
  if (SHOW_RANGE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "show_range" };
  }
  if (SORT_CHEAPEST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "sort_cheapest" };
  }
  if (SORT_FASTEST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "sort_fastest" };
  }
  // More specific ("nearest CHARGER/STATION") before more general ("sort by
  // nearest") -- see the comments on both pattern lists above.
  if (NEAREST_CHARGER_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "nearest_charger" };
  }
  if (SORT_NEAREST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "sort_nearest" };
  }
  for (const pattern of SEARCH_LOCATION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) {
      return { type: "search_location", query: match[1].trim() };
    }
  }
  return null;
}
