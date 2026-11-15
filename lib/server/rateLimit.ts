// Per-IP fixed-window rate limiter (per-minute and per-day buckets).
//
// In-memory and per-instance: on serverless (Vercel) each warm instance keeps
// its own counters, so this is best-effort abuse protection, not a hard cap.

export interface LimitResult {
  ok: boolean;
  retryAfter: number; // seconds until the blocking window resets (0 when ok)
}

interface Bucket {
  count: number;
  resetAt: number; // ms epoch
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_ENTRIES = 5000;

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createRateLimiter(opts?: { perMinute?: number; perDay?: number }) {
  const minute = new Map<string, Bucket>();
  const day = new Map<string, Bucket>();

  function prune(map: Map<string, Bucket>, now: number) {
    if (map.size < MAX_ENTRIES) return;
    for (const [k, b] of map) if (b.resetAt <= now) map.delete(k);
    // Still full of live entries: drop the oldest insertions to stay bounded.
    for (const k of map.keys()) {
      if (map.size < MAX_ENTRIES) break;
      map.delete(k);
    }
  }

  function live(map: Map<string, Bucket>, ip: string, now: number, span: number): Bucket {
    let b = map.get(ip);
    if (!b || b.resetAt <= now) {
      prune(map, now);
      b = { count: 0, resetAt: now + span };
      map.set(ip, b);
    }
    return b;
  }

  return {
    /** Counts one request for `ip`. Limits are read per call so env changes apply. */
    check(ip: string, now: number = Date.now()): LimitResult {
      const perMinute = opts?.perMinute ?? envInt("RATE_LIMIT_PER_MINUTE", 8);
      const perDay = opts?.perDay ?? envInt("RATE_LIMIT_PER_DAY", 60);
      const m = live(minute, ip, now, MINUTE);
      const d = live(day, ip, now, DAY);
      if (m.count >= perMinute || d.count >= perDay) {
        const wait = Math.max(m.count >= perMinute ? m.resetAt - now : 0, d.count >= perDay ? d.resetAt - now : 0);
        return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
      }
      m.count++;
      d.count++;
      return { ok: true, retryAfter: 0 };
    },
    size: () => minute.size + day.size,
  };
}

export const rateLimiter = createRateLimiter();

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "local";
}
