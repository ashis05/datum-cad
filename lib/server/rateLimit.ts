// Per-identity fixed-window rate limiter (per-minute and per-day windows).
//
// Storage: Postgres (table `rate_limit`) when DATABASE_URL is set, so limits
// hold across serverless instances; otherwise an in-memory store (per
// instance, best-effort). If Postgres throws at runtime we log and use the
// in-memory store for that request only (fail-soft).
//
// Semantics: a check INCREMENTS first, then blocks if count > limit. Blocked
// attempts therefore also count toward the window.

import { sql } from "drizzle-orm";
import type { Quota, UsageTier, UsageWindow } from "@/lib/api";
import { getDb, hasDb } from "./db";

export interface LimitResult {
  ok: boolean;
  retryAfter: number; // seconds until the blocking window(s) reset (0 when ok)
  minute: UsageWindow;
  day: UsageWindow;
  /** True when the DAY window is (also) over its limit. */
  dayExceeded: boolean;
}

export interface WindowState {
  count: number;
  resetAt: number; // ms epoch
}
export interface Snapshot {
  minute: WindowState;
  day: WindowState;
}

export interface RateLimitStore {
  /** Counts one request for `key` and returns the resulting state. */
  hit(key: string, now: number): Promise<Snapshot>;
  /** Current state for `key` without counting. */
  peek(key: string, now: number): Promise<Snapshot>;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_ENTRIES = 5000;

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Limits for a tier, read from env on every call. */
export function limitsFor(tier: UsageTier): { perMinute: number; perDay: number } {
  switch (tier) {
    case "pro":
      return { perMinute: envInt("RATE_LIMIT_PRO_PER_MINUTE", 30), perDay: envInt("RATE_LIMIT_PRO_PER_DAY", 500) };
    case "free":
      return { perMinute: envInt("RATE_LIMIT_USER_PER_MINUTE", 10), perDay: envInt("RATE_LIMIT_USER_PER_DAY", 100) };
    default:
      return { perMinute: envInt("RATE_LIMIT_ANON_PER_MINUTE", 3), perDay: envInt("RATE_LIMIT_ANON_PER_DAY", 10) };
  }
}

// ── In-memory store ────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

export function createMemoryStore() {
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

  function live(map: Map<string, Bucket>, key: string, now: number, span: number): Bucket {
    let b = map.get(key);
    if (!b || b.resetAt <= now) {
      prune(map, now);
      b = { count: 0, resetAt: now + span };
      map.set(key, b);
    }
    return b;
  }

  function read(map: Map<string, Bucket>, key: string, now: number, span: number): WindowState {
    const b = map.get(key);
    return b && b.resetAt > now ? { count: b.count, resetAt: b.resetAt } : { count: 0, resetAt: now + span };
  }

  return {
    async hit(key: string, now: number): Promise<Snapshot> {
      const m = live(minute, key, now, MINUTE);
      const d = live(day, key, now, DAY);
      m.count++;
      d.count++;
      return { minute: { ...m }, day: { ...d } };
    },
    async peek(key: string, now: number): Promise<Snapshot> {
      return { minute: read(minute, key, now, MINUTE), day: read(day, key, now, DAY) };
    },
    size: () => minute.size + day.size,
  };
}

export const memoryStore = createMemoryStore();

// ── Postgres store ─────────────────────────────────────────────────────────

interface Row {
  window: string;
  count: number | string;
  windowStart: Date | string;
}

function rowsOf(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function toSnapshot(rows: Row[], now: number): Snapshot {
  const out: Snapshot = {
    minute: { count: 0, resetAt: now + MINUTE },
    day: { count: 0, resetAt: now + DAY },
  };
  for (const r of rows) {
    const span = r.window === "minute" ? MINUTE : r.window === "day" ? DAY : 0;
    if (!span) continue;
    const resetAt = new Date(r.windowStart).getTime() + span;
    // Expired windows (peek only; hit() always returns fresh rows) count as empty.
    if (resetAt <= now) continue;
    out[r.window as "minute" | "day"] = { count: Number(r.count), resetAt };
  }
  return out;
}

export function createPgStore(): RateLimitStore {
  return {
    async hit(key, now) {
      const db = getDb();
      // One atomic statement: upsert both windows. When the stored window has
      // expired, restart it (count = 1, windowStart = now()); otherwise +1.
      const result = await db.execute(sql`
        INSERT INTO "rate_limit" ("key", "window", "windowStart", "count")
        VALUES (${key}, 'minute', now(), 1), (${key}, 'day', now(), 1)
        ON CONFLICT ("key", "window") DO UPDATE SET
          "count" = CASE
            WHEN "rate_limit"."windowStart" + (CASE WHEN "rate_limit"."window" = 'minute' THEN interval '1 minute' ELSE interval '1 day' END) <= EXCLUDED."windowStart"
            THEN 1 ELSE "rate_limit"."count" + 1 END,
          "windowStart" = CASE
            WHEN "rate_limit"."windowStart" + (CASE WHEN "rate_limit"."window" = 'minute' THEN interval '1 minute' ELSE interval '1 day' END) <= EXCLUDED."windowStart"
            THEN EXCLUDED."windowStart" ELSE "rate_limit"."windowStart" END
        RETURNING "window", "count", "windowStart"
      `);
      // Opportunistic cleanup (~1% of calls), never blocks or throws.
      if (Math.random() < 0.01) {
        void Promise.resolve(db.execute(sql`DELETE FROM "rate_limit" WHERE "windowStart" < now() - interval '2 days'`)).catch(
          () => {},
        );
      }
      return toSnapshot(rowsOf(result), now);
    },
    async peek(key, now) {
      const result = await getDb().execute(
        sql`SELECT "window", "count", "windowStart" FROM "rate_limit" WHERE "key" = ${key}`,
      );
      return toSnapshot(rowsOf(result), now);
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

function defaultStore(): RateLimitStore {
  return hasDb() ? createPgStore() : memoryStore;
}

async function withFallback(
  store: RateLimitStore | undefined,
  op: (s: RateLimitStore) => Promise<Snapshot>,
): Promise<Snapshot> {
  const s = store ?? defaultStore();
  if (s === memoryStore) return op(s);
  try {
    return await op(s);
  } catch (err) {
    console.error("[rateLimit] store failed, using in-memory fallback:", err instanceof Error ? err.message : err);
    return op(memoryStore);
  }
}

function windowOf(state: WindowState, limit: number): UsageWindow {
  return { limit, remaining: Math.max(0, limit - state.count), resetAt: state.resetAt };
}

/** Counts one request for `key` (blocked attempts count too). */
export async function checkRateLimit(
  key: string,
  tier: UsageTier,
  opts?: { store?: RateLimitStore; now?: number },
): Promise<LimitResult> {
  const now = opts?.now ?? Date.now();
  const { perMinute, perDay } = limitsFor(tier);
  const snap = await withFallback(opts?.store, (s) => s.hit(key, now));
  const minute = windowOf(snap.minute, perMinute);
  const day = windowOf(snap.day, perDay);
  const mOver = snap.minute.count > perMinute;
  const dOver = snap.day.count > perDay;
  if (!mOver && !dOver) return { ok: true, retryAfter: 0, minute, day, dayExceeded: false };
  const wait = Math.max(mOver ? snap.minute.resetAt - now : 0, dOver ? snap.day.resetAt - now : 0);
  return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)), minute, day, dayExceeded: dOver };
}

/** Current usage without counting a request. */
export async function peekRateLimit(
  key: string,
  tier: UsageTier,
  opts?: { store?: RateLimitStore; now?: number },
): Promise<{ minute: UsageWindow; day: UsageWindow }> {
  const now = opts?.now ?? Date.now();
  const { perMinute, perDay } = limitsFor(tier);
  const snap = await withFallback(opts?.store, (s) => s.peek(key, now));
  return { minute: windowOf(snap.minute, perMinute), day: windowOf(snap.day, perDay) };
}

// ── Shared Gemini budget ───────────────────────────────────────────────────
//
// Every user draws on ONE Gemini API key, whose daily quota (requests per day)
// is far smaller than the sum of per-user allowances. Google exposes no API
// for the remaining quota, so we count calls ourselves in a single row
// (`shared:gemini`) whose window starts at midnight Pacific time — when Google
// resets per-day quotas. If Gemini answers 429 anyway, markSharedExhausted()
// pins the count at the limit so our number matches reality until the reset.

export const SHARED_KEY = "shared:gemini";

/** The shared key's daily request budget (GEMINI_DAILY_LIMIT, default 20 = free tier). */
export function sharedLimit(): number {
  return envInt("GEMINI_DAILY_LIMIT", 20);
}

const PT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function ptParts(t: number) {
  const p = Object.fromEntries(PT.formatToParts(t).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month - 1, d: +p.day, wall: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) };
}

/** UTC instant of Pacific midnight on the PT calendar date (y, m, d), DST-aware. */
function ptMidnight(y: number, m: number, d: number): number {
  const local = Date.UTC(y, m, d);
  let t = local + 8 * 3_600_000; // first guess: PST
  for (let i = 0; i < 2; i++) t = local - (ptParts(t).wall - Math.floor(t / 1000) * 1000); // refine with the offset AT t
  return t;
}

/** Start of the current Pacific-time day (ms epoch) and when it ends (next PT midnight). */
export function pacificDay(now: number): { start: number; resetAt: number } {
  const { y, m, d } = ptParts(now);
  const start = ptMidnight(y, m, d);
  const next = ptParts(start + DAY + 2 * 3_600_000); // safely inside tomorrow, even on a 25-hour day
  return { start, resetAt: ptMidnight(next.y, next.m, next.d) };
}

export interface SharedStore {
  /** Count one call in the day that began at `start`; returns the new count. */
  hit(start: number): Promise<number>;
  /** Calls counted in the day that began at `start`. */
  peek(start: number): Promise<number>;
  /** Raise the count for the day that began at `start` to at least `count`. */
  floor(start: number, count: number): Promise<void>;
}

export function createMemorySharedStore(): SharedStore {
  let state = { start: 0, count: 0 };
  const roll = (start: number) => {
    if (state.start < start) state = { start, count: 0 };
  };
  return {
    async hit(start) {
      roll(start);
      return ++state.count;
    },
    async peek(start) {
      return state.start < start ? 0 : state.count;
    },
    async floor(start, count) {
      roll(start);
      state.count = Math.max(state.count, count);
    },
  };
}

export const memorySharedStore = createMemorySharedStore();

export function createPgSharedStore(): SharedStore {
  // A newer window (EXCLUDED.windowStart > stored) restarts the count.
  const upsert = (start: number, count: number, mode: "add" | "floor") => {
    const startTs = new Date(start).toISOString();
    const keep =
      mode === "add"
        ? sql`"rate_limit"."count" + 1`
        : sql`GREATEST("rate_limit"."count", EXCLUDED."count")`;
    return getDb().execute(sql`
      INSERT INTO "rate_limit" ("key", "window", "windowStart", "count")
      VALUES (${SHARED_KEY}, 'day', ${startTs}::timestamptz, ${count})
      ON CONFLICT ("key", "window") DO UPDATE SET
        "count" = CASE WHEN "rate_limit"."windowStart" < EXCLUDED."windowStart" THEN EXCLUDED."count" ELSE ${keep} END,
        "windowStart" = GREATEST("rate_limit"."windowStart", EXCLUDED."windowStart")
      RETURNING "count"
    `);
  };
  return {
    async hit(start) {
      const [row] = rowsOf(await upsert(start, 1, "add"));
      return Number(row?.count ?? 1);
    },
    async peek(start) {
      const result = await getDb().execute(
        sql`SELECT "window", "count", "windowStart" FROM "rate_limit" WHERE "key" = ${SHARED_KEY} AND "window" = 'day'`,
      );
      const [row] = rowsOf(result);
      return row && new Date(row.windowStart).getTime() >= start ? Number(row.count) : 0;
    },
    async floor(start, count) {
      await upsert(start, count, "floor");
    },
  };
}

async function sharedOp<T>(store: SharedStore | undefined, op: (s: SharedStore) => Promise<T>): Promise<T> {
  const s = store ?? (hasDb() ? createPgSharedStore() : memorySharedStore);
  if (s === memorySharedStore) return op(s);
  try {
    return await op(s);
  } catch (err) {
    console.error("[rateLimit] shared store failed, using in-memory fallback:", err instanceof Error ? err.message : err);
    return op(memorySharedStore);
  }
}

function sharedWindow(count: number, now: number): UsageWindow {
  const limit = sharedLimit();
  return { limit, remaining: Math.max(0, limit - count), resetAt: pacificDay(now).resetAt };
}

/** Count one Gemini call against the shared budget. ok=false when it's spent. */
export async function checkSharedBudget(opts?: {
  store?: SharedStore;
  now?: number;
}): Promise<{ ok: boolean; window: UsageWindow; retryAfter: number }> {
  const now = opts?.now ?? Date.now();
  const count = await sharedOp(opts?.store, (s) => s.hit(pacificDay(now).start));
  const window = sharedWindow(count, now);
  const ok = count <= window.limit;
  return { ok, window, retryAfter: ok ? 0 : Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
}

/** The shared budget without counting a call. */
export async function peekSharedBudget(opts?: { store?: SharedStore; now?: number }): Promise<UsageWindow> {
  const now = opts?.now ?? Date.now();
  const count = await sharedOp(opts?.store, (s) => s.peek(pacificDay(now).start));
  return sharedWindow(count, now);
}

/** Gemini said the key is out of quota: treat the shared budget as spent until the reset. */
export async function markSharedExhausted(opts?: { store?: SharedStore; now?: number }): Promise<UsageWindow> {
  const now = opts?.now ?? Date.now();
  const limit = sharedLimit();
  await sharedOp(opts?.store, (s) => s.floor(pacificDay(now).start, limit));
  return { limit, remaining: 0, resetAt: pacificDay(now).resetAt };
}

/** What the caller can actually use: whichever of their allowance / the shared budget has less left. */
export function effectiveQuota(day: UsageWindow, shared: UsageWindow): Quota {
  return shared.remaining < day.remaining ? { ...shared, scope: "shared" } : { ...day, scope: "user" };
}
