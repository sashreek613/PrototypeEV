import { useCallback, useRef, useState } from "react";

import { sendDriverAssistantMessage } from "../services/api";
import { getErrorMessage } from "../utils/errors";

export interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
}

export type AssistantStatus = "idle" | "sending" | "error";

const FALLBACK_ERROR_TEXT = "Couldn't reach the assistant -- please try again.";

/** Mirrors useAssistant.ts's structure/status machine exactly (the planner
 * side's chat hook) -- the only difference is sendMessage also takes a
 * contextSummary, since the driver assistant's context is built by the
 * caller (VoiceAssistantButton.tsx, from data DriverHomePage already
 * computed) rather than assembled server-side from a DB query. */
export function useDriverAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Returns the reply text (or the fallback message) so VoiceAssistantButton
  // can speak() it once it resolves, on top of the same idle/sending/error
  // status machine + message-list update useAssistant.ts uses.
  const sendMessage = useCallback((text: string, contextSummary: string): Promise<string> => {
    const trimmed = text.trim();
    if (!trimmed) {
      return Promise.resolve("");
    }
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setStatus("sending");

    return sendDriverAssistantMessage(trimmed, sessionIdRef.current, contextSummary)
      .then((data) => {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
        setStatus("idle");
        return data.reply;
      })
      .catch((err: unknown) => {
        const message = getErrorMessage(err) || FALLBACK_ERROR_TEXT;
        setMessages((prev) => [...prev, { role: "assistant", text: message }]);
        setStatus("error");
        return message;
      });
  }, []);

  return { messages, status, sendMessage };
}
