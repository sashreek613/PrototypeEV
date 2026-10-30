import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function ChartCard({ title, meta, action, children, className = "", id }: ChartCardProps) {
  return (
    <section id={id} className={`rounded-2xl border border-vo-border bg-vo-surface ${className}`}>
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-vo-text">{title}</h2>
          {meta ? <p className="mt-0.5 text-[11px] tracking-[0.14em] text-vo-muted">{meta}</p> : null}
        </div>
        {action}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}
