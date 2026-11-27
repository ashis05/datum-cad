import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUserId = vi.fn();
vi.mock("@/auth", () => ({ currentUserId: () => currentUserId() }));

let dbOn = false;
const limit = vi.fn();
vi.mock("./db", () => ({
  hasDb: () => dbOn,
  schema: { users: { id: "id", tier: "tier", disabled: "disabled" } },
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit }) }) }) }),
}));

import { clientIp, resolveIdentity } from "./identity";

const req = (ip = "1.2.3.4") => new Request("http://x", { headers: { "x-forwarded-for": ip } });

beforeEach(() => {
  currentUserId.mockReset();
  limit.mockReset();
  dbOn = false;
});

describe("resolveIdentity", () => {
  it("anonymous keyed by IP", async () => {
    currentUserId.mockResolvedValue(null);
    expect(await resolveIdentity(req())).toEqual({ key: "ip:1.2.3.4", tier: "anonymous", userId: null, disabled: false });
  });

  it("signed-in without a DB is free", async () => {
    currentUserId.mockResolvedValue("u1");
    expect(await resolveIdentity(req())).toEqual({ key: "user:u1", tier: "free", userId: "u1", disabled: false });
  });

  it("reads tier and disabled from the users table", async () => {
    dbOn = true;
    currentUserId.mockResolvedValue("u1");
    limit.mockResolvedValue([{ tier: "pro", disabled: true }]);
    const id = await resolveIdentity(req());
    expect(id).toMatchObject({ tier: "pro", disabled: true });
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("missing row or lookup failure is free, never throws", async () => {
    dbOn = true;
    currentUserId.mockResolvedValue("u1");
    limit.mockResolvedValueOnce([]);
    expect((await resolveIdentity(req())).tier).toBe("free");
    vi.spyOn(console, "error").mockImplementation(() => {});
    limit.mockRejectedValueOnce(new Error("boom"));
    expect(await resolveIdentity(req())).toMatchObject({ tier: "free", disabled: false });
  });
});

describe("clientIp", () => {
  it("prefers x-forwarded-for, then x-real-ip, then local", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "3.3.3.3" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("local");
  });
});
