import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isAxiosError } from "axios";

import { AuthContext, type AuthContextValue } from "../hooks/useAuth";
import { clearPendingEmail, logAuthError, mapAuthError, storePendingEmail } from "../lib/authErrors";
import { getAuthCallbackUrl, getPasswordResetRedirectUrl } from "../lib/siteUrl";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { getMe } from "../services/api";
import {
  OPERATOR_DEMO_STORAGE_KEY,
  demoOperatorProfile,
  demoOperatorSession,
} from "../lib/operatorDemo";
import type { Profile, UserRole } from "../types";

function isAppRole(value: string | undefined): value is UserRole {
  return value === "planner" || value === "driver" || value === "admin" || value === "operator";
}


function isEmailVerified(user: User | null): boolean {
  if (!user) {
    return false;
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user || !isEmailVerified(nextSession.user)) {
      setProfile(null);
      return null;
    }
    try {
      const me = await getMe(nextSession.access_token);
      if (!isAppRole(me.role)) {
        setProfile(null);
        return null;
      }
      setProfile(me);
      return me;
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403) {
        setProfile(null);
        return null;
      }
      // A racing timeout/5xx must not wipe a profile that already loaded for this user.
      setProfile((current) => {
        if (current && current.id === nextSession.user.id) {
          return current;
        }
        return null;
      });
      return null;
    }
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      return loadProfile(nextSession);
    },
    [loadProfile],
  );

  useEffect(() => {
    if (!supabase) {
      const stored = localStorage.getItem("vidyutone-mock-session");
      if (stored) {
        try {
          const mockSession = JSON.parse(stored);
          setSession(mockSession);
          setUser(mockSession.user);
          const isDriver = mockSession.access_token.includes("driver");
          const isOperator = mockSession.access_token.includes("operator");
          const mockProfile: Profile = isOperator
            ? demoOperatorProfile()
            : isDriver
            ? {
                id: mockSession.user.id,
                full_name: mockSession.user.user_metadata.full_name,
                email: mockSession.user.email,
                role: "driver",
                is_verified: true,
                is_active: true,
                verification_status: "approved",
                created_at: new Date().toISOString(),
              }
            : {
                id: mockSession.user.id,
                full_name: mockSession.user.user_metadata.full_name,
                email: mockSession.user.email,
                role: "planner",
                is_verified: true,
                is_active: true,
                verification_status: "approved",
                created_at: new Date().toISOString(),
              };
          setProfile(mockProfile);
        } catch {
          // ignore
        }
      }
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      const demoFlag = localStorage.getItem(OPERATOR_DEMO_STORAGE_KEY);
      const stored = localStorage.getItem("vidyutone-mock-session");
      if (demoFlag && stored) {
        try {
          const mockSession = JSON.parse(stored);
          if (mockSession.access_token === "mock-operator-token") {
            setSession(mockSession);
            setUser(mockSession.user);
            setProfile(demoOperatorProfile());
            setLoading(false);
            return;
          }
        } catch {
          // fall through to normal bootstrap
        }
      }

      try {
        const { data, error } = await supabase!.auth.getSession();
        if (error) {
          throw error;
        }
        if (!cancelled) {
          await applySession(data.session);
        }
      } catch {
        if (!cancelled) {
          await applySession(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (localStorage.getItem(OPERATOR_DEMO_STORAGE_KEY)) {
        return;
      }
      if (event === "INITIAL_SESSION") {
        return;
      }
      void (async () => {
        await applySession(nextSession);
        setLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      user,
      profile,
      loading,
      emailVerified: isEmailVerified(user),
      configured: supabaseConfigured,
      signIn: async (email: string, password: string) => {
        if (!supabase) {
          const isDriver = email.includes("driver") || email === "driver.demo@vidyutone.local";
          const isDriver2 = email.includes("driver2") || email === "driver2@vidyutone.local";
          const mockProfile: Profile = isDriver2
            ? {
                id: "user-driver-2-demo",
                full_name: "Driver Two",
                email: "driver2@vidyutone.local",
                role: "driver",
                is_verified: true,
                is_active: true,
                verification_status: "approved",
                created_at: new Date().toISOString(),
              }
            : isDriver
              ? {
                  id: "user-driver-demo",
                  full_name: "Nikhil",
                  email: "driver.demo@vidyutone.local",
                  role: "driver",
                  is_verified: true,
                  is_active: true,
                  verification_status: "approved",
                  created_at: new Date().toISOString(),
                }
              : {
                  id: "user-planner-demo",
                  full_name: "A. Rao",
                  email: "a.rao@bescom.karnataka.gov.in",
                  role: "planner",
                  is_verified: true,
                  is_active: true,
                  verification_status: "approved",
                  created_at: new Date().toISOString(),
                };

          const mockSession = {
            access_token: isDriver2 ? "mock-driver-2-token" : isDriver ? "mock-driver-token" : "mock-planner-token",
            user: {
              id: mockProfile.id,
              email: mockProfile.email,
              email_confirmed_at: new Date().toISOString(),
              user_metadata: {
                full_name: mockProfile.full_name,
                role: mockProfile.role,
              },
            },
          };

          localStorage.setItem("vidyutone-mock-session", JSON.stringify(mockSession));
          setSession(mockSession as any);
          setUser(mockSession.user as any);
          setProfile(mockProfile);
          return mockProfile;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw new Error(mapAuthError(error));
        }
        storePendingEmail(email);
        const me = await applySession(data.session);
        if (!me) {
          throw new Error("Could not load user profile. Please check backend connection.");
        }
        return me;
      },

      signUp: async ({ fullName, email, password, role, organization, phoneNumber, designation }) => {
        if (!supabase) {
          throw new Error("Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
        }
        if (role !== "planner" && role !== "driver" && role !== "operator") {
          throw new Error("Choose Planner, Driver, or Operator.");
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role, organization, phone_number: phoneNumber, designation },
            emailRedirectTo: getAuthCallbackUrl(),
          },
        });


        if (error) {
          logAuthError("signup-error", error);
          throw new Error(mapAuthError(error));
        }
        if (data.user?.identities && data.user.identities.length === 0) {
          throw new Error("An account with this email already exists. Sign in or reset your password.");
        }
        storePendingEmail(email);
        const verified = isEmailVerified(data.user);
        if (data.session && verified) {
          const me = await applySession(data.session);
          return { needsVerification: false, profile: me };
        }
        // Do not signOut here. signOut clears PKCE verifiers from storage, which
        // breaks same-browser email confirmation for this signup.
        return { needsVerification: true, profile: null };
      },
      signOut: async () => {
        clearPendingEmail();
        localStorage.removeItem("vidyutone-mock-session");
        localStorage.removeItem(OPERATOR_DEMO_STORAGE_KEY);
        if (supabase) {
          try {
            const { error } = await supabase.auth.signOut();
            if (error) {
              logAuthError("signout-error", error);
              const local = await supabase.auth.signOut({ scope: "local" });
              if (local.error) {
                logAuthError("signout-local-error", local.error);
              }
            }
          } catch (err) {
            logAuthError("signout-error", err);
            try {
              await supabase.auth.signOut({ scope: "local" });
            } catch (localErr) {
              logAuthError("signout-local-error", localErr);
            }
          }
        }
        await applySession(null);
      },
      requestPasswordReset: async (email: string) => {
        if (!supabase) {
          throw new Error("Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getPasswordResetRedirectUrl(),
        });
        if (error) {
          throw new Error(mapAuthError(error));
        }
        storePendingEmail(email);
      },
      updatePassword: async (password: string) => {
        if (!supabase) {
          throw new Error("Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          throw new Error(mapAuthError(error));
        }
      },
      resendVerification: async (email: string) => {
        if (!supabase) {
          throw new Error("Supabase configuration error. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
        }
        const { data } = await supabase.auth.getSession();
        if (data.session?.user && isEmailVerified(data.session.user)) {
          throw new Error("Your email is already verified. You can sign in now.");
        }
        const { error } = await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: getAuthCallbackUrl() },
        });
        if (error) {
          logAuthError("resend-error", error);
          throw new Error(mapAuthError(error));
        }
      },

      refreshProfile: async () => {
        setLoading(true);
        try {
          if (localStorage.getItem(OPERATOR_DEMO_STORAGE_KEY)) {
            const stored = localStorage.getItem("vidyutone-mock-session");
            if (stored) {
              try {
                const mockSession = JSON.parse(stored);
                if (mockSession.access_token === "mock-operator-token") {
                  setSession(mockSession);
                  setUser(mockSession.user);
                  try {
                    const me = await getMe(mockSession.access_token);
                    setProfile(me);
                  } catch {
                    setProfile(demoOperatorProfile());
                  }
                  return;
                }
              } catch {
                // fall through
              }
            }
          }
          if (!supabase) {
            await applySession(null);
            return;
          }
          const { data } = await supabase.auth.getSession();
          await applySession(data.session);
        } finally {
          setLoading(false);
        }
      },
      enterOperatorDemo: async () => {
        if (supabase) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // local demo should still proceed
          }
        }
        const mockSession = demoOperatorSession();
        localStorage.setItem(OPERATOR_DEMO_STORAGE_KEY, "1");
        localStorage.setItem("vidyutone-mock-session", JSON.stringify(mockSession));
        setSession(mockSession as any);
        setUser(mockSession.user as any);
        try {
          const me = await getMe(mockSession.access_token);
          setProfile(me);
        } catch {
          setProfile(demoOperatorProfile());
        }
        setLoading(false);
      },
    };
  }, [applySession, loading, profile, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
