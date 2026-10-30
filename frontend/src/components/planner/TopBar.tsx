import { useNavigate } from "react-router-dom";

import { ThemeToggle } from "../common/ThemeToggle";
import { useAuth } from "../../hooks/useAuth";
import type { LocationSuggestion } from "../../types";
import { initialsFromName } from "../../utils/format";
import { LocationSearchBox } from "./LocationSearchBox";

interface TopBarProps {
  title: string;
  contextLabel?: string;
  onAssessLocation?: (suggestion: LocationSuggestion) => void;
  onAssessQuery?: (query: string) => void;
  onClearAssessment?: () => void;
}

export function TopBar({
  title,
  contextLabel = "Bengaluru Urban",
  onAssessLocation,
  onAssessQuery,
  onClearAssessment,
}: TopBarProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const initials = initialsFromName(profile?.full_name ?? "Planner");

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  function handleSelect(suggestion: LocationSuggestion) {
    if (onAssessLocation) {
      onAssessLocation(suggestion);
      return;
    }
    if (suggestion.kind === "candidate_site") {
      navigate(`/planner/site/${suggestion.id}`);
      return;
    }
    navigate("/planner", { state: { assess: suggestion } });
  }

  function handleSubmit(query: string) {
    if (onAssessQuery) {
      onAssessQuery(query);
      return;
    }
    navigate("/planner", { state: { assessQuery: query } });
  }

  return (
    <header className="relative z-40 flex h-[64px] items-center justify-between overflow-visible border-b border-vo-line px-6 no-print">
      <div className="flex items-center gap-3">
        <h1 className="text-[18px] font-semibold tracking-tight text-vo-text">{title}</h1>
        <span className="rounded-full border border-vo-border px-3 py-1 text-[12px] text-vo-soft">{contextLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <LocationSearchBox
          compact
          className="z-50 w-[min(280px,32vw)]"
          placeholder="Search site, ward or feeder"
          onSelectSuggestion={handleSelect}
          onSubmitFreeText={handleSubmit}
          onClear={onClearAssessment ?? (() => undefined)}
        />
        <ThemeToggle compact />
        <span className="rounded-full border border-vo-border px-3 py-1.5 text-[12px] text-vo-soft">FY 26-27</span>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="vo-hover-interactive rounded-[8px] border border-vo-border px-3 py-1.5 text-[12px] text-vo-soft hover:border-vo-border hover:text-vo-text"
        >
          Logout
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2F7] dark:bg-[#1c242f] border border-[#4F6F9F]/30 dark:border-[#6F8FB8]/40 text-[11px] font-bold text-[#4F6F9F] dark:text-[#6F8FB8] select-none">
          {initials}
        </span>
      </div>
    </header>
  );
}
