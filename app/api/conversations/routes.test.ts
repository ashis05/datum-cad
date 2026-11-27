import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ currentUserId: vi.fn() }));
vi.mock("@/lib/server/history", async (orig) => {
  const actual = await orig<typeof import("@/lib/server/history")>();
  return {
    ...actual,
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    appendMessage: vi.fn(),
  };
});

import { currentUserId } from "@/auth";
import * as h from "@/lib/server/history";
import * as list from "./route";
import * as one from "./[id]/route";
import * as msgs from "./[id]/messages/route";

const ID = "3f2b8c1e-5d4a-4b7e-9c1d-0a1b2c3d4e5f";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown, method = "POST") =>
  new Request("http://localhost/api/conversations", {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const summary = { id: ID, title: "t", updatedAt: "2026-01-01T00:00:00.000Z" };
const saved = { id: "m1", prompt: "p", notes: null, error: null, corrected: false, snapshot: null, createdAt: summary.updatedAt };

const mockUser = vi.mocked(currentUserId);
const savedUrl = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  mockUser.mockResolvedValue("u1");
  for (const fn of [h.listConversations, h.createConversation, h.getConversation, h.renameConversation, h.deleteConversation, h.appendMessage]) {
    vi.mocked(fn).mockReset();
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
});

const calls: [string, () => Promise<Response>][] = [
  ["GET list", () => list.GET()],
  ["POST create", () => list.POST(req({ title: "x" }))],
  ["GET one", () => one.GET(req(undefined, "GET"), ctx())],
  ["PATCH one", () => one.PATCH(req({ title: "x" }, "PATCH"), ctx())],
  ["DELETE one", () => one.DELETE(req(undefined, "DELETE"), ctx())],
  ["POST message", () => msgs.POST(req({ prompt: "p" }), ctx())],
];

describe.each(calls)("%s gating", (_n, call) => {
  it("401 when signed out", async () => {
    mockUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });
  it("503 UPSTREAM without a database", async () => {
    delete process.env.DATABASE_URL;
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Chat history isn't configured on this server.", code: "UPSTREAM" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("collection", () => {
  it("lists for the user", async () => {
    vi.mocked(h.listConversations).mockResolvedValue([summary]);
    const res = await list.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([summary]);
    expect(h.listConversations).toHaveBeenCalledWith("u1");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("502 on DB error without leaking internals", async () => {
    vi.mocked(h.listConversations).mockRejectedValue(new Error("secret connection string"));
    const res = await list.GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("UPSTREAM");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("creates with trimmed title", async () => {
    vi.mocked(h.createConversation).mockResolvedValue(summary);
    const res = await list.POST(req({ title: "  hello  ", extra: 1 }));
    expect(res.status).toBe(201);
    expect(h.createConversation).toHaveBeenCalledWith("u1", "hello");
  });
  it("400 on bad title / bad JSON / oversized body", async () => {
    expect((await list.POST(req({ title: " " }))).status).toBe(400);
    expect((await list.POST(req("{bad"))).status).toBe(400);
    expect((await list.POST(req({ title: "x".repeat(70_000) }))).status).toBe(400);
    expect(h.createConversation).not.toHaveBeenCalled();
  });
  it("400 at the conversation limit", async () => {
    vi.mocked(h.createConversation).mockResolvedValue("LIMIT");
    const res = await list.POST(req({ title: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_REQUEST");
  });
});

describe("item", () => {
  it("GET returns detail", async () => {
    vi.mocked(h.getConversation).mockResolvedValue({ ...summary, messages: [saved] });
    const res = await one.GET(req(undefined, "GET"), ctx());
    expect(res.status).toBe(200);
    expect(h.getConversation).toHaveBeenCalledWith("u1", ID);
  });
  it("404 for someone else's / missing conversation", async () => {
    vi.mocked(h.getConversation).mockResolvedValue(null);
    vi.mocked(h.renameConversation).mockResolvedValue(null);
    vi.mocked(h.deleteConversation).mockResolvedValue(false);
    for (const res of [
      await one.GET(req(undefined, "GET"), ctx()),
      await one.PATCH(req({ title: "x" }, "PATCH"), ctx()),
      await one.DELETE(req(undefined, "DELETE"), ctx()),
    ]) {
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("NOT_FOUND");
    }
  });
  it("404 for non-UUID ids without querying", async () => {
    const res = await one.GET(req(undefined, "GET"), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(h.getConversation).not.toHaveBeenCalled();
  });
  it("PATCH renames; 400 on empty title", async () => {
    vi.mocked(h.renameConversation).mockResolvedValue({ ...summary, title: "new" });
    const ok = await one.PATCH(req({ title: " new " }, "PATCH"), ctx());
    expect(ok.status).toBe(200);
    expect(h.renameConversation).toHaveBeenCalledWith("u1", ID, "new");
    expect((await one.PATCH(req({ title: "" }, "PATCH"), ctx())).status).toBe(400);
  });
  it("DELETE returns 204", async () => {
    vi.mocked(h.deleteConversation).mockResolvedValue(true);
    const res = await one.DELETE(req(undefined, "DELETE"), ctx());
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});

describe("messages", () => {
  it("appends a valid message", async () => {
    vi.mocked(h.appendMessage).mockResolvedValue(saved);
    const res = await msgs.POST(req({ prompt: "p", junk: true }), ctx());
    expect(res.status).toBe(201);
    expect(h.appendMessage).toHaveBeenCalledWith("u1", ID, { prompt: "p" });
    expect(await res.json()).toEqual(saved);
  });
  it("400 on invalid message", async () => {
    expect((await msgs.POST(req({ prompt: "" }), ctx())).status).toBe(400);
    expect((await msgs.POST(req({ prompt: "p", snapshot: { code: 1 } }), ctx())).status).toBe(400);
    expect(h.appendMessage).not.toHaveBeenCalled();
  });
  it("404 for unknown conversation and bad id", async () => {
    vi.mocked(h.appendMessage).mockResolvedValue(null);
    expect((await msgs.POST(req({ prompt: "p" }), ctx())).status).toBe(404);
    expect((await msgs.POST(req({ prompt: "p" }), ctx("zzz"))).status).toBe(404);
  });
  it("400 when the conversation is full", async () => {
    vi.mocked(h.appendMessage).mockResolvedValue("FULL");
    const res = await msgs.POST(req({ prompt: "p" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_REQUEST");
  });
  it("502 on DB error", async () => {
    vi.mocked(h.appendMessage).mockRejectedValue(new Error("boom"));
    const res = await msgs.POST(req({ prompt: "p" }), ctx());
    expect(res.status).toBe(502);
  });
});
