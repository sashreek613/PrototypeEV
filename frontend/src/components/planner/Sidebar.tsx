import { NavLink, useNavigate } from "react-router-dom";
import { FileText, LayoutGrid, LogOut, MapPin, ClipboardList, Zap } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { useConsiderationContext } from "../../context/ConsiderationContext";
import { ThemeToggle } from "../common/ThemeToggle";

export function Sidebar() {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { items } = useConsiderationContext();
  const considerationCount = items.length;

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  const items_nav = [
    { to: "/planner", label: "Overview", icon: LayoutGrid, end: true },
    { to: "/planner/explorer", label: "Site Explorer", icon: MapPin, end: false },
    // Grid & Demand and Build Plan are hidden from nav per a scope decision on
    // the Overview redesign, not removed -- PlannerGridPage.tsx,
    // PlannerBuildPlanPage.tsx, and their routes in App.tsx are untouched and
    // still reachable directly. Uncomment to restore them to the nav.
    // { to: "/planner/grid", label: "Grid & Demand", icon: Activity, end: false },
    // { to: "/planner/plan", label: "Build Plan", icon: ClipboardList, end: false },
    { to: "/planner/consideration", label: "Consideration", icon: ClipboardList, end: false },
    { to: "/planner/reports", label: "Reports", icon: FileText, end: false },
  ];

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-[var(--vo-border)] bg-[var(--vo-surface)] px-4 py-5 font-sans">
      <div className="mb-6 flex items-center space-x-2.5 px-2">
        <div className="w-7 h-7 rounded-lg bg-[#4F6F9F] dark:bg-[#6F8FB8] text-white flex items-center justify-center shadow-xs shrink-0">
          <Zap className="w-3.5 h-3.5 fill-current stroke-[2.5]" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight text-[var(--vo-text)] leading-none">VidyutOne</p>
          <p className="text-[10px] tracking-wider text-[var(--vo-muted)] uppercase font-medium mt-1">PLANNER CONSOLE</p>
        </div>
      </div>

      <p className="mb-2.5 px-2 text-[10px] font-semibold tracking-wider text-[var(--vo-muted)] uppercase">DECISION SUPPORT</p>
      <nav className="flex flex-col space-y-1">
        {items_nav.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-[#EEF2F7] dark:bg-[#6F8FB8]/15 text-[#4F6F9F] dark:text-[#6F8FB8] border border-[#4F6F9F]/20 dark:border-[#6F8FB8]/30"
                  : "text-[var(--vo-soft)] hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-[var(--vo-text)]"
              }`
            }
          >
            <span className="flex items-center space-x-2.5">
              <item.icon className="w-4 h-4 stroke-[1.75]" />
              <span>{item.label}</span>
            </span>
            {item.label === "Consideration" && considerationCount > 0 ? (
              <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#4F6F9F]/15 dark:bg-[#6F8FB8]/20 px-1 text-[10px] font-bold text-[#4F6F9F] dark:text-[#6F8FB8]">
                {considerationCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-5 border-t border-[var(--vo-border)] space-y-3">
        <div className="px-2">
          <p className="truncate text-xs font-bold text-[var(--vo-text)]">{profile?.full_name ?? "Planner Officer"}</p>
          <p className="truncate text-[11px] text-[var(--vo-muted)]">{profile?.organization ?? "DISCOM Planning Dept"}</p>
        </div>

        <div className="flex items-center justify-between px-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs text-[var(--vo-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        <div className="px-2 pt-1 flex items-center space-x-1.5 text-[10px] font-mono text-[var(--vo-muted)] border-t border-[var(--vo-border)]/50">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>BENGALURU URBAN DIVISION</span>
        </div>
      </div>
    </aside>
  );
}
