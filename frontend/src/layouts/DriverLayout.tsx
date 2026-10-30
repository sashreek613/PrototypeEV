import { Outlet } from "react-router-dom";

import { LocaleProvider } from "../i18n";

export function DriverLayout() {
  return (
    <LocaleProvider>
      <div className="flex min-h-screen justify-center bg-[var(--vo-bg)] transition-colors">
        <div className="relative w-full max-w-[430px] min-h-screen overflow-hidden bg-[var(--driver-bg)] text-[var(--driver-ink)] border-x border-[var(--vo-border)] shadow-xs transition-colors flex flex-col">
          <Outlet />
        </div>
      </div>
    </LocaleProvider>
  );
}
