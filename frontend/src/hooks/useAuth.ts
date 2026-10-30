import { createContext, useContext } from "react";

import type { Session, User } from "@supabase/supabase-js";

import type { Profile, UserRole } from "../types";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  emailVerified: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (input: {
    fullName: string;
    email: string;
    password: string;
    role: UserRole;
    organization?: string;
    phoneNumber?: string;
    designation?: string;
  }) => Promise<{ needsVerification: boolean; profile: Profile | null }>;


  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  enterOperatorDemo: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
