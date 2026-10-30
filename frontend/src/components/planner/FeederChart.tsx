import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Site } from "../../types";
import { feederLabel, insightsForSite } from "../../utils/siteInsights";

interface FeederChartProps {
  sites: Site[];
}

export function FeederChart({ sites }: FeederChartProps) {
  const rows = sites.map((site) => {
    const insights = insightsForSite(site);
    return {
      name: feederLabel(site),
      load: insights.peakLoadPct,
    };
  });

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--vo-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            tick={{ fill: "var(--vo-soft)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "var(--vo-elevated)", border: "1px solid var(--vo-border)", borderRadius: 8, fontSize: 12, color: "var(--vo-text)" }}
          />
          <ReferenceLine x={85} stroke="var(--vo-text)" strokeDasharray="4 4" />
          <Bar dataKey="load" barSize={10} radius={[0, 6, 6, 0]}>
            {rows.map((row) => (
              <Cell key={row.name} fill={row.load >= 85 ? "#ef5b5b" : "#00e8a2"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-right text-[10px] tracking-[0.14em] text-vo-muted">85% SAFE-LOADING THRESHOLD · PEAK 19:00</p>
    </div>
  );
}
