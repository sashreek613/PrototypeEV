export function mapAuthError(error: unknown): string {
  if (!error) {
    return "Something went wrong.";
  }

  const err = error as { message?: string; code?: string; name?: string; status?: number };
  const message = (err.message ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();
  const status = err.status;

  if (message.includes("supabase configuration")) {
    return "Supabase configuration error. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  ) {
    return "An account with this email already exists. Sign in or reset your password.";
  }
  if (code === "weak_password" || message.includes("password should be") || message.includes("weak password")) {
    return "Password is too weak. Use at least 6 characters.";
  }
  if (code === "email_address_invalid" || message.includes("invalid email") || message.includes("unable to validate email")) {
    return "Please enter a valid email address.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("email rate")
  ) {
    return "Too many emails sent. Wait a few minutes and try again.";
  }
  if (message.includes("error sending confirmation email") || message.includes("error sending recovery email")) {
    return "Confirmation email could not be sent. Check the Resend SMTP settings in the Supabase dashboard.";
  }
  if (
    err.name === "AuthPKCECodeVerifierMissingError" ||
    (message.includes("pkce") && message.includes("verifier"))
  ) {
    return "Open this confirmation link in the same browser you used to sign up.";
  }
  if (
    code === "otp_expired" ||
    message.includes("token has expired or is invalid") ||
    message.includes("link is invalid or has expired") ||
    message.includes("expired")
  ) {
    return "This link has expired. Request a new email and try again.";
  }
  if (
    code === "access_denied" ||
    message.includes("invalid or has already been used") ||
    message.includes("invalid token")
  ) {
    return "This link is invalid or has already been used.";
  }
  if (err.name === "AuthSessionMissingError" || message.includes("session missing") || message.includes("not authenticated")) {
    return "Your session expired. Sign in again.";
  }
  if (message.includes("user banned") || message.includes("disabled") || code === "user_banned") {
    return "This account is disabled. Contact support.";
  }
  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network request failed")) {
    return "Network error. Check your connection and try again.";
  }
  return err.message || "Something went wrong.";
}

export function logAuthError(stage: string, error: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const err = error as { message?: string; code?: string; name?: string; status?: number };
  console.info("[vidyutone-auth]", stage, {
    name: err.name,
    code: err.code,
    status: err.status,
    message: err.message,
  });
}

export const PENDING_EMAIL_KEY = "vidyutone-pending-email";

export function storePendingEmail(email: string): void {
  sessionStorage.setItem(PENDING_EMAIL_KEY, email);
}

export function readPendingEmail(): string | null {
  return sessionStorage.getItem(PENDING_EMAIL_KEY);
}

export function clearPendingEmail(): void {
  sessionStorage.removeItem(PENDING_EMAIL_KEY);
}
