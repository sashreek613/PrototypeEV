import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthCard, AuthShell } from "../../components/auth/AuthShell";
import { AuthLoadingScreen } from "../../components/auth/AuthLoadingScreen";
import { useAuth } from "../../hooks/useAuth";
import { logAuthError, mapAuthError } from "../../lib/authErrors";
import { establishSessionFromUrl, isRecoveryRedirect } from "../../lib/authSession";
import { homeForRole } from "../../lib/authRoutes";
import { requireSupabase } from "../../lib/supabase";

type CallbackState = "working" | "verified" | "recovery" | "error";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, refreshProfile, emailVerified, session } = useAuth();
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;
  const [state, setState] = useState<CallbackState>("working");
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");
      if (errorDescription) {
        if (!cancelled) {
          setState("error");
          setMessage(mapAuthError({ message: errorDescription }));
        }
        return;
      }

      try {
        const client = requireSupabase();
        const nextSession = await establishSessionFromUrl(client);
        if (!nextSession) {
          throw new Error("This link is invalid or has already been used.");
        }

        if (isRecoveryRedirect()) {
          if (!cancelled) {
            setState("recovery");
            setMessage("Reset link confirmed. Choose a new password.");
          }
          void navigate("/reset-password", { replace: true });
          return;
        }

        if (!nextSession.user.email_confirmed_at) {
          throw new Error("Please verify your email before signing in.");
        }

        await refreshProfileRef.current();
        if (!cancelled) {
          const role = nextSession.user.user_metadata?.role;
          setState("verified");
          if (role === "planner") {
            setMessage(
              "Email verified successfully. Your Planner/Authority account is now awaiting administrator approval.",
            );
          } else if (role === "admin") {
            setMessage("Email verified successfully. You can continue to the admin console.");
          } else {
            setMessage("Email verified successfully. You can continue to the Driver portal.");
          }
        }
      } catch (err: unknown) {
        logAuthError("callback-error", err);
        if (!cancelled) {
          setState("error");
          setMessage(mapAuthError(err));
        }
      }
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  useEffect(() => {
    if (state !== "verified") {
      return;
    }
    if (session && emailVerified && profile) {
      const timer = window.setTimeout(() => {
        void navigate(homeForRole(profile), { replace: true });
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [emailVerified, navigate, profile, session, state]);

  if (state === "working") {
    return <AuthLoadingScreen message={message} />;
  }

  return (
    <AuthShell>
      <AuthCard>
        <h2 className="text-[28px] font-semibold text-vo-text">
          {state === "error" ? "Verification failed" : "Email verified"}
        </h2>
        <p className={`mt-3 text-[14px] leading-6 ${state === "error" ? "text-vo-red" : "text-vo-soft"}`}>{message}</p>
        <div className="mt-6 flex flex-col gap-3">
          {state === "error" ? (
            <>
              <Link
                to="/verify-email"
                className="flex h-12 items-center justify-center rounded-xl bg-vo-accent text-[14px] font-semibold text-[#06231b]"
              >
                Resend verification email
              </Link>
              <Link to="/" className="text-center text-[12px] text-vo-muted hover:text-vo-text">
                Back to sign in
              </Link>
            </>
          ) : (
            <Link
              to={profile ? homeForRole(profile) : "/login?verified=1"}
              className="flex h-12 items-center justify-center rounded-xl bg-vo-accent text-[14px] font-semibold text-[#06231b]"
            >
              Continue
            </Link>
          )}

        </div>
      </AuthCard>
    </AuthShell>
  );
}
