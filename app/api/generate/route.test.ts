import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/server/gemini", () => ({
  generateCad: vi.fn(),
  getModel: () => "test-model",
}));

const currentUserId = vi.fn();
vi.mock("../../../auth", () => ({ currentUserId: () => currentUserId() }));

import { generateCad } from "../../../lib/server/gemini";
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
  mocked.mockReset();
  delete process.env.DATABASE_URL;
  currentUserId.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
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
});
