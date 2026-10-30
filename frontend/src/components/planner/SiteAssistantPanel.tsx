import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

import { useAssistant } from "../../hooks/useAssistant";
import { NOT_CONFIGURED_MESSAGE } from "../../utils/assistantMessages";

const STARTER_QUESTIONS = [
  "Which sites need grid upgrades?",
  "Why is the top site ranked #1?",
  "What's holding back the lowest-scoring site?",
];

/** Floating chat panel, collapsed to a small button bottom-right by default.
 * Purely additive to the planner dashboard -- reads already-computed site
 * data via the backend assistant endpoint, never scores or recalculates
 * anything itself (see backend/app/services/lyzr_service.py). */
export function SiteAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { messages, status, sendMessage } = useAssistant();

  function submit() {
    if (status === "sending" || !draft.trim()) {
      return;
    }
    sendMessage(draft);
    setDraft("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask about these sites"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white shadow-lg hover:bg-[#3F5F8F] dark:hover:bg-[#5D7EA8] transition-colors"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[460px] w-[340px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-[var(--vo-border)] bg-[var(--vo-surface)] shadow-xl">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--vo-border)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white">
            <MessageCircle className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-[var(--vo-text)] leading-none">Site Assistant</h3>
            <p className="text-[10px] text-[var(--vo-muted)] mt-0.5">Answers from scored dashboard data</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="rounded-lg p-1 text-[var(--vo-muted)] hover:bg-[var(--vo-bg)] hover:text-[var(--vo-text)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4 bg-[var(--vo-bg)]">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--vo-muted)]">
              Ask about ranked sites, scores, or recommendations:
            </p>
            <div className="flex flex-col gap-2">
              {STARTER_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => sendMessage(question)}
                  className="rounded-lg border border-[var(--vo-border)] bg-[var(--vo-surface)] px-3 py-2 text-left text-[11px] text-[var(--vo-soft)] transition-colors hover:border-[#4F6F9F] hover:text-[#4F6F9F] dark:hover:text-[#6F8FB8]"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, i) => (
            <div key={i} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.role === "user"
                    ? "max-w-[85%] rounded-xl rounded-br-sm bg-[#EEF2F7] dark:bg-[#6F8FB8]/15 px-3 py-2 text-[11px] text-[#4F6F9F] dark:text-[#6F8FB8]"
                    : `max-w-[85%] rounded-xl rounded-bl-sm border border-[var(--vo-border)] bg-[var(--vo-surface)] px-3 py-2 text-[11px] text-[var(--vo-text)] whitespace-pre-wrap ${
                        message.text === NOT_CONFIGURED_MESSAGE
                          ? "text-[var(--vo-muted)] italic"
                          : ""
                      }`
                }
              >
                {message.text}
              </div>
            </div>
          ))
        )}
        {status === "sending" ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-[var(--vo-border)] bg-[var(--vo-surface)] px-3 py-2 text-[11px] text-[var(--vo-muted)]">
              Thinking…
            </div>
          </div>
        ) : null}
      </div>

      {/* Input */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--vo-border)] bg-[var(--vo-surface)] p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask a question…"
          disabled={status === "sending"}
          className="flex-1 rounded-lg border border-[var(--vo-border)] bg-[var(--vo-bg)] px-3 py-2 text-[11px] text-[var(--vo-text)] placeholder:text-[var(--vo-muted)] outline-none focus:border-[#4F6F9F] focus:ring-1 focus:ring-[#4F6F9F] disabled:opacity-60 transition-colors"
        />
        <button
          type="button"
          onClick={submit}
          disabled={status === "sending" || !draft.trim()}
          aria-label="Send message"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white hover:bg-[#3F5F8F] dark:hover:bg-[#5D7EA8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
