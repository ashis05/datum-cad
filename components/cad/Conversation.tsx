"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Check, CircleAlert, History, Loader2 } from "lucide-react";
import ExamplePrompts from "./ExamplePrompts";
import type { HistoryItem } from "./useCadSession";

interface Props {
  history: HistoryItem[];
  busy: boolean;
  retryStatus: string | null;
  kernelReady: boolean;
  activeId: number | null;
  onSubmit: (prompt: string) => void;
  onRestore: (id: number) => void;
}

const MAX_TEXTAREA_PX = 8 * 20 + 16; // ~8 lines at 20px + padding

export default function Conversation({
  history,
  busy,
  retryStatus,
  kernelReady,
  activeId,
  onSubmit,
  onRestore,
}: Props) {
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [history, busy]);

  const canSend = kernelReady && !busy && draft.trim().length > 0;

  function send() {
    if (!canSend) return;
    onSubmit(draft.trim());
    setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="hidden h-10 shrink-0 items-center border-b border-line px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-3 lg:flex">
        Conversation
      </h2>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        {history.length === 0 && <ExamplePrompts disabled={!kernelReady || busy} onPick={onSubmit} />}

        {history.map((item) => (
          <div key={item.id} className="fade-up space-y-2">
            <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">Prompt</p>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-text">{item.prompt}</p>
            </div>

            {item.snapshot && (
              <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ok">
                    <Check className="size-3.5" aria-hidden /> Built
                  </span>
                  {item.corrected && (
                    <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
                      self-corrected
                    </span>
                  )}
                  <span className="ml-auto">
                    {item.id === activeId ? (
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                        Current
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRestore(item.id)}
                        aria-label={`Restore the version for: ${item.prompt}`}
                        className="flex h-10 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs text-text-2 transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 lg:h-8"
                      >
                        <History className="size-3.5" aria-hidden /> Restore
                      </button>
                    )}
                  </span>
                </div>
                <p className="break-words text-[13px] leading-5 text-text-2">{item.notes}</p>
              </div>
            )}

            {item.error && (
              <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <p className="break-words text-[13px] leading-5 text-text">{item.error}</p>
              </div>
            )}
          </div>
        ))}

        <div aria-live="polite" className="min-h-0">
          {busy && (
            <div className="flex items-start gap-2 px-1 text-[13px] leading-5 text-text-2">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-accent" aria-hidden />
              <span>{retryStatus ?? "Generating your part…"}</span>
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-line bg-panel p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-bg p-1.5 transition-colors focus-within:border-accent/60">
          <label htmlFor="prompt" className="sr-only">
            Describe a part
          </label>
          <textarea
            id="prompt"
            ref={taRef}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={history.length ? "Describe a change…" : "Describe a part…"}
            className="scroll-thin min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-5 text-text outline-none placeholder:text-text-3 lg:text-[13px]"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send prompt"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        <p className="mt-2 hidden px-1 text-[11px] text-text-3 sm:block">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}
