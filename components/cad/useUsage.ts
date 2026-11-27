"use client";

// Tries left for the meter (the smaller of the caller's own allowance and the
// shared Gemini budget) + tier for the account menu. Reading usage does not
// consume quota. Any failure just hides the meter.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getUsage, onGenerateUsage, type Quota, type UsageTier } from "@/lib/api";

export function useUsage() {
  const { data, status } = useSession();
  const userId = data?.user?.id ?? null;
  const [quota, setQuota] = useState<Quota | null>(null);
  const [tier, setTier] = useState<UsageTier | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    getUsage()
      .then((u) => {
        if (cancelled) return;
        setQuota(u.quota);
        setTier(u.tier);
      })
      .catch(() => {
        if (cancelled) return;
        setQuota(null);
        setTier(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  useEffect(() => {
    onGenerateUsage(setQuota);
    return () => onGenerateUsage(null);
  }, []);

  return { quota, tier };
}
