import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import enSource from "../locales/en.json";
import kn from "../locales/kn.json";
import hi from "../locales/hi.json";

// Driver-side only. Do not wrap planner routes in <LocaleProvider> -- the
// planner side stays English-only (see the localisation task's scope notes).

export type Locale = "en" | "kn" | "hi";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "hi", label: "हिंदी" },
];

const STORAGE_KEY = "vidyutone_driver_locale";

// en.json carries { text, context, max_chars } per key (context/max_chars
// feed tools/gen_locales.py, not the runtime). kn.json/hi.json are flat
// key -> translated string, since that's the only shape shipped to the
// browser. Flatten en down to the same shape once, at module load.
interface EnEntry {
  text: string;
  context?: string;
  max_chars?: number;
}
const en: Record<string, string> = Object.fromEntries(
  Object.entries(enSource as Record<string, EnEntry>).map(([key, entry]) => [key, entry.text]),
);

const DICTS: Record<Locale, Record<string, string>> = {
  en,
  kn: kn as Record<string, string>,
  hi: hi as Record<string, string>,
};

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "kn" || stored === "hi") {
      return stored;
    }
  } catch {
    // localStorage unavailable (private mode, etc.) -- fall back silently.
  }
  return "en";
}

function writeStoredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Best-effort only -- the toggle still works for the rest of this session.
  }
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    document.documentElement.lang = next;
  };

  // Keep <html lang> correct on first mount too, not just on later switches.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale() must be called under <LocaleProvider> (driver routes only).");
  }
  return ctx;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Translate `key` for the active locale. Falls back to the English source
 * string if the key is missing from the active locale's JSON (e.g. a string
 * added since the last `gen_locales.py` run), and to the raw key only if
 * even English is missing -- which means the string wasn't extracted into
 * en.json and is a bug, not a translation gap. Never call this outside a
 * driver route (see LocaleProvider above). */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const { locale } = useLocale();
  return (key, vars) => {
    const template = DICTS[locale][key] ?? DICTS.en[key];
    if (template === undefined) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key "${key}" in en.json -- add it to frontend/src/locales/en.json.`);
      }
      return key;
    }
    return interpolate(template, vars);
  };
}
