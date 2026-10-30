import { Link, useNavigate } from "react-router-dom";
import { MapPin, BatteryCharging, ArrowRight, ShieldCheck, PlugZap } from "lucide-react";
import { useState } from "react";
import { AuthShell } from "../../components/auth/AuthShell";
import { useAuth } from "../../hooks/useAuth";

export function RoleSelectPage() {
  const navigate = useNavigate();

  return (
    <AuthShell>
      <div className="w-full space-y-6">
        {/* Section Header */}
        <div className="space-y-1 text-left sm:text-left">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--vo-text)]">
            Choose how you’ll use VidyutOne
          </h2>
          <p className="text-sm text-[var(--vo-muted)]">
            Select your role to continue.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
          {/* Card 1: Planner / Authority */}
          <div className="bg-[var(--vo-surface)] rounded-xl border border-[var(--vo-border)] p-6 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-[var(--vo-bg)] border border-[var(--vo-border)] flex items-center justify-center text-[var(--vo-text)]">
                  <MapPin className="w-5 h-5 stroke-[1.75]" />
                </div>
                <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#C5A66A] bg-[#FAF5EC] dark:bg-[#C5A66A]/15 border border-[#EDE2D0] dark:border-[#C5A66A]/30 px-2.5 py-0.5 rounded-md">
                  <ShieldCheck className="w-3 h-3 text-[#C5A66A]" />
                  <span>Verification required</span>
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--vo-text)]">
                  Planner / Authority
                </h3>
                <p className="text-xs text-[var(--vo-soft)] mt-1.5 leading-relaxed">
                  For DISCOMs, government agencies, city planners, and authorized infrastructure teams.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void navigate("/signup/planner")}
              className="w-full py-2.5 px-4 rounded-lg bg-[#4F6F9F] hover:bg-[#3F5F8F] dark:bg-[#6F8FB8] dark:hover:bg-[#5D7EA8] text-white font-semibold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Continue as Planner</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: EV Driver */}
          <div className="bg-[var(--vo-surface)] rounded-xl border border-[var(--vo-border)] p-6 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-[var(--vo-bg)] border border-[var(--vo-border)] flex items-center justify-center text-[var(--vo-text)]">
                  <BatteryCharging className="w-5 h-5 stroke-[1.75]" />
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--vo-text)]">
                  EV Driver
                </h3>
                <p className="text-xs text-[var(--vo-soft)] mt-1.5 leading-relaxed">
                  Find charging stations, check availability, and plan your journey with reliable charging information.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void navigate("/signup/driver")}
              className="w-full py-2.5 px-4 rounded-lg bg-[#4F6F9F] hover:bg-[#3F5F8F] dark:bg-[#6F8FB8] dark:hover:bg-[#5D7EA8] text-white font-semibold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Continue as Driver</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-[var(--vo-surface)] rounded-xl border border-[var(--vo-border)] p-6 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-[var(--vo-bg)] border border-[var(--vo-border)] flex items-center justify-center text-[var(--vo-text)]">
                  <PlugZap className="w-5 h-5 stroke-[1.75]" />
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--vo-text)]">
                  Private Operator
                </h3>
                <p className="text-xs text-[var(--vo-soft)] mt-1.5 leading-relaxed">
                  List your chargers, manage availability, and see aggregated utilization and booking revenue.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void navigate("/signup/operator")}
              className="w-full py-2.5 px-4 rounded-lg bg-[#4F6F9F] hover:bg-[#3F5F8F] dark:bg-[#6F8FB8] dark:hover:bg-[#5D7EA8] text-white font-semibold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Continue as Operator</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <OperatorDemoButton />
          </div>
        </div>

        {/* Already Registered Section */}
        <div className="pt-2 text-center sm:text-left text-xs text-[var(--vo-muted)] border-t border-[var(--vo-border)] mt-4">
          <span>Already registered? </span>
          <Link
            to="/login"
            className="text-[#4F6F9F] dark:text-[#6F8FB8] hover:underline font-semibold transition-colors underline-offset-4"
          >
            Sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

function OperatorDemoButton() {
  const navigate = useNavigate();
  const { enterOperatorDemo } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError(null);
          setBusy(true);
          void enterOperatorDemo()
            .then(() => navigate("/operator", { replace: true }))
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Could not open Operator Demo Mode.");
            })
            .finally(() => setBusy(false));
        }}
        className="w-full py-2.5 px-4 rounded-lg border border-[var(--vo-border)] bg-[var(--vo-bg)] hover:border-slate-300 text-[var(--vo-text)] font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50"
      >
        {busy ? "Opening demo…" : "Enter Operator Demo Mode"}
      </button>
      <p className="text-[11px] text-[var(--vo-muted)] leading-relaxed">
        Local demo only — labeled Demo Operator. Does not skip production operator authorization.
      </p>
      {error ? <p className="text-[11px] text-vo-bad-ink">{error}</p> : null}
    </div>
  );
}

