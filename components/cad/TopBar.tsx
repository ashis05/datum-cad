import Logo from "./Logo";

export type KernelStatus = "loading" | "ready" | "error";

const STATUS = {
  loading: { label: "Loading kernel…", dot: "bg-text-3 pulse-dot", text: "text-text-2" },
  ready: { label: "Kernel ready", dot: "bg-ok", text: "text-text-2" },
  error: { label: "Kernel error", dot: "bg-danger", text: "text-danger" },
} as const;

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

export default function TopBar({ status }: { status: KernelStatus }) {
  const s = STATUS[status];
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo className="size-6 shrink-0" />
        <span className="truncate text-[15px] font-semibold tracking-tight text-text">CAD Designer</span>
        <span className="mx-1 hidden h-4 w-px bg-line-strong md:block" />
        <span className="hidden text-xs text-text-3 md:block">Describe a part. Get a real solid.</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          role="status"
          className={`flex h-7 items-center gap-2 rounded-full border border-line bg-bg px-2.5 text-xs ${s.text}`}
        >
          <span className={`size-1.5 rounded-full ${s.dot}`} />
          <span>{s.label}</span>
        </div>
        <a
          href="https://github.com/ashis05/CAD_Designer"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View source on GitHub"
          className="flex size-10 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-panel-2 hover:text-text lg:size-8"
        >
          <GithubMark className="size-[18px]" />
        </a>
      </div>
    </header>
  );
}
