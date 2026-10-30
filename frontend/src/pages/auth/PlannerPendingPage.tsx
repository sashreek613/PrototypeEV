import { Link, Navigate, useNavigate } from "react-router-dom";
import { Clock, ShieldAlert, LogOut } from "lucide-react";
import { AuthCard, AuthShell } from "../../components/auth/AuthShell";
import { useAuth } from "../../hooks/useAuth";

export function PlannerPendingPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (profile?.role === "driver") {
    return <Navigate to="/driver" replace />;
  }
  if (profile?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  async function handleSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  const isRejected = profile?.verification_status === "rejected";

  return (
    <AuthShell>
      <AuthCard>
        <div className="flex items-center space-x-2 text-xs text-amber-400 font-semibold mb-2">
          <Clock className="w-4 h-4" />
          <span>Authority Authorization Status</span>
        </div>

        <h2 className="text-[26px] font-bold text-vo-text">
          {isRejected ? "Planner Authorization Rejected" : "Planner Verification Pending"}
        </h2>

        <div className="mt-4 p-4 rounded-2xl border bg-vo-card space-y-3 border-vo-line">
          <div className="flex items-start space-x-3">
            <div className={`p-2 rounded-xl border ${isRejected ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-vo-text uppercase tracking-wider">
                {isRejected ? "Application Rejected" : "Pending Administrator Review"}
              </p>
              <p className="text-xs text-vo-muted leading-relaxed">
                {isRejected
                  ? "Your request for Planner / Authority access was not approved by the system administrator."
                  : "Your Planner registration has been submitted and is currently pending verification by an administrator."}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-vo-line/60 space-y-2 text-xs">
            <div className="flex justify-between text-vo-muted">
              <span>Account Holder:</span>
              <span className="font-semibold text-vo-text">{profile?.full_name ?? "Planner Officer"}</span>
            </div>
            <div className="flex justify-between text-vo-muted">
              <span>Official Email:</span>
              <span className="font-mono text-vo-text">{profile?.email}</span>
            </div>
            <div className="flex justify-between text-vo-muted">
              <span>Organization:</span>
              <span className="font-semibold text-vo-text">{profile?.organization ?? "N/A"}</span>
            </div>
            {profile?.designation ? (
              <div className="flex justify-between text-vo-muted">
                <span>Designation:</span>
                <span className="font-semibold text-vo-text">{profile.designation}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-vo-muted pt-1">
              <span>Status:</span>
              <span
                className={`font-mono font-bold uppercase px-2 py-0.5 rounded text-[10px] border ${
                  isRejected
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                }`}
              >
                {profile?.verification_status?.toUpperCase() ?? "PENDING"}
              </span>
            </div>
            {isRejected && profile?.rejection_reason ? (
              <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-xs text-red-300 mt-2">
                <span className="font-bold">Reason:</span> {profile.rejection_reason}
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-xs text-vo-muted text-center pt-2">
          Planner dashboard operations require active verification to ensure authorized infrastructure planning.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex h-11 items-center justify-center space-x-2 rounded-xl bg-vo-card border border-vo-line text-xs font-semibold text-vo-text hover:border-vo-accent/40 transition-colors"
          >
            <LogOut className="w-4 h-4 text-vo-muted" />
            <span>Sign Out</span>
          </button>
          <Link to="/login" className="text-center text-[12px] text-vo-muted hover:text-vo-text pt-2">
            Back to Sign In
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
