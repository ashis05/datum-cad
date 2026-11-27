import type { ApiErrorBody, Usage } from "@/lib/api";
import { resolveIdentity } from "@/lib/server/identity";
import { effectiveQuota, peekRateLimit, peekSharedBudget } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current quota for the caller. Reading it does not consume quota. */
export async function GET(req: Request) {
  const id = await resolveIdentity(req);
  if (id.disabled) {
    return Response.json(
      { error: "This account has been disabled.", code: "FORBIDDEN" } satisfies ApiErrorBody,
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const [{ minute, day }, shared] = await Promise.all([peekRateLimit(id.key, id.tier), peekSharedBudget()]);
  const body: Usage = {
    tier: id.tier,
    signedIn: id.userId !== null,
    minute,
    day,
    shared,
    quota: effectiveQuota(day, shared),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
