import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthCard,
  AuthField,
  AuthShell,
  AuthSubmit,
  authInputClassName,
} from "../../components/auth/AuthShell";
import { AuthLoadingScreen } from "../../components/auth/AuthLoadingScreen";
import { useAuth } from "../../hooks/useAuth";
import { mapAuthError } from "../../lib/authErrors";
import { establishSessionFromUrl } from "../../lib/authSession";
import { requireSupabase } from "../../lib/supabase";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, loading, updatePassword, signOut } = useAuth();
  const [establishing, setEstablishing] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionReady = Boolean(session?.user);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (session?.user) {
      setEstablishing(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await establishSessionFromUrl(requireSupabase());
      } catch {
        // Invalid/expired recovery links fall through to the error UI.
      } finally {
        if (!cancelled) {
          setEstablishing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password is too weak. Use at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      await signOut();
      void navigate("/?reset=1", { replace: true });
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || (establishing && !sessionReady)) {
    return <AuthLoadingScreen message="Opening reset link…" />;
  }

  return (
    <AuthShell>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <AuthCard>
          <h2 className="text-[28px] font-semibold text-vo-text">Set a new password</h2>
          {!sessionReady ? (
            <>
              <p className="mt-3 text-[14px] text-vo-red">
                This reset link is invalid or has expired. Request a new email and try again.
              </p>
              <Link
                to="/forgot-password"
                className="mt-6 flex h-12 items-center justify-center rounded-xl bg-vo-accent text-[14px] font-semibold text-[#06231b]"
              >
                Request a new link
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-[13px] text-vo-muted">Choose a new password, then sign in with it.</p>
              {error ? <p className="mt-4 text-[13px] text-vo-red">{error}</p> : null}
              <AuthField label="NEW PASSWORD">
                <input
                  className={authInputClassName()}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </AuthField>
              <AuthField label="CONFIRM PASSWORD">
                <input
                  className={authInputClassName()}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </AuthField>
              <AuthSubmit disabled={submitting}>{submitting ? "Updating…" : "Update password"}</AuthSubmit>
            </>
          )}
        </AuthCard>
      </form>
    </AuthShell>
  );
}
