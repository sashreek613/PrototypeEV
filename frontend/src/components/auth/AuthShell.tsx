import type { ReactNode } from "react";
import { Zap } from "lucide-react";
import { ThemeToggle } from "../common/ThemeToggle";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[var(--vo-bg)] text-[var(--vo-text)] vo-radar flex flex-col justify-between font-sans selection:bg-blue-100 selection:text-blue-900 transition-colors">
      {/* Top Bar / Theme Switcher Header */}
      <header className="w-full border-b border-[var(--vo-border)] py-3 px-6 bg-[var(--vo-surface)]/80 backdrop-blur-xs sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white flex items-center justify-center shadow-xs shrink-0">
              <Zap className="w-3.5 h-3.5 fill-current stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-[var(--vo-text)]">
              VidyutOne
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Container */}
      <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:py-12 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center flex-1 my-auto">
        
        {/* Left Column: Branding & Overview */}
        <section className="lg:col-span-5 flex flex-col justify-between space-y-8 py-4">
          <div className="space-y-6">
            {/* Subheader Title */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white flex items-center justify-center shadow-xs shrink-0">
                <Zap className="w-4 h-4 fill-current stroke-[2.5]" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-[var(--vo-text)] block leading-none">
                  VidyutOne
                </span>
                <span className="text-xs font-medium text-[var(--vo-muted)] block mt-1">
                  EV Infrastructure Planning & Grid Intelligence
                </span>
              </div>
            </div>

            {/* Hero Copy */}
            <div className="space-y-3 pt-4 sm:pt-6">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[var(--vo-text)] leading-tight">
                Plan EV infrastructure with grid intelligence.
              </h1>
              <p className="text-sm sm:text-base text-[var(--vo-soft)] leading-relaxed max-w-md">
                VidyutOne helps planners identify suitable charging locations and helps EV drivers find reliable charging infrastructure.
              </p>
            </div>
          </div>

          <div className="text-xs text-[var(--vo-muted)] font-mono tracking-wider border-t border-[var(--vo-border)] pt-4">
            BENGALURU URBAN GRID PLATFORM
          </div>
        </section>

        {/* Right Column: Role Selection or Interactive Card */}
        <section className="lg:col-span-7 flex justify-center w-full">
          {children}
        </section>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-[var(--vo-border)] py-4 px-6 text-center text-xs text-[var(--vo-muted)] bg-[var(--vo-surface)]/60 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 VidyutOne • EV Infrastructure Planning & Grid Intelligence</span>
          <span className="text-[var(--vo-muted)] text-[11px]">Authorized & Public Mobility Portal</span>
        </div>
      </footer>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-xl border border-[var(--vo-border)] bg-[var(--vo-surface)] p-6 sm:p-8 shadow-xs">
      {children}
    </div>
  );
}

export function RoleCard({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        selected
          ? "border-[#4F6F9F] bg-[#EEF2F7] dark:bg-[#6F8FB8]/15 ring-1 ring-[#4F6F9F]"
          : "border-[var(--vo-border)] bg-[var(--vo-surface)] hover:border-slate-300 dark:hover:border-slate-700"
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="text-sm font-bold text-[var(--vo-text)]">{title}</span>
        <span
          className={`h-3.5 w-3.5 rounded-full border ${
            selected ? "border-[#4F6F9F] bg-[#4F6F9F]" : "border-[var(--vo-border)] bg-transparent"
          }`}
        />
      </span>
      <span className="mt-1.5 block text-xs leading-relaxed text-[var(--vo-soft)]">{description}</span>
    </button>
  );
}

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mt-4 block text-xs font-semibold tracking-wider text-[var(--vo-soft)] uppercase">
      {label}
      {children}
    </label>
  );
}

export function authInputClassName(): string {
  return "mt-1.5 h-11 w-full rounded-lg border border-[var(--vo-border)] bg-[var(--vo-card)] px-3.5 text-sm text-[var(--vo-text)] placeholder:text-[var(--vo-muted)] outline-none focus:border-[#4F6F9F] focus:ring-1 focus:ring-[#4F6F9F] transition-colors";
}

export function AuthSubmit({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-6 h-11 w-full rounded-lg bg-[#4F6F9F] hover:bg-[#3F5F8F] dark:bg-[#6F8FB8] dark:hover:bg-[#5D7EA8] text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
    >
      {children}
    </button>
  );
}
