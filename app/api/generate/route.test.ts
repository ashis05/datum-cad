import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/server/gemini", () => ({
  generateCad: vi.fn(),
  getModel: () => "test-model",
}));

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

  it("429 RATE_LIMITED after the per-minute limit", async () => {
    mocked.mockResolvedValue(ok);
    const ip = "9.9.9.9";
    for (let i = 0; i < 8; i++) expect((await call({ prompt: "box" }, ip)).status).toBe(200);
    const res = await call({ prompt: "box" }, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const j = await res.json();
    expect(j.code).toBe("RATE_LIMITED");
    expect(j.retryAfter).toBeGreaterThan(0);
  });
});
