import { describe, expect, it } from "vitest";
import { sanitizeCadResponse } from "./sanitize";

const code = "function buildModel(replicad, params) { return null; }";
const p = (o: object) => ({ name: "w", label: "W", default: 5, min: 1, max: 10, step: 1, ...o });
const run = (params: unknown[]) => sanitizeCadResponse({ code, params, notes: "" }).params;

describe("sanitizeCadResponse", () => {
  it("rejects bad code", () => {
    expect(() => sanitizeCadResponse(null)).toThrow();
    expect(() => sanitizeCadResponse({ params: [] })).toThrow();
    expect(() => sanitizeCadResponse({ code: "return 1" })).toThrow();
    expect(() => sanitizeCadResponse({ code: code + " ".repeat(50_001) })).toThrow();
  });

  it("passes a valid response and defaults notes", () => {
    const out = sanitizeCadResponse({ code, params: [p({})] });
    expect(out.notes).toBe("");
    expect(out.params).toEqual([p({})]);
  });

  it("caps notes at 500 chars", () => {
    expect(sanitizeCadResponse({ code, params: [], notes: "a".repeat(900) }).notes).toHaveLength(500);
  });

  it("drops invalid names and dedupes", () => {
    const out = run([p({ name: "1bad" }), p({ name: "a b" }), p({ name: "ok" }), p({ name: "ok", default: 9 })]);
    expect(out.map((x) => x.name)).toEqual(["ok"]);
    expect(out[0].default).toBe(5);
  });

  it("coerces numbers and drops non-finite", () => {
    expect(run([p({ default: "7" })])[0].default).toBe(7);
    expect(run([p({ default: "abc" })])).toEqual([]);
    expect(run([p({ max: Infinity })])).toEqual([]);
    expect(run([p({ min: null })])).toEqual([]);
  });

  it("swaps reversed min/max and drops equal ones", () => {
    const [r] = run([p({ min: 10, max: 1 })]);
    expect([r.min, r.max]).toEqual([1, 10]);
    expect(run([p({ min: 3, max: 3 })])).toEqual([]);
  });

  it("fixes step, clamps default, falls back label", () => {
    expect(run([p({ step: 0 })])[0].step).toBeCloseTo(0.09);
    expect(run([p({ step: -2 })])[0].step).toBeCloseTo(0.09);
    expect(run([p({ default: 99 })])[0].default).toBe(10);
    expect(run([p({ default: -5 })])[0].default).toBe(1);
    expect(run([p({ label: "" })])[0].label).toBe("w");
  });

  it("caps at 24 params", () => {
    const many = Array.from({ length: 40 }, (_, i) => p({ name: `p${i}` }));
    expect(run(many)).toHaveLength(24);
  });
});
