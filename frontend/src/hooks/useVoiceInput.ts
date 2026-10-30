import { useCallback, useRef, useState } from "react";

// No official TS lib types ship for the Web Speech API (it's still
// non-standard); a small local shape covering only what this hook actually
// uses keeps the rest of the file honestly typed instead of reaching for
// `any` everywhere below.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceInputStatus = "idle" | "listening" | "unsupported" | "insecure_context" | "denied" | "error";

/** Press-to-talk, single utterance only -- no continuous/always-listening
 * mode. Same secure-context-check-before-feature-detect-before-request
 * pattern as DriverHomePage's requestLocation/geoStatus: a plain-HTTP,
 * non-localhost page must never even attempt to touch the API, the same way
 * geolocation is refused there before ever calling getCurrentPosition. */
export function useVoiceInput() {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const startListening = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) {
        setStatus("insecure_context");
        reject(new Error("insecure_context"));
        return;
      }
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setStatus("unsupported");
        reject(new Error("unsupported"));
        return;
      }

      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-IN";
      recognitionRef.current = recognition;
      setStatus("listening");

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        setStatus("idle");
        resolve(transcript);
      };
      recognition.onerror = (event) => {
        const nextStatus: VoiceInputStatus = event.error === "not-allowed" ? "denied" : "error";
        setStatus(nextStatus);
        reject(new Error(nextStatus));
      };
      recognition.onend = () => {
        recognitionRef.current = null;
      };

      recognition.start();
    });
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) {
      return;
    }
    window.speechSynthesis.cancel(); // cancel any in-progress utterance first
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }, []);

  return { status, startListening, speak };
}
