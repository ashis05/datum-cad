import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("./db", () => ({ hasDb: () => true, getDb: () => ({ execute }), schema: {} }));

import {
  checkRateLimit,
  createMemoryStore,
  createPgStore,
  limitsFor,
  peekRateLimit,
} from "./rateLimit";

const ENV = [
  "RATE_LIMIT_ANON_PER_MINUTE",
  "RATE_LIMIT_ANON_PER_DAY",
  "RATE_LIMIT_USER_PER_MINUTE",
  "RATE_LIMIT_USER_PER_DAY",
  "RATE_LIMIT_PRO_PER_MINUTE",
  "RATE_LIMIT_PRO_PER_DAY",
];
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  execute.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("limitsFor", () => {
  it("has per-tier defaults and reads env per call", () => {
    expect(limitsFor("anonymous")).toEqual({ perMinute: 3, perDay: 10 });
    expect(limitsFor("free")).toEqual({ perMinute: 10, perDay: 100 });
    expect(limitsFor("pro")).toEqual({ perMinute: 30, perDay: 500 });
    process.env.RATE_LIMIT_PRO_PER_DAY = "7";
    expect(limitsFor("pro").perDay).toBe(7);
  });
});

describe("memory store", () => {
  it("allows up to the limit then blocks with retryAfter", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("ip:a", "anonymous", { store, now: 1000 })).ok).toBe(true);
    const r = await checkRateLimit("ip:a", "anonymous", { store, now: 1000 });
    expect(r.ok).toBe(false);
    expect(r.dayExceeded).toBe(false);
    expect(r.retryAfter).toBe(60);
  });

  it("signed-in tiers get higher limits than anonymous", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 4; i++) await checkRateLimit("ip:a", "anonymous", { store, now: 0 });
    expect((await checkRateLimit("ip:a", "anonymous", { store, now: 0 })).ok).toBe(false);
    for (let i = 0; i < 10; i++) expect((await checkRateLimit("user:u", "free", { store, now: 0 })).ok).toBe(true);
    expect((await checkRateLimit("user:u", "free", { store, now: 0 })).ok).toBe(false);
    for (let i = 0; i < 30; i++) expect((await checkRateLimit("user:p", "pro", { store, now: 0 })).ok).toBe(true);
  });

  it("tracks keys independently and resets after the window", async () => {
    const store = createMemoryStore();
    process.env.RATE_LIMIT_ANON_PER_MINUTE = "1";
    expect((await checkRateLimit("ip:a", "anonymous", { store, now: 0 })).ok).toBe(true);
    expect((await checkRateLimit("ip:a", "anonymous", { store, now: 30_000 })).ok).toBe(false);
    expect((await checkRateLimit("ip:b", "anonymous", { store, now: 0 })).ok).toBe(true);
    expect((await checkRateLimit("ip:a", "anonymous", { store, now: 60_001 })).ok).toBe(true);
  });

  it("flags the day window and reports remaining/resetAt", async () => {
    const store = createMemoryStore();
    process.env.RATE_LIMIT_ANON_PER_MINUTE = "100";
    process.env.RATE_LIMIT_ANON_PER_DAY = "2";
    const first = await checkRateLimit("ip:a", "anonymous", { store, now: 0 });
    expect(first.day).toEqual({ limit: 2, remaining: 1, resetAt: 86_400_000 });
    await checkRateLimit("ip:a", "anonymous", { store, now: 70_000 });
    const r = await checkRateLimit("ip:a", "anonymous", { store, now: 140_000 });
    expect(r.ok).toBe(false);
    expect(r.dayExceeded).toBe(true);
    expect(r.day.remaining).toBe(0);
    expect(r.retryAfter).toBe(Math.ceil((86_400_000 - 140_000) / 1000));
    expect((await checkRateLimit("ip:a", "anonymous", { store, now: 86_400_001 })).ok).toBe(true);
  });

  it("peek does not increment", async () => {
    const store = createMemoryStore();
    await checkRateLimit("ip:a", "anonymous", { store, now: 0 });
    for (let i = 0; i < 5; i++) await peekRateLimit("ip:a", "anonymous", { store, now: 0 });
    const u = await peekRateLimit("ip:a", "anonymous", { store, now: 0 });
    expect(u.minute.remaining).toBe(2);
    expect(u.day.remaining).toBe(9);
    const fresh = await peekRateLimit("ip:zzz", "free", { store, now: 0 });
    expect(fresh.day).toEqual({ limit: 100, remaining: 100, resetAt: 86_400_000 });
  });

  it("stays bounded", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 12_000; i++) await store.hit(`ip:${i}`, 0);
    expect(store.size()).toBeLessThanOrEqual(10_000);
  });
});

describe("postgres store", () => {
  const start = new Date(1_000_000);

  it("runs one statement per check and parses the returned rows", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    execute.mockResolvedValue({
      rows: [
        { window: "minute", count: 2, windowStart: start },
        { window: "day", count: "5", windowStart: start.toISOString() },
      ],
    });
    const r = await checkRateLimit("user:u", "free", { store: createPgStore(), now: 1_010_000 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.minute).toEqual({ limit: 10, remaining: 8, resetAt: 1_060_000 });
    expect(r.day).toEqual({ limit: 100, remaining: 95, resetAt: 1_000_000 + 86_400_000 });
  });

  it("blocks when the returned count exceeds the limit", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    execute.mockResolvedValue([
      { window: "minute", count: 4, windowStart: start },
      { window: "day", count: 4, windowStart: start },
    ]);
    const r = await checkRateLimit("ip:a", "anonymous", { store: createPgStore(), now: 1_010_000 });
    expect(r.ok).toBe(false);
    expect(r.dayExceeded).toBe(false);
    expect(r.retryAfter).toBe(50);
  });

  it("issues the cleanup delete on ~1% of calls without blocking", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.001);
    execute.mockResolvedValue({ rows: [] });
    await checkRateLimit("ip:a", "anonymous", { store: createPgStore(), now: 0 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("peek issues a single read", async () => {
    execute.mockResolvedValue({ rows: [{ window: "day", count: 3, windowStart: start }] });
    const u = await peekRateLimit("ip:a", "anonymous", { store: createPgStore(), now: 1_010_000 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(u.day.remaining).toBe(7);
    expect(u.minute.remaining).toBe(3);
  });

  it("falls back to memory for the request when postgres throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValue(new Error("db down"));
    const r = await checkRateLimit("ip:fallback-test", "anonymous");
    expect(r.ok).toBe(true);
    expect(r.day.remaining).toBe(9);
  });
});
