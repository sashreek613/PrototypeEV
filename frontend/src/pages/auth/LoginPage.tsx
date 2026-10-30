import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  AuthCard,
  AuthField,
  AuthShell,
  AuthSubmit,
  authInputClassName,
} from "../../components/auth/AuthShell";
import { homeForRole } from "../../lib/authRoutes";
import { useAuth } from "../../hooks/useAuth";
import { mapAuthError } from "../../lib/authErrors";
import { supabaseConfigured } from "../../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notice =
    searchParams.get("reset") === "1"
      ? "Password updated. Sign in with your new password."
      : searchParams.get("verified") === "1"
        ? "Email verified. You can sign in now."
        : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const me = await signIn(email.trim(), password);
      void navigate(homeForRole(me), { replace: true });

    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      setError(mapped);
      if (mapped.toLowerCase().includes("verify your email")) {
        void navigate("/verify-email");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <AuthCard>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--vo-text)]">Sign in</h2>
          <p className="mt-1 text-xs text-[var(--vo-muted)]">
            Sign in to access your planner dashboard, driver portal, operator console, or admin console.
          </p>

          {!supabaseConfigured ? (
            <p className="mt-4 text-xs text-red-600 dark:text-red-400">
              Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.
            </p>
          ) : null}
          {notice ? <p className="mt-4 text-xs text-emerald-600 dark:text-emerald-400 font-medium">{notice}</p> : null}
          {error ? <p className="mt-4 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p> : null}

          <AuthField label="EMAIL">
            <input
              className={authInputClassName()}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@organisation.gov.in"
            />
          </AuthField>
          <AuthField label="PASSWORD">
            <input
              className={authInputClassName()}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </AuthField>

          <AuthSubmit disabled={submitting || !supabaseConfigured}>
            {submitting ? "Signing in…" : "Sign in"}
          </AuthSubmit>
          <div className="mt-4 flex justify-between text-xs text-[var(--vo-muted)] border-t border-[var(--vo-border)] pt-4">
            <Link to="/forgot-password" className="text-[#4F6F9F] dark:text-[#6F8FB8] hover:underline font-medium">
              Forgot password?
            </Link>
            <Link to="/" className="text-[var(--vo-text)] font-semibold hover:underline">
              Choose role
            </Link>
          </div>
        </AuthCard>
      </form>
    </AuthShell>
  );
}
