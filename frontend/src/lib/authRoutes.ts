import type { Profile, UserRole } from "../types";

export function homeForRole(roleOrProfile: UserRole | Profile | string | null | undefined, profileObj?: Profile | null): string {
  const profile = roleOrProfile && typeof roleOrProfile === "object" ? roleOrProfile : profileObj;
  const role = typeof roleOrProfile === "string" ? roleOrProfile : profile?.role;

  if (role === "admin") {
    return "/admin";
  }
  if (role === "planner") {
    if (!profile || profile.is_verified === false || profile.is_active === false || profile.verification_status !== "approved") {
      return "/planner-pending";
    }
    return "/planner";
  }
  if (role === "driver") {
    return "/driver";
  }
  if (role === "operator") {
    return "/operator";
  }
  return "/";
}


