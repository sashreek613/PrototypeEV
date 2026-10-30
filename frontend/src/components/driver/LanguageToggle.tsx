import { LOCALES, useLocale, useT } from "../../i18n";

/** Three short native-script labels (EN / ಕನ್ನಡ / हिंदी), not flag icons --
 * flags map to countries, not languages, and India alone speaks all three of
 * these. Persists via LocaleProvider (localStorage), applies instantly since
 * every driver string is read through useT() at render time. */
export function LanguageToggle() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label={t("driver_layout.lang_toggle_label")}
      className="flex items-center gap-0.5 rounded-[8px] border border-vo-border bg-driver-card p-0.5 shrink-0"
    >
      {LOCALES.map(({ code, label }) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`vo-hover-interactive rounded-[6px] px-2 py-1 text-[11px] font-semibold transition-colors ${
              active ? "bg-vo-accent text-vo-bg" : "text-driver-muted hover:text-driver-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
