"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import SignInButtons from "./SignInButtons";
import type { UsageTier } from "@/lib/api";

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function AccountMenu({ tier }: { tier: UsageTier | null }) {
  const { data, status } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (status === "loading") return <div className="size-8 rounded-full bg-panel-2" aria-hidden />;

  const user = data?.user;
  const signedIn = status === "authenticated" && !!user;

  return (
    <div ref={rootRef} className="relative">
      {signedIn ? (
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-full lg:size-8"
        >
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-panel-2 text-[11px] font-medium text-text-2 lg:size-7">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
            ) : (
              initials(user.name, user.email)
            )}
          </span>
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] text-text-2 transition-colors hover:border-accent/50 hover:text-accent lg:h-8"
        >
          <LogIn className="size-3.5" aria-hidden /> Sign in
        </button>
      )}

      {open && (
        <div
          role={signedIn ? "menu" : "dialog"}
          aria-label={signedIn ? "Account" : "Sign in"}
          className="fade-up absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line-strong bg-panel p-3 shadow-xl"
        >
          {signedIn ? (
            <>
              <div className="min-w-0 border-b border-line pb-2.5">
                {user.name && <p className="truncate text-[13px] font-medium text-text">{user.name}</p>}
                {user.email && <p className="truncate text-xs text-text-3">{user.email}</p>}
                {tier && (
                  <span className="mt-2 inline-block rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                    {tier}
                  </span>
                )}
              </div>
              <button
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => void signOut()}
                className="mt-2 flex h-10 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-text-2 transition-colors hover:bg-panel-2 hover:text-text lg:h-8"
              >
                <LogOut className="size-3.5" aria-hidden /> Sign out
              </button>
            </>
          ) : (
            <>
              <p className="mb-2.5 text-xs leading-5 text-text-2">
                Sign in for a higher daily limit and to keep your chat history.
              </p>
              <SignInButtons />
            </>
          )}
        </div>
      )}
    </div>
  );
}
