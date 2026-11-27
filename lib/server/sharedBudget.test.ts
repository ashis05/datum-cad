import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("./db", () => ({ hasDb: () => true, getDb: () => ({ execute }), schema: {} }));

import {
  checkSharedBudget,
  createMemorySharedStore,
  createPgSharedStore,
  effectiveQuota,
  markSharedExhausted,
  pacificDay,
  peekSharedBudget,
} from "./rateLimit";

afterEach(() => {
  delete process.env.GEMINI_DAILY_LIMIT;
  execute.mockReset();
});

describe("pacificDay", () => {
  it("starts at local midnight in Los Angeles (PST, UTC-8)", () => {
    const now = Date.UTC(2026, 0, 15, 20, 0); // 12:00 PST
    expect(pacificDay(now)).toEqual({ start: Date.UTC(2026, 0, 15, 8), resetAt: Date.UTC(2026, 0, 16, 8) });
  });

  it("uses PDT (UTC-7) in summer, and the UTC date can differ from the PT date", () => {
    const now = Date.UTC(2026, 6, 2, 3, 0); // Jul 1, 20:00 PDT
    expect(pacificDay(now)).toEqual({ start: Date.UTC(2026, 6, 1, 7), resetAt: Date.UTC(2026, 6, 2, 7) });
  });

  it("is a 23-hour day when DST starts", () => {
    const now = Date.UTC(2026, 2, 8, 18); // Mar 8 2026, DST begins at 02:00 PT
    const { start, resetAt } = pacificDay(now);
    expect(start).toBe(Date.UTC(2026, 2, 8, 8));
    expect(resetAt).toBe(Date.UTC(2026, 2, 9, 7));
  });

  it("is a 25-hour day when DST ends", () => {
    const now = Date.UTC(2026, 10, 1, 18); // Nov 1 2026, DST ends at 02:00 PT
    expect(pacificDay(now)).toEqual({ start: Date.UTC(2026, 10, 1, 7), resetAt: Date.UTC(2026, 10, 2, 8) });
  });

  it("just before and after midnight PT land in different days", () => {
    const midnight = Date.UTC(2026, 0, 16, 8);
    expect(pacificDay(midnight - 1).resetAt).toBe(midnight);
    expect(pacificDay(midnight).start).toBe(midnight);
  });
});

describe("shared budget (memory store)", () => {
  it("counts, blocks over the limit, and restarts the next Pacific day", async () => {
    process.env.GEMINI_DAILY_LIMIT = "2";
    const store = createMemorySharedStore();
    const now = Date.UTC(2026, 0, 15, 20);
    expect((await checkSharedBudget({ store, now })).ok).toBe(true);
    const second = await checkSharedBudget({ store, now });
    expect(second).toMatchObject({ ok: true, window: { limit: 2, remaining: 0 } });
    const third = await checkSharedBudget({ store, now });
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBe((Date.UTC(2026, 0, 16, 8) - now) / 1000);

    const tomorrow = Date.UTC(2026, 0, 16, 9);
    expect((await peekSharedBudget({ store, now: tomorrow })).remaining).toBe(2);
    expect((await checkSharedBudget({ store, now: tomorrow })).ok).toBe(true);
  });

  it("peek doesn't count; markSharedExhausted pins it at zero until the reset", async () => {
    process.env.GEMINI_DAILY_LIMIT = "5";
    const store = createMemorySharedStore();
    const now = Date.UTC(2026, 0, 15, 20);
    await peekSharedBudget({ store, now });
    expect((await peekSharedBudget({ store, now })).remaining).toBe(5);
    await markSharedExhausted({ store, now });
    expect((await peekSharedBudget({ store, now })).remaining).toBe(0);
    expect((await checkSharedBudget({ store, now })).ok).toBe(false);
  });
});

describe("shared budget (Postgres store)", () => {
  it("one upsert per check, keyed shared:gemini with the Pacific day start", async () => {
    process.env.GEMINI_DAILY_LIMIT = "20";
    execute.mockResolvedValue({ rows: [{ count: 4 }] });
    const now = Date.UTC(2026, 0, 15, 20);
    const r = await checkSharedBudget({ store: createPgSharedStore(), now });
    expect(execute).toHaveBeenCalledTimes(1);
    const q = JSON.stringify(execute.mock.calls[0][0]);
    expect(q).toContain("shared:gemini");
    expect(q).toContain(new Date(Date.UTC(2026, 0, 15, 8)).toISOString());
    expect(r).toMatchObject({ ok: true, window: { limit: 20, remaining: 16 } });
  });

  it("peek ignores a row from an earlier day", async () => {
    execute.mockResolvedValue({ rows: [{ window: "day", count: 19, windowStart: "2026-01-14 08:00:00+00" }] });
    const w = await peekSharedBudget({ store: createPgSharedStore(), now: Date.UTC(2026, 0, 15, 20) });
    expect(w.remaining).toBe(20);
  });

  it("falls back to memory when Postgres throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValue(new Error("down"));
    const r = await checkSharedBudget({ store: createPgSharedStore() });
    expect(r.ok).toBe(true);
  });
});

describe("effectiveQuota", () => {
  const w = (remaining: number, limit = 100) => ({ limit, remaining, resetAt: 1 });
  it("picks whichever has less left", () => {
    expect(effectiveQuota(w(99), w(12, 20)).scope).toBe("shared");
    expect(effectiveQuota(w(3, 10), w(12, 20))).toEqual({ ...w(3, 10), scope: "user" });
    expect(effectiveQuota(w(5), w(5, 20)).scope).toBe("user");
  });
});
