import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, ArrowLeft, ShieldAlert } from "lucide-react";

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

export function PlannerSignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [designation, setDesignation] = useState("");
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
      setError("Enter your organization or government department name.");
      return;
    }
    if (!designation.trim()) {
      setError("Enter your designation or title (e.g. Executive Engineer / Planning Analyst).");
      return;
    }
    if (!email.trim()) {
      setError("Enter a valid official email address.");
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
        role: "planner",
        organization: organization.trim(),
        designation: designation.trim(),
        phoneNumber: phoneNumber.trim(),
      });

      if (result.needsVerification) {
        void navigate("/verify-email");
        return;
      }
      void navigate("/planner-pending", { replace: true });
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
          <div className="flex items-center space-x-2 text-xs text-cyan-400 font-semibold mb-2">
            <MapPin className="w-4 h-4" />
            <span>Planner / Authority Registration</span>
          </div>

          <h2 className="text-[26px] font-bold text-vo-text">Authority Access Request</h2>
          <p className="mt-1 text-[13px] text-vo-muted">
            For DISCOM, municipal agency, or government charging infrastructure authorities.
          </p>

          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Registration ≠ Authorization:</strong> Planner access requires explicit approval by an administrator before dashboard privileges are granted.
            </span>
          </div>

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
              placeholder="e.g. Dr. Ananya Sharma"
            />
          </AuthField>

          <AuthField label="ORGANIZATION / GOVERNMENT DEPARTMENT">
            <input
              className={authInputClassName()}
              type="text"
              required
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. BESCOM / Bengaluru Smart City Ltd"
            />
          </AuthField>

          <AuthField label="DESIGNATION / OFFICIAL TITLE">
            <input
              className={authInputClassName()}
              type="text"
              required
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Chief EV Infrastructure Engineer"
            />
          </AuthField>

          <AuthField label="AUTHORITY ID / PHONE NUMBER">
            <input
              className={authInputClassName()}
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. GOV-BES-8842 / +91 9876543210"
            />
          </AuthField>

          <AuthField label="OFFICIAL EMAIL">
            <input
              className={authInputClassName()}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ananya@bescom.gov.in"
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
            {submitting ? "Submitting Registration…" : "Submit Registration Request"}
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
        </AuthCard>
      </form>
    </AuthShell>
  );
}
