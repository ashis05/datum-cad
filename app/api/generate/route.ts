import type { ApiErrorBody } from "@/lib/api";
import { generateCad } from "@/lib/server/gemini";
import { clientIp, rateLimiter } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_PROMPT = 2000;
const MAX_CODE = 30_000;
const MAX_ERROR = 4000;

function fail(status: number, body: ApiErrorBody, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

const bad = (error: string) => fail(400, { error, code: "BAD_REQUEST" });

/** Best-effort: pull a retry delay in seconds out of a Gemini error message. */
function retryDelay(msg: string): number | undefined {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(msg) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(msg);
  return m ? Math.ceil(Number(m[1])) : undefined;
}

function isQuota(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const msg = typeof e?.message === "string" ? e.message : "";
  return e?.status === 429 || e?.code === 429 || /RESOURCE_EXHAUSTED|\b429\b/.test(msg);
}

export async function POST(req: Request) {
  const limit = rateLimiter.check(clientIp(req.headers));
  if (!limit.ok) {
    return fail(
      429,
      { error: "Too many requests. Please wait a bit and try again.", code: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { "Retry-After": String(limit.retryAfter) },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object") return bad("Request body must be a JSON object.");
  const { prompt, currentCode, previousError } = body as Record<string, unknown>;

  if (typeof prompt !== "string" || !prompt.trim()) return bad("`prompt` is required.");
  if (prompt.trim().length > MAX_PROMPT) return bad(`\`prompt\` must be at most ${MAX_PROMPT} characters.`);
  if (currentCode !== undefined && (typeof currentCode !== "string" || currentCode.length > MAX_CODE)) {
    return bad(`\`currentCode\` must be a string of at most ${MAX_CODE} characters.`);
  }
  if (previousError !== undefined && (typeof previousError !== "string" || previousError.length > MAX_ERROR)) {
    return bad(`\`previousError\` must be a string of at most ${MAX_ERROR} characters.`);
  }

  if (!process.env.GEMINI_API_KEY) {
    return fail(503, { error: "The server has no GEMINI_API_KEY configured.", code: "NO_KEY" });
  }

  try {
    const result = await generateCad({
      prompt: prompt.trim(),
      currentCode: currentCode as string | undefined,
      previousError: previousError as string | undefined,
    });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/generate] Gemini call failed:", msg.slice(0, 1000));
    if (isQuota(err)) {
      return fail(429, {
        error: "The AI model's quota is used up for now. Try again later.",
        code: "QUOTA",
        retryAfter: retryDelay(msg),
      });
    }
    return fail(502, { error: "The AI model couldn't produce a usable result. Please try again.", code: "UPSTREAM" });
  }
}
