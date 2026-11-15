// Validates and normalizes the model's JSON before it is sent to the browser,
// which executes `code`. Throws when the output is unusable.

import type { CadParam, CadResponse } from "../api";

const MAX_CODE = 50_000;
const MAX_NOTES = 500;
const MAX_PARAMS = 24;
const NAME_RE = /^[A-Za-z_$][\w$]*$/;

function num(v: unknown): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : NaN;
}

function sanitizeParam(p: unknown): CadParam | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.name !== "string" || !NAME_RE.test(o.name)) return null;

  let min = num(o.min);
  let max = num(o.max);
  const def = num(o.default);
  if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(def)) return null;
  if (min > max) [min, max] = [max, min];
  if (min === max) return null;

  let step = num(o.step);
  if (!(step > 0)) step = (max - min) / 100;

  return {
    name: o.name,
    label: typeof o.label === "string" && o.label.trim() ? o.label : o.name,
    default: Math.min(max, Math.max(min, def)),
    min,
    max,
    step,
  };
}

export function sanitizeCadResponse(raw: unknown): CadResponse {
  if (!raw || typeof raw !== "object") throw new Error("Model output is not an object.");
  const o = raw as Record<string, unknown>;

  if (typeof o.code !== "string" || !o.code.includes("buildModel")) {
    throw new Error("Model output is missing a valid buildModel function in `code`.");
  }
  if (o.code.length > MAX_CODE) throw new Error("Model output code is too long.");

  const seen = new Set<string>();
  const params: CadParam[] = [];
  if (Array.isArray(o.params)) {
    for (const item of o.params) {
      const p = sanitizeParam(item);
      if (!p || seen.has(p.name)) continue;
      seen.add(p.name);
      params.push(p);
      if (params.length >= MAX_PARAMS) break;
    }
  }

  const notes = typeof o.notes === "string" ? o.notes.slice(0, MAX_NOTES) : "";
  return { code: o.code, params, notes };
}
