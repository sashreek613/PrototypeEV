interface BatteryCardProps {
  percent: number;
  rangeKm: number;
}

export function BatteryCard({ percent, rangeKm }: BatteryCardProps) {
  return (
    <section className="rounded-[28px] bg-[#111417] px-5 py-5 text-white">
      <div className="flex items-start justify-between text-[11px] tracking-[0.16em] text-white/50">
        <span>BATTERY</span>
        <span className="text-right tracking-normal text-white/60">
          Tata Nexon EV
          <br />
          KA 05 MH 4417
        </span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <p className="text-[52px] leading-none font-semibold">{percent}%</p>
        <p className="mb-1 text-[16px] text-white/80">{rangeKm} km range</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-vo-accent" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-[10px] tracking-[0.14em] text-white/45">
        <span>30 KM RESERVE</span>
        <span>NEXT CHARGE ADVISED TODAY</span>
      </div>
    </section>
  );
}
