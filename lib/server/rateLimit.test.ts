import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rateLimit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks with retryAfter", () => {
    const rl = createRateLimiter({ perMinute: 3, perDay: 100 });
    for (let i = 0; i < 3; i++) expect(rl.check("a", 1000).ok).toBe(true);
    const r = rl.check("a", 1000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    const rl = createRateLimiter({ perMinute: 1, perDay: 100 });
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 0).ok).toBe(false);
    expect(rl.check("b", 0).ok).toBe(true);
  });

  it("resets after the window", () => {
    const rl = createRateLimiter({ perMinute: 1, perDay: 100 });
    rl.check("a", 0);
    expect(rl.check("a", 30_000).ok).toBe(false);
    expect(rl.check("a", 60_001).ok).toBe(true);
  });

  it("enforces the daily bucket", () => {
    const rl = createRateLimiter({ perMinute: 100, perDay: 2 });
    rl.check("a", 0);
    rl.check("a", 70_000);
    const r = rl.check("a", 140_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(80_000);
    expect(rl.check("a", 86_400_001).ok).toBe(true);
  });

  it("stays bounded", () => {
    const rl = createRateLimiter({ perMinute: 5, perDay: 5 });
    for (let i = 0; i < 12_000; i++) rl.check(`ip${i}`, 0);
    expect(rl.size()).toBeLessThanOrEqual(10_000);
  });
});

describe("clientIp", () => {
  it("prefers x-forwarded-for, then x-real-ip, then local", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "3.3.3.3" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("local");
  });
});
