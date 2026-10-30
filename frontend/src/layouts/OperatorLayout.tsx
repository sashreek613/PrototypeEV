import { Outlet } from "react-router-dom";

export function OperatorLayout() {
  return (
    <div className="min-h-screen bg-vo-bg text-vo-text">
      <Outlet />
    </div>
  );
}
