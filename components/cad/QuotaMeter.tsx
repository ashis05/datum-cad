import type { UsageWindow } from "@/lib/api";

export default function QuotaMeter({ day }: { day: UsageWindow | null }) {
  if (!day || day.limit <= 0) return null;
  const remaining = Math.max(0, Math.min(day.remaining, day.limit));
  const ratio = remaining / day.limit;
  const low = ratio <= 0.2;
  return (
    <div
      className="mb-2 flex items-center gap-2 px-1 text-[11px]"
      title={`Resets ${new Date(day.resetAt).toLocaleString()}`}
    >
      <span className={`font-mono tabular-nums ${low ? "text-warn" : "text-text-3"}`}>
        {remaining} / {day.limit} <span className="font-sans">today</span>
      </span>
      <div
        role="meter"
        aria-label="Generations left today"
        aria-valuemin={0}
        aria-valuemax={day.limit}
        aria-valuenow={remaining}
        className="h-1 flex-1 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${low ? "bg-warn" : "bg-accent"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
