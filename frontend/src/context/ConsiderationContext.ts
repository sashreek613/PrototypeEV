import { createContext, useContext } from "react";

import type { UseConsiderationReturn } from "../hooks/useConsideration";

/** Provides the planner's consideration shortlist to all child components
 * without prop-drilling. Mounted once in PlannerLayout. */
export const ConsiderationContext = createContext<UseConsiderationReturn | null>(null);

export function useConsiderationContext(): UseConsiderationReturn {
  const ctx = useContext(ConsiderationContext);
  if (!ctx) {
    throw new Error("useConsiderationContext must be used inside PlannerLayout");
  }
  return ctx;
}
