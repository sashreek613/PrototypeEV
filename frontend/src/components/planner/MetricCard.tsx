interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "green" | "amber" | "red" | "muted";
  hint: string;
  bar?: number;
  barColor?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaTone = "muted",
  hint,
  bar,
  barColor = "#00e8a2",
}: MetricCardProps) {
  const deltaClass =
    deltaTone === "green"
      ? "text-vo-accent"
      : deltaTone === "amber"
        ? "text-vo-amber"
        : deltaTone === "red"
          ? "text-vo-red"
          : "text-vo-muted";

  return (
    <article className="rounded-2xl border border-vo-border bg-vo-surface px-5 py-4">
      <p className="text-[12px] text-vo-muted">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-[32px] font-semibold leading-none tracking-tight text-vo-text">{value}</p>
        {delta ? <p className={`mb-0.5 text-[12px] ${deltaClass}`}>{delta}</p> : null}
      </div>
      <p className="mt-2 text-[12px] text-vo-muted">{hint}</p>
      {bar != null ? (
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, bar)}%`, background: barColor }} />
        </div>
      ) : null}
    </article>
  );
}
