import type { Profile } from "../types";

export const OPERATOR_DEMO_STORAGE_KEY = "vidyutone-operator-demo";
export const OPERATOR_DEMO_TOKEN = "mock-operator-token";

export function demoOperatorProfile(): Profile {
  return {
    id: "user-operator-demo",
    full_name: "Demo Operator",
    email: "operator.demo@vidyutone.local",
    role: "operator",
    organization: "Operator Demo Mode",
    designation: "Local demo",
    is_verified: true,
    is_active: true,
    verification_status: "approved",
    created_at: new Date().toISOString(),
  };
}

export function demoOperatorSession() {
  const profile = demoOperatorProfile();
  return {
    access_token: OPERATOR_DEMO_TOKEN,
    user: {
      id: profile.id,
      email: profile.email,
      email_confirmed_at: new Date().toISOString(),
      user_metadata: {
        full_name: profile.full_name,
        role: "operator",
        organization: profile.organization,
      },
    },
  };
}

export function isOperatorDemoProfile(profile: Profile | null | undefined): boolean {
  return profile?.id === "user-operator-demo" || profile?.organization === "Operator Demo Mode";
}
