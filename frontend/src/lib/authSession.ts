import type { EmailOtpType, Session, SupabaseClient } from "@supabase/supabase-js";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function asEmailOtpType(value: string | null): EmailOtpType | null {
  if (!value) {
    return null;
  }
  return EMAIL_OTP_TYPES.has(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function urlSearchAndHash(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });
  return params;
}

function authDebug(event: string, details: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }
  console.info("[vidyutone-auth]", event, details);
}

function sessionSummary(session: Session | null) {
  return {
    hasSession: Boolean(session),
    emailConfirmed: Boolean(session?.user.email_confirmed_at),
  };
}

export function isRecoveryRedirect(): boolean {
  const params = urlSearchAndHash();
  return params.get("type") === "recovery" || params.get("next") === "/reset-password";
}

let inFlight: Promise<Session | null> | null = null;
const verifiedTokenKeys = new Set<string>();

function tokenKey(tokenHash: string, otpType: string): string {
  return `${otpType}:${tokenHash.length}:${tokenHash.slice(0, 4)}:${tokenHash.slice(-4)}`;
}

export async function establishSessionFromUrl(client: SupabaseClient): Promise<Session | null> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = completeSessionFromUrl(client).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function completeSessionFromUrl(client: SupabaseClient): Promise<Session | null> {
  const params = urlSearchAndHash();
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const otpType = asEmailOtpType(params.get("type")) ?? (tokenHash ? "email" : null);

  authDebug("callback-url", {
    hasTokenHash: Boolean(tokenHash),
    tokenHashLength: tokenHash?.length ?? 0,
    type: params.get("type"),
    hasCode: Boolean(code),
  });

  if (tokenHash) {
    const key = tokenKey(tokenHash, otpType ?? "email");
    if (verifiedTokenKeys.has(key)) {
      const existingAfterSuccess = await client.auth.getSession();
      if (existingAfterSuccess.data.session?.user.email_confirmed_at) {
        authDebug("token-hash-skip-verify", {
          reason: "already-verified-this-token",
          ...sessionSummary(existingAfterSuccess.data.session),
        });
        return existingAfterSuccess.data.session;
      }
    }

    const existing = await client.auth.getSession();
    if (existing.error) {
      throw existing.error;
    }
    if (existing.data.session?.user.email_confirmed_at) {
      authDebug("token-hash-skip-verify", {
        reason: "confirmed-session-already-present",
        ...sessionSummary(existing.data.session),
      });
      return existing.data.session;
    }

    authDebug("verifyOtp-call", { type: otpType });
    const verified = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType ?? "email",
    });
    if (verified.error) {
      const otpError = verified.error as { name?: string; message?: string; code?: string; status?: number };
      authDebug("verifyOtp-error", {
        name: otpError.name,
        code: otpError.code,
        status: otpError.status,
        message: otpError.message,
      });
      const afterFailure = await client.auth.getSession();
      if (afterFailure.data.session?.user.email_confirmed_at) {
        authDebug("verifyOtp-reused-token-with-session", sessionSummary(afterFailure.data.session));
        verifiedTokenKeys.add(key);
        return afterFailure.data.session;
      }
      throw verified.error;
    }

    const session = verified.data.session;
    authDebug("verifyOtp-success", sessionSummary(session));
    if (session?.user.email_confirmed_at) {
      verifiedTokenKeys.add(tokenKey(tokenHash, otpType ?? "email"));
    }
    if (session) {
      return session;
    }
    const afterOtp = await client.auth.getSession();
    if (afterOtp.error) {
      throw afterOtp.error;
    }
    authDebug("verifyOtp-session-followup", sessionSummary(afterOtp.data.session));
    return afterOtp.data.session;
  }

  const existing = await client.auth.getSession();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data.session) {
    return existing.data.session;
  }

  if (!code) {
    return null;
  }

  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (!exchanged.error && exchanged.data.session) {
    return exchanged.data.session;
  }

  const retry = await client.auth.getSession();
  if (retry.data.session) {
    return retry.data.session;
  }
  if (exchanged.error) {
    throw exchanged.error;
  }
  return null;
}
