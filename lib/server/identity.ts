// Resolves who is calling an API route: a signed-in user (rate-limited by
// user id, tier from the DB) or an anonymous visitor (rate-limited by IP).

import { eq } from "drizzle-orm";
import { currentUserId } from "@/auth";
import type { UsageTier } from "@/lib/api";
import { getDb, hasDb, schema } from "./db";

export interface Identity {
  /** Rate-limit key: `user:<id>` or `ip:<addr>`. */
  key: string;
  tier: UsageTier;
  userId: string | null;
  disabled: boolean;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "local";
}

/** True when the user row is flagged disabled. A failed lookup reads as not disabled. */
export async function isDisabled(userId: string): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const [row] = await getDb()
      .select({ disabled: schema.users.disabled })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return row?.disabled ?? false;
  } catch (err) {
    console.error("[identity] disabled lookup failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function resolveIdentity(req: Request): Promise<Identity> {
  const userId = await currentUserId();
  if (!userId) return { key: `ip:${clientIp(req.headers)}`, tier: "anonymous", userId: null, disabled: false };

  let tier: UsageTier = "free";
  let disabled = false;
  if (hasDb()) {
    try {
      const [row] = await getDb()
        .select({ tier: schema.users.tier, disabled: schema.users.disabled })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (row) {
        tier = row.tier === "pro" ? "pro" : "free";
        disabled = row.disabled;
      }
    } catch (err) {
      console.error("[identity] user lookup failed, treating as free:", err instanceof Error ? err.message : err);
    }
  }
  return { key: `user:${userId}`, tier, userId, disabled };
}
