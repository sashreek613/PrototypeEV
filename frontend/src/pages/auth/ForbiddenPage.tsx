import { Link, useNavigate } from "react-router-dom";

import { AuthCard, AuthShell } from "../../components/auth/AuthShell";
import { homeForRole } from "../../lib/authRoutes";
import { useAuth } from "../../hooks/useAuth";

export function ForbiddenPage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const home = homeForRole(profile);

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AuthShell>
      <AuthCard>
        <h2 className="text-[28px] font-semibold text-vo-text">Access denied</h2>
        <p className="mt-3 text-[14px] leading-6 text-vo-soft">
          This console is limited to a different role. Your profile role is{" "}
          <span className="text-vo-text">{profile?.role ?? "unknown"}</span>.
        </p>
        <Link
          to={home}
          className="mt-6 flex h-12 items-center justify-center rounded-xl bg-vo-accent text-[14px] font-semibold text-[#06231b]"
        >
          Go to your dashboard
        </Link>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="mt-4 w-full text-center text-[12px] text-vo-muted hover:text-vo-text"
        >
          Logout
        </button>
      </AuthCard>
    </AuthShell>
  );
}
