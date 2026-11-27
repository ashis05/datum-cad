import { History } from "lucide-react";
import Logo from "./Logo";
import AccountMenu from "./AccountMenu";
import { GithubMark } from "./SignInButtons";
import type { UsageTier } from "@/lib/api";

export type KernelStatus = "loading" | "ready" | "error";

const STATUS = {
  loading: { label: "Loading kernel…", dot: "bg-text-3 pulse-dot", text: "text-text-2" },
  ready: { label: "Kernel ready", dot: "bg-ok", text: "text-text-2" },
  error: { label: "Kernel error", dot: "bg-danger", text: "text-danger" },
} as const;

interface Props {
  status: KernelStatus;
  tier?: UsageTier | null;
  onOpenHistory?: () => void;
}

export default function TopBar({ status, tier = null, onOpenHistory }: Props) {
  const s = STATUS[status];
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo className="size-6 shrink-0" />
        <span className="truncate text-[15px] font-semibold tracking-tight text-text">Datum</span>
        <span className="mx-1 hidden h-4 w-px bg-line-strong md:block" />
        <span className="hidden text-xs text-text-3 md:block">Describe a part. Get a real solid.</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          role="status"
          aria-label={s.label}
          className={`flex h-7 items-center gap-2 rounded-full border border-line bg-bg px-2.5 text-xs ${s.text}`}
        >
          <span className={`size-1.5 rounded-full ${s.dot}`} />
          <span className="hidden sm:inline">{s.label}</span>
        </div>
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-text-2 transition-colors hover:bg-panel-2 hover:text-text lg:h-8"
          >
            <History className="size-3.5" aria-hidden /> <span className="hidden sm:inline">History</span>
            <span className="sm:hidden sr-only">History</span>
          </button>
        )}
        <a
          href="https://github.com/ashis05/datum-cad"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View source on GitHub"
          className="hidden size-10 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-panel-2 hover:text-text sm:flex lg:size-8"
        >
          <GithubMark className="size-[18px]" />
        </a>
        <AccountMenu tier={tier} />
      </div>
    </header>
  );
}
