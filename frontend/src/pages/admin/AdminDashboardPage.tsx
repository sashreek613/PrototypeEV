import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, CheckCircle2, XCircle, Clock, RefreshCw, LogOut, Search, Building2, UserCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { approvePlanner, getAdminPlanners, rejectPlanner } from "../../services/api";
import type { Profile } from "../../types";

export function AdminDashboardPage() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  const [planners, setPlanners] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [searchQuery, setSearchQuery] = useState("");

  const [rejectingUser, setRejectingUser] = useState<Profile | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminPlanners();
      setPlanners(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load planner verification requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleApprove(userId: string) {
    setActionSubmitting(true);
    try {
      const updated = await approvePlanner(userId);
      setPlanners((prev) => prev.map((p) => (p.id === userId ? updated : p)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to approve planner.");
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectingUser) return;
    setActionSubmitting(true);
    try {
      const updated = await rejectPlanner(rejectingUser.id, rejectionReason.trim() || undefined);
      setPlanners((prev) => prev.map((p) => (p.id === rejectingUser.id ? updated : p)));
      setRejectingUser(null);
      setRejectionReason("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to reject planner.");
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  const pendingCount = planners.filter((p) => p.verification_status === "pending").length;
  const approvedCount = planners.filter((p) => p.verification_status === "approved").length;
  const rejectedCount = planners.filter((p) => p.verification_status === "rejected").length;

  const filteredPlanners = planners.filter((p) => {
    if (activeTab !== "all" && p.verification_status !== activeTab) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.organization && p.organization.toLowerCase().includes(q)) ||
        (p.designation && p.designation.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-vo-bg text-vo-text">
      {/* Top Header */}
      <header className="border-b border-vo-line bg-[#0c1014] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">VidyutOne Admin Console</h1>
              <p className="text-[11px] text-vo-muted">System Administrator & Authority Authorization</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white">{profile?.full_name ?? "Administrator"}</p>
              <p className="text-[10px] text-vo-muted">{profile?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-vo-line hover:border-vo-accent/40 text-xs font-medium text-vo-soft hover:text-white transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div
            onClick={() => setActiveTab("pending")}
            className={`cursor-pointer rounded-2xl border p-5 space-y-1 transition-all ${
              activeTab === "pending" ? "border-amber-500 bg-amber-500/10" : "border-vo-line bg-vo-card hover:border-amber-500/40"
            }`}
          >
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-xs font-bold uppercase tracking-wider">Pending Requests</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-vo-text font-mono">{pendingCount}</div>
            <p className="text-xs text-vo-muted">Requires admin review and approval</p>
          </div>

          <div
            onClick={() => setActiveTab("approved")}
            className={`cursor-pointer rounded-2xl border p-5 space-y-1 transition-all ${
              activeTab === "approved" ? "border-emerald-500 bg-emerald-500/10" : "border-vo-line bg-vo-card hover:border-emerald-500/40"
            }`}
          >
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-xs font-bold uppercase tracking-wider">Approved Planners</span>
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-vo-text font-mono">{approvedCount}</div>
            <p className="text-xs text-vo-muted">Authorized for Planner Console</p>
          </div>

          <div
            onClick={() => setActiveTab("rejected")}
            className={`cursor-pointer rounded-2xl border p-5 space-y-1 transition-all ${
              activeTab === "rejected" ? "border-red-500 bg-red-500/10" : "border-vo-line bg-vo-card hover:border-red-500/40"
            }`}
          >
            <div className="flex items-center justify-between text-red-400">
              <span className="text-xs font-bold uppercase tracking-wider">Rejected Requests</span>
              <XCircle className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-vo-text font-mono">{rejectedCount}</div>
            <p className="text-xs text-vo-muted">Denied planner privileges</p>
          </div>
        </div>

        {/* Requests Table Section */}
        <div className="rounded-2xl border border-vo-line bg-vo-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-vo-text">Planner Verification Requests</h2>
              <p className="text-xs text-vo-muted">Review government authority registration applications</p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-vo-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, org, email..."
                  className="rounded-xl border border-vo-line bg-gray-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-vo-muted focus:border-vo-accent focus:outline-none w-52"
                />
              </div>

              <button
                type="button"
                onClick={() => void loadData()}
                className="p-2 rounded-xl border border-vo-line hover:border-vo-accent/40 text-vo-muted hover:text-vo-text transition-colors"
                title="Refresh requests"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-vo-line text-xs font-medium text-vo-muted gap-4">
            {(["pending", "approved", "rejected", "all"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`pb-2.5 border-b-2 capitalize transition-colors ${
                  activeTab === tab ? "border-vo-accent text-vo-accent font-semibold" : "border-transparent hover:text-vo-text"
                }`}
              >
                {tab} Requests
              </button>
            ))}
          </div>

          {error ? <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div> : null}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-vo-line/80 text-vo-muted font-mono uppercase">
                  <th className="pb-3 font-semibold">Applicant</th>
                  <th className="pb-3 font-semibold">Organization / Dept</th>
                  <th className="pb-3 font-semibold">Designation</th>
                  <th className="pb-3 font-semibold">Contact / ID</th>
                  <th className="pb-3 font-semibold">Submitted</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vo-line/40 text-vo-text">
                {filteredPlanners.map((p) => {
                  const isPending = p.verification_status === "pending";
                  const isApproved = p.verification_status === "approved";
                  const isRejected = p.verification_status === "rejected";

                  return (
                    <tr key={p.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5">
                        <p className="font-bold text-vo-text">{p.full_name}</p>
                        <p className="text-[11px] text-vo-muted font-mono">{p.email}</p>
                      </td>

                      <td className="py-3.5">
                        <div className="flex items-center space-x-1.5 text-vo-text">
                          <Building2 className="w-3.5 h-3.5 text-vo-accent shrink-0" />
                          <span>{p.organization ?? "N/A"}</span>
                        </div>
                      </td>

                      <td className="py-3.5 text-vo-text">{p.designation ?? "N/A"}</td>
                      <td className="py-3.5 font-mono text-vo-muted">{p.phone_number ?? "N/A"}</td>
                      <td className="py-3.5 text-vo-muted">{new Date(p.created_at).toLocaleDateString()}</td>

                      <td className="py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            isApproved
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : isPending
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-red-500/10 border-red-500/30 text-red-400"
                          }`}
                        >
                          {p.verification_status?.toUpperCase() ?? "PENDING"}
                        </span>
                      </td>

                      <td className="py-3.5 text-right space-x-2">
                        {!isApproved ? (
                          <button
                            type="button"
                            disabled={actionSubmitting}
                            onClick={() => void handleApprove(p.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        ) : null}

                        {!isRejected ? (
                          <button
                            type="button"
                            disabled={actionSubmitting}
                            onClick={() => setRejectingUser(p)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredPlanners.length === 0 ? (
              <div className="py-12 text-center text-xs text-vo-muted space-y-1">
                <p className="text-sm font-semibold text-vo-text">No planner verification requests found.</p>
                <p>No records match the active filter status.</p>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {/* Reject Reason Modal */}
      {rejectingUser ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-vo-line bg-[#0d131f] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-red-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Reject Planner Registration</span>
            </div>

            <p className="text-xs text-vo-muted leading-relaxed">
              Rejecting <strong>{rejectingUser.full_name}</strong> ({rejectingUser.organization}) will prevent this account from accessing the Planner dashboard.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-vo-muted">Rejection Reason (Optional)</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Unverified official email domain or invalid authority ID..."
                className="w-full rounded-xl border border-vo-line bg-gray-900 p-3 text-xs text-white placeholder:text-vo-muted focus:border-red-500 focus:outline-none h-24"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRejectingUser(null);
                  setRejectionReason("");
                }}
                className="px-4 py-2 rounded-xl border border-vo-line text-xs font-semibold text-vo-soft hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionSubmitting}
                onClick={() => void handleConfirmReject()}
                className="px-4 py-2 rounded-xl bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {actionSubmitting ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
