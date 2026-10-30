import { Outlet } from "react-router-dom";

import { ConsiderationContext } from "../context/ConsiderationContext";
import { useConsideration } from "../hooks/useConsideration";
import { Sidebar } from "../components/planner/Sidebar";

export function PlannerLayout() {
  const consideration = useConsideration();

  return (
    <ConsiderationContext.Provider value={consideration}>
      <div className="flex h-screen overflow-hidden bg-vo-bg text-vo-text">
        <Sidebar />
        <div className="vo-scroll min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </ConsiderationContext.Provider>
  );
}
