import type { Quota } from "@/lib/api";

function resetLabel(resetAt: number): string {
  const d = new Date(resetAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString([], { weekday: "short" })} at ${time}`;
}

/**
 * How many generations the user can actually make: the smaller of their own
 * daily allowance and what's left of the shared AI quota every user draws on.
 * A prompt whose code needs fixing can use more than one try.
 */
export default function QuotaMeter({ quota }: { quota: Quota | null }) {
  if (!quota || quota.limit <= 0) return null;
  const remaining = Math.max(0, Math.min(quota.remaining, quota.limit));
  const ratio = remaining / quota.limit;
  const low = ratio <= 0.2;
  const label = remaining === 0 ? "No tries left today" : `${remaining} ${remaining === 1 ? "try" : "tries"} left today`;
  const why =
    quota.scope === "shared"
      ? `Shared AI capacity: ${remaining} of ${quota.limit} left for everyone today.`
      : `Your daily limit: ${remaining} of ${quota.limit} left.`;
  const title = `${why} Resets ${resetLabel(quota.resetAt)}. A prompt that needs an automatic fix uses an extra try.`;

  return (
    <div className="mb-2 flex items-center gap-2 px-1 text-[11px]" title={title}>
      <span className={`font-mono tabular-nums ${low ? "text-warn" : "text-text-3"}`}>
        {label}
        {quota.scope === "shared" && <span className="font-sans text-text-3"> · shared</span>}
      </span>
      <div
        role="meter"
        aria-label="Tries left today"
        aria-valuetext={`${label}. ${why}`}
        aria-valuemin={0}
        aria-valuemax={quota.limit}
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
