"use client";

// Daily quota for the meter + tier for the account menu. Reading usage does not
// consume quota. Any failure just hides the meter.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getUsage, onGenerateUsage, type UsageTier, type UsageWindow } from "@/lib/api";

export function useUsage() {
  const { data, status } = useSession();
  const userId = data?.user?.id ?? null;
  const [day, setDay] = useState<UsageWindow | null>(null);
  const [tier, setTier] = useState<UsageTier | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    getUsage()
      .then((u) => {
        if (cancelled) return;
        setDay(u.day);
        setTier(u.tier);
      })
      .catch(() => {
        if (cancelled) return;
        setDay(null);
        setTier(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  useEffect(() => {
    onGenerateUsage(setDay);
    return () => onGenerateUsage(null);
  }, []);

  return { day, tier };
}
