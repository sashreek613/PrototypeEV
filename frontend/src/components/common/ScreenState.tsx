import type { ReactNode } from "react";

interface ScreenStateProps {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyMessage?: string;
  tone?: "dark" | "light";
  children: ReactNode;
  /** Override the "Loading…" copy. Used by driver screens to pass a
   * localized string via t() -- omit to keep the English default, which is
   * what every planner call site does (this component is shared, and the
   * planner side isn't localised). */
  loadingText?: string;
  /** Override the "Could not load data." prefix shown before the raw error
   * string. Same driver-only localisation note as loadingText above. */
  errorLabel?: string;
}

export function ScreenState({
  loading,
  error,
  empty = false,
  emptyMessage = "Nothing to show yet.",
  tone = "dark",
  children,
  loadingText = "Loading…",
  errorLabel = "Could not load data.",
}: ScreenStateProps) {
  const muted = tone === "dark" ? "text-vo-muted" : "text-driver-muted";

  if (loading) {
    return <p className={`px-6 py-10 text-sm ${muted}`}>{loadingText}</p>;
  }
  if (error) {
    return (
      <p className="px-6 py-10 text-sm text-vo-red">
        {errorLabel} {error}
      </p>
    );
  }
  if (empty) {
    return <p className={`px-6 py-10 text-sm ${muted}`}>{emptyMessage}</p>;
  }
  return <>{children}</>;
}
