import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUserId = vi.fn();
vi.mock("../../../auth", () => ({ currentUserId: () => currentUserId() }));

import { checkRateLimit } from "../../../lib/server/rateLimit";
import { GET } from "./route";

let n = 0;
const get = (ip: string) => GET(new Request("http://localhost/api/usage", { headers: { "x-forwarded-for": ip } }));

beforeEach(() => {
  delete process.env.DATABASE_URL;
  currentUserId.mockReset().mockResolvedValue(null);
});

describe("GET /api/usage", () => {
  it("returns anonymous usage, no-store, and does not consume quota", async () => {
    const ip = `7.7.7.${++n}`;
    await checkRateLimit(`ip:${ip}`, "anonymous");
    for (let i = 0; i < 4; i++) await get(ip);
    const res = await get(ip);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const j = await res.json();
    expect(j.tier).toBe("anonymous");
    expect(j.signedIn).toBe(false);
    expect(j.minute.limit).toBe(3);
    expect(j.minute.remaining).toBe(2);
    expect(j.day).toMatchObject({ limit: 10, remaining: 9 });
    expect(j.day.resetAt).toBeGreaterThan(Date.now());
  });

  it("returns free-tier limits when signed in", async () => {
    currentUserId.mockResolvedValue("user-usage");
    const j = await (await get("8.8.8.8")).json();
    expect(j).toMatchObject({ tier: "free", signedIn: true, minute: { limit: 10 }, day: { limit: 100, remaining: 100 } });
  });
});
