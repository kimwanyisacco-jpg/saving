"use client";
import { formatCompact } from "@/lib/format";

export interface SeriesPoint { label: string; a: number; b: number }

/** Grouped bars: savings (in) against credit movement per month. Pure CSS, no chart library. */
export function MonthBars({ data, labelA = "Savings in", labelB = "Credit issued" }: { data: SeriesPoint[]; labelA?: string; labelB?: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-2">
        {data.map((d) => (
          <div key={d.label} className="flex min-w-[3.5rem] flex-1 flex-col items-center gap-1">
            <div className="flex h-40 w-full items-end justify-center gap-1">
              <div className="w-1/3 rounded-t bg-brand-500" style={{ height: `${(d.a / max) * 100}%` }} title={`${labelA}: ${formatCompact(d.a)}`} />
              <div className="w-1/3 rounded-t bg-gold-400" style={{ height: `${(d.b / max) * 100}%` }} title={`${labelB}: ${formatCompact(d.b)}`} />
            </div>
            <span className="text-[11px] font-semibold text-ink-mute">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />{labelA}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gold-400" />{labelB}</span>
      </div>
    </div>
  );
}

/** A single horizontal bar used in "top customers" lists. */
export function Bar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "gold" }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sand-100">
      <div className={`h-full rounded-full ${tone === "brand" ? "bg-brand-500" : "bg-gold-400"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
