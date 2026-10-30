import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { suggestLocations } from "../../services/api";
import type { LocationSuggestion } from "../../types";

const DEBOUNCE_MS = 250;
const SUGGESTION_LIMIT = 8;

interface LocationSearchBoxProps {
  onSelectSuggestion: (suggestion: LocationSuggestion) => void;
  onSubmitFreeText: (query: string) => void;
  onClear: () => void;
  className?: string;
  placeholder?: string;
  initialQuery?: string;
  compact?: boolean;
}

export function LocationSearchBox({
  onSelectSuggestion,
  onSubmitFreeText,
  onClear,
  className = "",
  placeholder = "Search a location or click the map...",
  initialQuery = "",
  compact = false,
}: LocationSearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  // Below 2 characters, just show nothing -- derived during render instead
  // of clearing `suggestions` via setState, so a fast delete-then-retype
  // doesn't flash a synchronous state update before the debounce below
  // even has a chance to run.
  const effectiveSuggestions = trimmedQuery.length < 2 ? [] : suggestions;

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      suggestLocations(trimmed, SUGGESTION_LIMIT)
        .then((results) => {
          if (requestIdRef.current === requestId) {
            setSuggestions(results);
          }
        })
        .catch(() => {
          if (requestIdRef.current === requestId) {
            setSuggestions([]);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  function selectSuggestion(suggestion: LocationSuggestion) {
    setQuery(suggestion.name);
    setSuggestions([]);
    setOpen(false);
    onSelectSuggestion(suggestion);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    setSuggestions([]);
    setOpen(false);
    onSubmitFreeText(trimmed);
  }

  function handleClear() {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    onClear();
  }

  return (
    <div className={`relative ${className}`}>
      <form
        onSubmit={handleSubmit}
        className={`flex items-center gap-2 border border-vo-line bg-vo-card px-3 shadow-sm ${
          compact ? "h-9 rounded-full py-0" : "rounded-[8px] py-2"
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-vo-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="min-w-0 w-full bg-transparent text-sm text-vo-text placeholder:text-vo-muted focus:outline-none"
        />
        {query ? (
          <button type="button" onClick={handleClear} aria-label="Clear search" className="shrink-0 text-vo-muted hover:text-vo-text">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </form>

      {open && effectiveSuggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-[8px] border border-vo-line bg-vo-card shadow-lg">
          {effectiveSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                // onMouseDown (not onClick) fires before the input's onBlur,
                // so selecting a suggestion registers before anything could
                // close the dropdown out from under the click.
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-vo-text hover:bg-vo-line"
              >
                <span className="truncate">{suggestion.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-vo-muted">
                  {suggestion.kind === "locality" ? "area" : "site"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
