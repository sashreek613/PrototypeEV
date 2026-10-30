import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthCard,
  AuthField,
  AuthShell,
  AuthSubmit,
  RoleCard,
  authInputClassName,
} from "../../components/auth/AuthShell";
import { homeForRole } from "../../lib/authRoutes";
import { useAuth } from "../../hooks/useAuth";
import { mapAuthError } from "../../lib/authErrors";
import { supabaseConfigured } from "../../lib/supabase";
import type { UserRole } from "../../types";

export function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("planner");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setError(null);
    if (!fullName.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
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
      const result = await signUp({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role,
      });
      if (result.needsVerification || !result.profile) {
        void navigate("/verify-email");
        return;
      }
      void navigate(homeForRole(result.profile), { replace: true });
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <AuthCard>
          <h2 className="text-[28px] font-semibold text-vo-text">Create account</h2>
          <p className="mt-1 text-[13px] text-vo-muted">
            Choose Planner or Driver. This role is stored on your profile and cannot be switched from the login screen.
          </p>

          {!supabaseConfigured ? (
            <p className="mt-4 text-[13px] text-vo-red">
              Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.
            </p>
          ) : null}
          {error ? <p className="mt-4 text-[13px] text-vo-red">{error}</p> : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <RoleCard
              title="Planner"
              description="DISCOM, city agency, CPO analyst"
              selected={role === "planner"}
              onSelect={() => setRole("planner")}
            />
            <RoleCard
              title="Driver"
              description="EV owner, fleet driver"
              selected={role === "driver"}
              onSelect={() => setRole("driver")}
            />
          </div>

          <AuthField label="FULL NAME">
            <input
              className={authInputClassName()}
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </AuthField>
          <AuthField label="EMAIL">
            <input
              className={authInputClassName()}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </AuthField>
          <AuthField label="PASSWORD">
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

          <AuthSubmit disabled={submitting || !supabaseConfigured}>
            {submitting ? "Creating account…" : "Create account"}
          </AuthSubmit>
          <p className="mt-4 text-center text-[12px] text-vo-muted">
            Already registered?{" "}
            <Link to="/" className="text-vo-text hover:underline">
              Sign in
            </Link>
          </p>
        </AuthCard>
      </form>
    </AuthShell>
  );
}
