"use client";

import { signIn } from "next-auth/react";

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.5ZM12 22c2.7 0 5-.9 6.6-2.4l-3.3-2.6c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.4-4H3.2v2.6A10 10 0 0 0 12 22ZM6.6 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.2a10 10 0 0 0 0 9.2L6.6 14ZM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.200 7.400L6.600 10c.7-2.300 2.900-4 5.400-4Z" />
    </svg>
  );
}

/** Continue-with buttons. `compact` renders a tighter row for inline use. */
export default function SignInButtons({ compact = false }: { compact?: boolean }) {
  const cls = `flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-bg text-[13px] text-text transition-colors hover:border-accent/50 hover:text-accent ${
    compact ? "h-10 flex-1 px-3 lg:h-8" : "h-10 w-full px-3"
  }`;
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
      <button type="button" className={cls} onClick={() => void signIn("google")}>
        <GoogleMark className="size-4" /> {compact ? "Google" : "Continue with Google"}
      </button>
      <button type="button" className={cls} onClick={() => void signIn("github")}>
        <GithubMark className="size-4" /> {compact ? "GitHub" : "Continue with GitHub"}
      </button>
    </div>
  );
}
