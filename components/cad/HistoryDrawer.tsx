"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { deleteConversation, listConversations, type ConversationSummary } from "@/lib/api";
import { describeError } from "@/lib/ui/errors";
import SignInButtons from "./SignInButtons";

interface Props {
  open: boolean;
  signedIn: boolean;
  activeId: string | null;
  busy: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => Promise<void> | void;
  onDeleted: (id: string) => void;
}

function relativeTime(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function HistoryDrawer(props: Props) {
  // Mount only while open so list/confirm/error state starts fresh each time.
  return props.open ? <DrawerBody {...props} /> : null;
}

function DrawerBody({ signedIn, activeId, busy, onClose, onNew, onSelect, onDeleted }: Props) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (signedIn) {
      listConversations()
        .then(setItems)
        .catch((e) => {
          setItems([]);
          setError(describeError(e));
        });
    }
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [signedIn, onClose]);

  async function select(id: string) {
    setPending(id);
    setError(null);
    try {
      await onSelect(id);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    setPending(id);
    try {
      await deleteConversation(id);
      setItems((l) => l?.filter((c) => c.id !== id) ?? null);
      onDeleted(id);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setPending(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Chat history"
        className="absolute inset-y-0 left-0 flex w-full flex-col bg-panel lg:w-[360px] lg:border-r lg:border-line-strong"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">History</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="flex size-10 items-center justify-center rounded-lg text-text-3 hover:bg-panel-2 hover:text-text lg:size-8"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {!signedIn ? (
          <div className="space-y-3 p-4">
            <p className="text-[13px] leading-5 text-text-2">
              Sign in to save your designs and pick up where you left off.
            </p>
            <SignInButtons />
          </div>
        ) : (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
            <button
              type="button"
              disabled={busy}
              onClick={onNew}
              className="mb-3 flex h-10 w-full items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] text-text transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 lg:h-8"
            >
              <Plus className="size-3.5" aria-hidden /> New design
            </button>

            {error && (
              <p role="alert" className="mb-2 px-1 text-xs text-danger">
                {error}
              </p>
            )}
            {items === null && (
              <p className="flex items-center gap-2 px-1 text-xs text-text-3">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading…
              </p>
            )}
            {items?.length === 0 && !error && <p className="px-1 text-xs text-text-3">No saved designs yet.</p>}

            <ul className="space-y-1">
              {items?.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-1 rounded-lg border ${
                    c.id === activeId ? "border-accent/40 bg-accent/10" : "border-transparent hover:bg-panel-2"
                  }`}
                >
                  {confirmId === c.id ? (
                    <div className="flex min-h-10 flex-1 items-center gap-2 px-3 text-xs text-text-2">
                      <span className="min-w-0 flex-1 truncate">Delete this design?</span>
                      <button
                        type="button"
                        disabled={pending === c.id}
                        onClick={() => void remove(c.id)}
                        aria-label="Confirm delete"
                        className="flex h-8 items-center gap-1 rounded-md border border-danger/40 px-2 text-danger hover:bg-danger/10"
                      >
                        <Check className="size-3.5" aria-hidden /> Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="flex h-8 items-center rounded-md px-2 text-text-3 hover:text-text"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy || pending !== null}
                        onClick={() => void select(c.id)}
                        className="min-w-0 flex-1 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="block truncate text-[13px] text-text">{c.title}</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-text-3">
                          {pending === c.id && <Loader2 className="size-3 animate-spin" aria-hidden />}
                          {relativeTime(c.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(c.id)}
                        aria-label={`Delete ${c.title}`}
                        className="mr-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-text-3 hover:text-danger lg:size-8"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
