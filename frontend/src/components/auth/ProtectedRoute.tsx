import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { homeForRole } from "../../lib/authRoutes";
import { isOperatorDemoProfile } from "../../lib/operatorDemo";
import { useAuth } from "../../hooks/useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session, emailVerified, profile, configured, signOut, refreshProfile } = useAuth();
  const location = useLocation();

  if (!configured && !isOperatorDemoProfile(profile)) {
    return <Navigate to="/" replace />;
  }
  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (!session || !session.user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (!emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-vo-bg px-6 text-center text-vo-text">
        <p className="text-[15px] text-vo-soft">Could not load your profile. Is the API running at VITE_API_BASE_URL?</p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="text-[13px] text-vo-accent"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-[13px] text-vo-accent"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RoleProtectedRoute({
  role,
  children,
}: {
  role: "planner" | "driver" | "admin" | "operator";
  children: ReactNode;
}) {
  const { loading, profile } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (profile && profile.role !== role) {
    return <Navigate to={homeForRole(profile)} replace />;
  }
  if (profile && role === "planner") {
    if (profile.is_verified === false || profile.is_active === false || profile.verification_status !== "approved") {
      return <Navigate to="/planner-pending" replace />;
    }
  }
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { loading, session, emailVerified, profile } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }
  if (session && emailVerified && profile) {
    return <Navigate to={homeForRole(profile)} replace />;
  }
  return <>{children}</>;
}

