import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ currentUserId: vi.fn() }));
import { isUuid, parseNewMessage, parseSnapshot, parseTitle, readJson } from "./history";


const snap = {
  code: "function buildModel(){}",
  params: [{ name: "w", label: "Width", default: 1, min: 0, max: 2, step: 0.1 }],
  values: { w: 1 },
  designPrompt: "a box",
};

describe("isUuid", () => {
  it("accepts uuids and rejects junk", () => {
    expect(isUuid("3f2b8c1e-5d4a-4b7e-9c1d-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("parseTitle", () => {
  it("trims and cuts to 120", () => {
    const r = parseTitle({ title: "  " + "a".repeat(200) + "  " });
    expect(r.ok && r.value.length).toBe(120);
  });
  it("rejects empty / non-string / non-object", () => {
    expect(parseTitle({ title: "   " }).ok).toBe(false);
    expect(parseTitle({ title: 5 }).ok).toBe(false);
    expect(parseTitle(null).ok).toBe(false);
    expect(parseTitle([]).ok).toBe(false);
  });
});

describe("parseNewMessage", () => {
  it("accepts a minimal message and strips unknown fields", () => {
    const r = parseNewMessage({ prompt: "hi", evil: 1 });
    expect(r).toEqual({ ok: true, value: { prompt: "hi" } });
  });
  it("accepts a full message and strips unknown snapshot fields", () => {
    const r = parseNewMessage({ prompt: "p", notes: "n", error: "e", corrected: true, snapshot: { ...snap, x: 1 } });
    expect(r).toEqual({ ok: true, value: { prompt: "p", notes: "n", error: "e", corrected: true, snapshot: snap } });
  });
  it.each([
    [{}],
    [{ prompt: "" }],
    [{ prompt: "x".repeat(2001) }],
    [{ prompt: "p", notes: "x".repeat(4001) }],
    [{ prompt: "p", error: 3 }],
    [{ prompt: "p", corrected: "yes" }],
    [{ prompt: "p", snapshot: "s" }],
    [{ prompt: "p", snapshot: { ...snap, code: "x".repeat(30001) } }],
    [{ prompt: "p", snapshot: { ...snap, params: Array(51).fill(snap.params[0]) } }],
    [{ prompt: "p", snapshot: { ...snap, params: [{ ...snap.params[0], min: Infinity }] } }],
    [{ prompt: "p", snapshot: { ...snap, params: [{ ...snap.params[0], label: 1 }] } }],
    [{ prompt: "p", snapshot: { ...snap, values: { w: "1" } } }],
    [{ prompt: "p", snapshot: { ...snap, designPrompt: "x".repeat(2001) } }],
    ["str"],
  ])("rejects %j", (body) => {
    expect(parseNewMessage(body).ok).toBe(false);
  });
  it("parseSnapshot rejects non-finite values", () => {
    expect(parseSnapshot({ ...snap, values: { w: NaN } }).ok).toBe(false);
  });
});

describe("readJson", () => {
  const req = (body: string, headers?: HeadersInit) => new Request("http://x/", { method: "POST", body, headers });
  it("parses valid JSON", async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
  });
  it("rejects invalid JSON", async () => {
    expect((await readJson(req("{nope"))).ok).toBe(false);
  });
  it("rejects bodies over 64KB", async () => {
    expect((await readJson(req(JSON.stringify({ a: "x".repeat(70_000) })))).ok).toBe(false);
  });
});
