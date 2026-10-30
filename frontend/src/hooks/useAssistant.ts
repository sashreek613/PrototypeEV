import { useCallback, useRef, useState } from "react";

import { sendAssistantMessage } from "../services/api";
import { getErrorMessage } from "../utils/errors";

export interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
}

export type AssistantStatus = "idle" | "sending" | "error";

const FALLBACK_ERROR_TEXT = "Couldn't reach the assistant -- please try again.";

/** Status-machine shape modelled after useClassify in useApiData.ts: a plain
 * idle/sending/error status, not an invented alternative. The message list
 * (not the status) is the source of truth for conversation history -- status
 * only reflects the current in-flight request. */
export function useAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  // One stable session id for this panel's lifetime, generated once on
  // mount -- a ref (not state) because it's never re-rendered off of.
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setStatus("sending");

    sendAssistantMessage(trimmed, sessionIdRef.current)
      .then((data) => {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
        setStatus("idle");
      })
      .catch((err: unknown) => {
        setMessages((prev) => [...prev, { role: "assistant", text: getErrorMessage(err) || FALLBACK_ERROR_TEXT }]);
        setStatus("error");
      });
  }, []);

  return { messages, status, sendMessage };
}
