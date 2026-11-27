import type { ApiErrorBody, Quota } from "@/lib/api";
import { generateCad } from "@/lib/server/gemini";
import { resolveIdentity } from "@/lib/server/identity";
import {
  checkRateLimit,
  checkSharedBudget,
  effectiveQuota,
  markSharedExhausted,
  peekSharedBudget,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_PROMPT = 2000;
const MAX_CODE = 30_000;
const MAX_ERROR = 4000;

function fail(status: number, body: ApiErrorBody, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

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

function rateHeaders(q: Quota): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(q.limit),
    "X-RateLimit-Remaining": String(q.remaining),
    "X-RateLimit-Reset": String(Math.ceil(q.resetAt / 1000)),
    "X-RateLimit-Scope": q.scope,
  };
}

const SHARED_SPENT = "Today's AI capacity is used up for everyone. It resets at midnight Pacific time.";

export async function POST(req: Request) {
  const identity = await resolveIdentity(req);
  if (identity.disabled) return fail(403, { error: "This account has been disabled.", code: "FORBIDDEN" });

  // The caller's own limit is checked (and counted) first. The shared Gemini
  // budget is only peeked here and charged right before the model call, so
  // blocked or invalid requests never spend everyone's quota.
  const [limit, sharedNow] = await Promise.all([checkRateLimit(identity.key, identity.tier), peekSharedBudget()]);
  let rl = rateHeaders(effectiveQuota(limit.day, sharedNow));
  const failRl = (status: number, body: ApiErrorBody, headers?: Record<string, string>) =>
    fail(status, body, { ...rl, ...headers });
  const bad = (error: string) => failRl(400, { error, code: "BAD_REQUEST" });

  if (!limit.ok) {
    const headers = { "Retry-After": String(limit.retryAfter) };
    if (identity.tier === "anonymous" && limit.dayExceeded) {
      return failRl(
        429,
        {
          error: "You've used today's free generations. Sign in for a higher daily limit.",
          code: "AUTH_REQUIRED",
          retryAfter: limit.retryAfter,
        },
        headers,
      );
    }
    return failRl(
      429,
      { error: "Too many requests. Please wait a bit and try again.", code: "RATE_LIMITED", retryAfter: limit.retryAfter },
      headers,
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
    return failRl(503, { error: "The server has no GEMINI_API_KEY configured.", code: "NO_KEY" });
  }

  const shared = await checkSharedBudget();
  rl = rateHeaders(effectiveQuota(limit.day, shared.window));
  if (!shared.ok) {
    return failRl(
      429,
      { error: SHARED_SPENT, code: "QUOTA", retryAfter: shared.retryAfter },
      { "Retry-After": String(shared.retryAfter) },
    );
  }

  try {
    const result = await generateCad({
      prompt: prompt.trim(),
      currentCode: currentCode as string | undefined,
      previousError: previousError as string | undefined,
    });
    return Response.json(result, { headers: rl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/generate] Gemini call failed:", msg.slice(0, 1000));
    if (isQuota(err)) {
      // Google's per-minute limits also answer 429 with a short retryDelay;
      // only a long (or missing) delay means the daily quota is gone.
      const delay = retryDelay(msg);
      if (delay === undefined || delay > 120) {
        rl = rateHeaders(effectiveQuota(limit.day, await markSharedExhausted()));
        return failRl(429, { error: SHARED_SPENT, code: "QUOTA", retryAfter: delay });
      }
      return failRl(429, {
        error: "The AI model is busy right now. Try again in a moment.",
        code: "QUOTA",
        retryAfter: delay,
      });
    }
    return failRl(502, { error: "The AI model couldn't produce a usable result. Please try again.", code: "UPSTREAM" });
  }
}
