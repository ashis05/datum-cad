"use client";

// Layout + wiring. State lives in useCadSession; this file arranges the panels:
// desktop = conversation | viewport | parameters, mobile = viewport on top with
// a Conversation / Parameters segmented control below it.

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import Viewport, { type ViewCommand } from "./Viewport";
import TopBar from "./TopBar";
import Conversation from "./Conversation";
import ParamPanel from "./ParamPanel";
import { ExportButtons, ViewTools, type ViewName } from "./ViewportToolbar";
import { useCadSession } from "./useCadSession";
import { boundingSize } from "@/lib/ui/bbox";

type Tab = "conversation" | "params";

export default function CadStage() {
  const s = useCadSession();
  const [tab, setTab] = useState<Tab>("conversation");
  const [edges, setEdges] = useState(true);
  const [command, setCommand] = useState<ViewCommand | null>(null);

  const size = useMemo(() => boundingSize(s.geometries), [s.geometries]);

  const sendView = (view: ViewName) => setCommand((c) => ({ view, n: (c?.n ?? 0) + 1 }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar status={s.kernel.status} />

      {s.kernel.status === "error" && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-[13px] text-text" role="alert">
          <span className="font-medium text-danger">The CAD kernel failed to load.</span>{" "}
          {s.kernel.error} Reload the page to try again.
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Viewport */}
        <section
          aria-label="3D viewport"
          className="relative h-[55dvh] shrink-0 overflow-hidden border-b border-line lg:order-2 lg:h-auto lg:min-w-0 lg:flex-1 lg:border-b-0"
        >
          <Viewport geometries={s.geometries} edges={edges} command={command} fitToken={s.fitToken} />

          {s.busy && (
            <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden" aria-hidden />
          )}

          {!s.hasModel && !s.busy && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-text-3">Your part will appear here</p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto">
              <ViewTools edges={edges} onView={sendView} onToggleEdges={() => setEdges((v) => !v)} />
            </div>
            {s.hasModel && (
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                <ExportButtons onExport={s.exportAs} />
                {s.notice && (
                  <div
                    role="alert"
                    className="flex max-w-xs items-start gap-2 rounded-lg border border-danger/30 bg-panel px-3 py-2 text-xs leading-5 text-text"
                  >
                    <span className="min-w-0 break-words">{s.notice}</span>
                    <button
                      type="button"
                      onClick={s.dismissNotice}
                      aria-label="Dismiss"
                      className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-text-3 hover:text-text"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {size && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 font-mono text-xs text-text-2 backdrop-blur">
              {size.map((n) => n.toFixed(1)).join(" × ")} <span className="text-text-3">mm</span>
            </div>
          )}
        </section>

        {/* Side panels. `contents` on desktop lets them sit in the row. */}
        <div className="flex min-h-0 flex-1 flex-col lg:contents">
          <div role="tablist" aria-label="Panels" className="flex shrink-0 gap-1 border-b border-line bg-panel p-1.5 lg:hidden">
            {(
              [
                ["conversation", "Conversation"],
                ["params", "Parameters"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`h-10 flex-1 rounded-lg text-[13px] font-medium transition-colors ${
                  tab === id ? "bg-panel-2 text-text" : "text-text-3 hover:text-text-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <aside
            aria-label="Conversation"
            className={`min-h-0 flex-1 flex-col bg-panel lg:order-1 lg:flex lg:w-[360px] lg:flex-none lg:border-r lg:border-line ${
              tab === "conversation" ? "flex" : "hidden"
            }`}
          >
            <Conversation
              history={s.history}
              busy={s.busy}
              retryStatus={s.retryStatus}
              kernelReady={s.kernel.status === "ready"}
              activeId={s.activeId}
              onSubmit={s.submit}
              onRestore={s.restore}
            />
          </aside>

          <aside
            aria-label="Parameters"
            className={`min-h-0 flex-1 flex-col bg-panel lg:order-3 lg:w-[300px] lg:flex-none lg:border-l lg:border-line ${
              tab === "params" ? "flex" : "hidden"
            } ${s.params.length > 0 ? "lg:flex" : "lg:hidden"}`}
          >
            <ParamPanel
              params={s.params}
              values={s.values}
              error={s.paramError}
              onChange={s.changeParam}
              onReset={s.resetParams}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
