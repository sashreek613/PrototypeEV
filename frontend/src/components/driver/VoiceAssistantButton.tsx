import { useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";

import { useDriverAssistant } from "../../hooks/useDriverAssistant";
import { useVoiceInput, type VoiceInputStatus } from "../../hooks/useVoiceInput";
import { matchVoiceCommand } from "../../utils/voiceCommands";
import type { Charger } from "../../types";
import { useT } from "../../i18n";

// Same "written like a short status line" style as DriverHomePage's geo
// status copy -- one clear sentence per terminal state, never a raw error
// object or a silent failure. Keys into locales/en.json (this constant lives
// outside the component, so it can't call useT() itself).
const VOICE_STATUS_KEY: Record<Exclude<VoiceInputStatus, "idle" | "listening">, string> = {
  unsupported: "voice.status.unsupported",
  insecure_context: "voice.status.insecure_context",
  denied: "voice.status.denied",
  error: "voice.status.error",
};

export interface VoiceRecommendedRow {
  charger: Pick<Charger, "name" | "availability">;
  km: number;
}

interface VoiceAssistantButtonProps {
  onSearchLocation: (query: string) => void;
  onClearSearch: () => void;
  onSetSort: (sort: "nearest" | "cheapest" | "fastest") => void;
  bufferedRangeKm: number | null;
  recommended: VoiceRecommendedRow[];
}

// Only what this component actually sends to the fallback Lyzr agent --
// already-computed data, never recomputed or re-derived here. This is the
// ONE place this compact summary gets built; the reachable-charger
// computation's one source of truth stays DriverHomePage's useMemo chain.
function buildContextSummary(recommended: VoiceRecommendedRow[], bufferedRangeKm: number | null): string {
  const rangeLine =
    bufferedRangeKm !== null
      ? `Driver's remaining range: ${Math.round(bufferedRangeKm)} km.`
      : "Driver's remaining range: unknown (no vehicle selected).";
  if (recommended.length === 0) {
    return `${rangeLine} No chargers currently recommended.`;
  }
  const lines = recommended.map((row, i) => {
    const availability =
      row.charger.availability === true ? "available" : row.charger.availability === false ? "unavailable" : "availability unknown";
    return `${i + 1}. ${row.charger.name} -- ${row.km.toFixed(1)} km away, ${availability}.`;
  });
  return [rangeLine, "Recommended chargers:", ...lines].join(" ");
}

// The single nearest row among what's already been computed -- not just
// `recommended[0]`, since that list is sorted by a blended composite score
// (distance/availability/power, see chargerRanking.ts), not pure distance.
// A genuine "what's the nearest charger" question deserves the actual
// minimum-km answer, computed here with zero network calls and no new
// distance math (row.km is already-computed data, just compared, not
// recalculated).
function nearestOf(recommended: VoiceRecommendedRow[]): VoiceRecommendedRow | null {
  if (recommended.length === 0) {
    return null;
  }
  return recommended.reduce((closest, row) => (row.km < closest.km ? row : closest));
}

function confirmationFor(
  command: ReturnType<typeof matchVoiceCommand>,
  { bufferedRangeKm, recommended }: { bufferedRangeKm: number | null; recommended: VoiceRecommendedRow[] },
): string {
  if (!command) {
    return "";
  }
  switch (command.type) {
    case "search_location":
      return `Searching near ${command.query}`;
    case "clear_search":
      return "Back to your location";
    case "sort_cheapest":
      return "Sorted by cheapest";
    case "sort_fastest":
      return "Sorted by fastest charging";
    case "sort_nearest":
      return "Sorted by nearest";
    case "nearest_charger": {
      const nearest = nearestOf(recommended);
      return nearest ? `${nearest.charger.name} is nearest, ${nearest.km.toFixed(1)} kilometers away` : "No chargers currently recommended";
    }
    case "show_range":
      return bufferedRangeKm !== null
        ? `You can go about ${Math.round(bufferedRangeKm)} kilometers`
        : "Add a vehicle to see your range";
  }
}

/** Hands-free voice assistant for the driver home page. Press-to-talk, single
 * utterance only -- see useVoiceInput.ts. A transcript is matched against a
 * small FIXED command vocabulary first (frontend/src/utils/voiceCommands.ts,
 * zero network calls, executes existing handlers directly); only an
 * unmatched transcript falls through to the driver-scoped Lyzr agent. */
export function VoiceAssistantButton({ onSearchLocation, onClearSearch, onSetSort, bufferedRangeKm, recommended }: VoiceAssistantButtonProps) {
  const t = useT();
  const { status, startListening, speak } = useVoiceInput();
  const { status: assistantStatus, sendMessage } = useDriverAssistant();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  // handleTap is `async` and awaits startListening(), which can take several
  // seconds while the driver is speaking. If origin/range/recommended update
  // DURING that wait (e.g. GPS resolves from the "pending" fallback origin
  // to the real one mid-utterance), a plain closure over the `recommended`/
  // `bufferedRangeKm` props would keep using whatever was true when the tap
  // STARTED, not when the context is actually built after the await -- a
  // stale value the on-screen ChargerCards (re-rendered with fresh props by
  // then) would no longer agree with. Keeping the latest props on a ref,
  // updated every render, means the post-await read below always reflects
  // what's true right now, matching what's on screen at that moment.
  const latestPropsRef = useRef({ bufferedRangeKm, recommended });
  latestPropsRef.current = { bufferedRangeKm, recommended };

  async function handleTap() {
    setTranscript(null);
    let heard: string;
    try {
      heard = await startListening();
    } catch {
      return; // useVoiceInput already set a visible status (denied/unsupported/insecure_context/error)
    }
    setTranscript(heard);

    const command = matchVoiceCommand(heard);
    if (command) {
      switch (command.type) {
        case "search_location":
          onSearchLocation(command.query);
          break;
        case "clear_search":
          onClearSearch();
          break;
        case "sort_cheapest":
          onSetSort("cheapest");
          break;
        case "sort_fastest":
          onSetSort("fastest");
          break;
        case "sort_nearest":
          onSetSort("nearest");
          break;
        case "nearest_charger":
        case "show_range":
          break; // nothing to execute -- confirmationFor() already narrates the answer
      }
      speak(confirmationFor(command, latestPropsRef.current));
      return;
    }

    setThinking(true);
    const { recommended: liveRecommended, bufferedRangeKm: liveBufferedRangeKm } = latestPropsRef.current;
    const contextSummary = buildContextSummary(liveRecommended, liveBufferedRangeKm);
    // TEMP DEBUG (per investigation into wrong/context-less Lyzr replies) --
    // leave in until confirmed working end to end, then remove.
    console.log("[voice-assistant debug] context_summary sent to Lyzr:", contextSummary);
    // TEMP DEBUG (BUG 1 verification) -- proves the top on-screen charger's
    // distance and the same charger's distance inside context_summary come
    // from the exact same `recommended` row, at the exact same read, with no
    // separate recomputation anywhere in this file. Remove alongside the
    // debug line above once confirmed.
    if (liveRecommended[0]) {
      console.log("[voice-assistant debug] on-screen top charger:", liveRecommended[0].charger.name, liveRecommended[0].km.toFixed(1), "km");
    }
    const reply = await sendMessage(heard, contextSummary);
    setThinking(false);
    speak(reply);
  }

  const busy = status === "listening" || thinking;
  const showStatusMessage = status !== "idle" && status !== "listening";

  return (
    <div className="rounded-2xl border border-vo-line bg-vo-card p-4 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleTap()}
          disabled={busy}
          aria-label={t("voice.tap_to_speak_aria")}
          className={
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-colors " +
            (status === "listening"
              ? "bg-vo-red text-white animate-pulse"
              : "bg-vo-accent text-vo-bg disabled:opacity-60")
          }
        >
          {status === "listening" ? <MicOff size={26} /> : <Mic size={26} />}
        </button>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-driver-ink">
            {status === "listening" ? t("voice.listening") : thinking ? t("voice.thinking") : t("voice.assistant_label")}
          </p>
          <p className="text-[11px] text-vo-muted">{t("voice.hint")}</p>
        </div>
        {assistantStatus === "sending" || thinking ? <Volume2 size={16} className="ml-auto shrink-0 text-vo-accent-ink animate-pulse" /> : null}
      </div>

      {transcript ? (
        <p className="rounded-xl border border-vo-line bg-vo-bg/40 px-3 py-2 text-[12px] text-driver-ink">
          "{transcript}"
        </p>
      ) : null}

      {showStatusMessage ? (
        <p className="rounded-xl border border-vo-warn-border bg-vo-warn-bg px-3 py-2 text-[11px] text-vo-warn-ink">
          {t(VOICE_STATUS_KEY[status])}
        </p>
      ) : null}
    </div>
  );
}
