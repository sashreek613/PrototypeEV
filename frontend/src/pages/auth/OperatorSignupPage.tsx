import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, PlugZap } from "lucide-react";

import {
  AuthCard,
  AuthField,
  AuthShell,
  AuthSubmit,
  authInputClassName,
} from "../../components/auth/AuthShell";
import { useAuth } from "../../hooks/useAuth";
import { mapAuthError } from "../../lib/authErrors";
import { supabaseConfigured } from "../../lib/supabase";

export function OperatorSignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!fullName.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (!organization.trim()) {
      setError("Enter your charging company or station name.");
      return;
    }
    if (!phoneNumber.trim()) {
      setError("Enter your phone number.");
      return;
    }
    if (!email.trim()) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
        role: "operator",
        organization: organization.trim(),
        phoneNumber: phoneNumber.trim(),
      });

      if (result.needsVerification || !result.profile) {
        void navigate("/verify-email");
        return;
      }
      void navigate("/operator", { replace: true });
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
          <div className="flex items-center space-x-2 text-xs text-[#4F6F9F] dark:text-[#6F8FB8] font-semibold mb-2">
            <PlugZap className="w-4 h-4" />
            <span>Operator Registration</span>
          </div>

          <h2 className="text-[26px] font-bold text-vo-text">Create Operator Account</h2>
          <p className="mt-1 text-[13px] text-vo-muted">
            For private charging operators. List stations, manage availability, and see aggregated utilization — not individual driver identities.
          </p>

          {!supabaseConfigured ? (
            <p className="mt-4 text-[13px] text-vo-red">
              Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
            </p>
          ) : null}
          {error ? <p className="mt-4 text-[13px] text-vo-red">{error}</p> : null}

          <AuthField label="FULL NAME">
            <input
              className={authInputClassName()}
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Priya Sharma"
            />
          </AuthField>

          <AuthField label="COMPANY / STATION NETWORK">
            <input
              className={authInputClassName()}
              type="text"
              required
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. GreenCharge Hub"
            />
          </AuthField>

          <AuthField label="PHONE NUMBER">
            <input
              className={authInputClassName()}
              type="tel"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </AuthField>

          <AuthField label="EMAIL">
            <input
              className={authInputClassName()}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@greencharge.in"
            />
          </AuthField>

          <AuthField label="PASSWORD">
            <input
              className={authInputClassName()}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </AuthField>

          <AuthField label="CONFIRM PASSWORD">
            <input
              className={authInputClassName()}
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </AuthField>

          <AuthSubmit disabled={submitting || !supabaseConfigured}>
            {submitting ? "Registering Account…" : "Register Operator Account"}
          </AuthSubmit>

          <div className="mt-4 flex items-center justify-between text-[12px] text-vo-muted">
            <Link to="/get-started" className="flex items-center space-x-1 hover:text-vo-text">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Role</span>
            </Link>
            <Link to="/login" className="hover:text-vo-text">
              Already registered? Sign in
            </Link>
          </div>
          <OperatorSignupDemoLink />
        </AuthCard>
      </form>
    </AuthShell>
  );
}

function OperatorSignupDemoLink() {
  const navigate = useNavigate();
  const { enterOperatorDemo } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void enterOperatorDemo()
          .then(() => navigate("/operator", { replace: true }))
          .finally(() => setBusy(false));
      }}
      className="mt-3 w-full text-[12px] font-semibold text-[#4F6F9F] hover:underline"
    >
      {busy ? "Opening Operator Demo Mode…" : "Skip signup — enter Operator Demo Mode"}
    </button>
  );
}
