import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/server/gemini", () => ({
  generateCad: vi.fn(),
  getModel: () => "test-model",
}));

const currentUserId = vi.fn();
vi.mock("../../../auth", () => ({ currentUserId: () => currentUserId() }));

import { generateCad } from "../../../lib/server/gemini";
import { peekSharedBudget } from "../../../lib/server/rateLimit";
import { POST } from "./route";

const mocked = vi.mocked(generateCad);
let ipN = 0;

function call(body: unknown, ip = `10.0.0.${++ipN}`) {
  return POST(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const ok = { code: "function buildModel(){}", params: [], notes: "n" };
const savedKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  // The shared Gemini budget is process-wide; keep it out of the way unless a test sets it.
  process.env.GEMINI_DAILY_LIMIT = "100000";
  mocked.mockReset();
  delete process.env.DATABASE_URL;
  currentUserId.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.GEMINI_DAILY_LIMIT;
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
  vi.restoreAllMocks();
});

describe("POST /api/generate", () => {
  it("400 on empty prompt, oversized prompt, bad JSON", async () => {
    for (const body of [{ prompt: "   " }, { prompt: "x".repeat(2001) }, "not json", { prompt: "a", currentCode: 5 }]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("BAD_REQUEST");
    }
    expect(mocked).not.toHaveBeenCalled();
  });

  it("503 without a key", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await call({ prompt: "box" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NO_KEY");
  });

  it("429 QUOTA with retryAfter", async () => {
    mocked.mockRejectedValue(Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","retryDelay":"34s"}}'), { status: 429 }));
    const res = await call({ prompt: "box" });
    expect(res.status).toBe(429);
    const j = await res.json();
    expect(j.code).toBe("QUOTA");
    expect(j.retryAfter).toBe(34);
  });

  it("502 UPSTREAM without leaking details", async () => {
    mocked.mockRejectedValue(new Error("secret internal stack"));
    const res = await call({ prompt: "box" });
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.code).toBe("UPSTREAM");
    expect(JSON.stringify(j)).not.toContain("secret");
  });

  it("200 on success and forwards trimmed input", async () => {
    mocked.mockResolvedValue(ok);
    const res = await call({ prompt: " box ", currentCode: "c", previousError: "e" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ok);
    expect(mocked).toHaveBeenCalledWith({ prompt: "box", currentCode: "c", previousError: "e" });
  });

  it("429 RATE_LIMITED after the anonymous per-minute limit, with headers", async () => {
    mocked.mockResolvedValue(ok);
    const ip = "9.9.9.9";
    for (let i = 0; i < 3; i++) expect((await call({ prompt: "box" }, ip)).status).toBe(200);
    const res = await call({ prompt: "box" }, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const j = await res.json();
    expect(j.code).toBe("RATE_LIMITED");
    expect(j.retryAfter).toBeGreaterThan(0);
  });

  it("429 AUTH_REQUIRED when an anonymous caller exhausts the daily limit", async () => {
    mocked.mockResolvedValue(ok);
    process.env.RATE_LIMIT_ANON_PER_MINUTE = "100";
    process.env.RATE_LIMIT_ANON_PER_DAY = "2";
    try {
      const ip = "9.9.9.10";
      await call({ prompt: "box" }, ip);
      await call({ prompt: "box" }, ip);
      const res = await call({ prompt: "box" }, ip);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).not.toBeNull();
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      const j = await res.json();
      expect(j.code).toBe("AUTH_REQUIRED");
      expect(j.retryAfter).toBeGreaterThan(0);
    } finally {
      delete process.env.RATE_LIMIT_ANON_PER_MINUTE;
      delete process.env.RATE_LIMIT_ANON_PER_DAY;
    }
  });

  it("signed-in users get higher limits and daily-exhaustion is RATE_LIMITED, not AUTH_REQUIRED", async () => {
    mocked.mockResolvedValue(ok);
    currentUserId.mockResolvedValue("user-a");
    for (let i = 0; i < 10; i++) expect((await call({ prompt: "box" }, "9.9.9.11")).status).toBe(200);
    expect((await call({ prompt: "box" }, "9.9.9.11")).status).toBe(429);

    process.env.RATE_LIMIT_USER_PER_MINUTE = "100";
    process.env.RATE_LIMIT_USER_PER_DAY = "1";
    try {
      currentUserId.mockResolvedValue("user-b");
      await call({ prompt: "box" });
      const res = await call({ prompt: "box" });
      expect(res.status).toBe(429);
      expect((await res.json()).code).toBe("RATE_LIMITED");
    } finally {
      delete process.env.RATE_LIMIT_USER_PER_MINUTE;
      delete process.env.RATE_LIMIT_USER_PER_DAY;
    }
  });

  it("sets X-RateLimit-* (day window, reset in unix seconds) on 200, 400 and 502", async () => {
    mocked.mockResolvedValue(ok);
    const ip = "9.9.9.12";
    const res = await call({ prompt: "box" }, ip);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("9");
    const reset = Number(res.headers.get("X-RateLimit-Reset"));
    expect(Math.abs(reset - (Date.now() / 1000 + 86_400))).toBeLessThan(5);

    const bad = await call("not json", ip);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("X-RateLimit-Remaining")).toBe("8");

    mocked.mockRejectedValue(new Error("x"));
    const up = await call({ prompt: "box" }, ip);
    expect(up.status).toBe(502);
    expect(up.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("403 FORBIDDEN for disabled users, without calling the model", async () => {
    // No DB in tests, so mock the identity lookup for this case.
    vi.resetModules();
    vi.doMock("../../../lib/server/identity", () => ({
      resolveIdentity: async () => ({ key: "user:x", tier: "free", userId: "x", disabled: true }),
    }));
    const { POST: P } = await import("./route");
    const res = await P(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ prompt: "box" }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    vi.doUnmock("../../../lib/server/identity");
  });

  describe("shared Gemini budget", () => {
    it("invalid and user-blocked requests don't spend it", async () => {
      const before = (await peekSharedBudget()).remaining;
      await call({ prompt: "" });
      const ip = "7.7.7.7";
      for (let i = 0; i < 5; i++) await call({ prompt: "" }, ip);
      expect((await peekSharedBudget()).remaining).toBe(before);
    });

    it("a successful call spends one", async () => {
      mocked.mockResolvedValue(ok);
      const before = (await peekSharedBudget()).remaining;
      expect((await call({ prompt: "box" })).status).toBe(200);
      expect((await peekSharedBudget()).remaining).toBe(before - 1);
    });

    it("when spent: 429 QUOTA without calling Gemini, headers scoped to shared", async () => {
      process.env.GEMINI_DAILY_LIMIT = "1"; // earlier successful calls already used more than 1
      const res = await call({ prompt: "box" });
      expect(res.status).toBe(429);
      expect(mocked).not.toHaveBeenCalled();
      const j = await res.json();
      expect(j.code).toBe("QUOTA");
      expect(j.retryAfter).toBeGreaterThan(0);
      expect(res.headers.get("X-RateLimit-Scope")).toBe("shared");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("the binding limit wins: shared when it has less left than the user", async () => {
      mocked.mockResolvedValue(ok);
      const used = (await peekSharedBudget()).limit - (await peekSharedBudget()).remaining;
      process.env.GEMINI_DAILY_LIMIT = String(used + 3); // 3 left for everyone, anon user has 10
      const res = await call({ prompt: "box" });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Scope")).toBe("shared");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
    });

    it("a daily-quota 429 from Gemini marks the budget spent; a per-minute 429 doesn't", async () => {
      mocked.mockRejectedValueOnce(Object.assign(new Error('{"retryDelay":"20s"}'), { status: 429 }));
      const busy = await call({ prompt: "box" });
      expect(busy.status).toBe(429);
      expect((await peekSharedBudget()).remaining).toBeGreaterThan(0);

      mocked.mockRejectedValueOnce(Object.assign(new Error("RESOURCE_EXHAUSTED: daily limit"), { status: 429 }));
      const spent = await call({ prompt: "box" });
      expect(spent.status).toBe(429);
      expect((await spent.json()).code).toBe("QUOTA");
      expect(spent.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect((await peekSharedBudget()).remaining).toBe(0);
    });
  });
});
