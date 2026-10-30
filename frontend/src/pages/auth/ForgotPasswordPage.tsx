import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  AuthCard,
  AuthField,
  AuthShell,
  AuthSubmit,
  authInputClassName,
} from "../../components/auth/AuthShell";
import { useAuth } from "../../hooks/useAuth";
import { mapAuthError } from "../../lib/authErrors";

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
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
          <h2 className="text-[28px] font-semibold text-vo-text">Forgot password</h2>
          <p className="mt-1 text-[13px] text-vo-muted">
            We will email a reset link. The link expires; request a new one if it no longer works.
          </p>
          {sent ? (
            <p className="mt-4 text-[13px] text-vo-accent">If an account exists for that email, a reset link is on its way.</p>
          ) : null}
          {error ? <p className="mt-4 text-[13px] text-vo-red">{error}</p> : null}
          <AuthField label="EMAIL">
            <input
              className={authInputClassName()}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </AuthField>
          <AuthSubmit disabled={submitting}>{submitting ? "Sending…" : "Send reset email"}</AuthSubmit>
          <p className="mt-4 text-center text-[12px] text-vo-muted">
            <Link to="/" className="text-vo-text hover:underline">
              Back to sign in
            </Link>
          </p>
        </AuthCard>
      </form>
    </AuthShell>
  );
}
