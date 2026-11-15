"use client";

import { Download, Maximize, Square } from "lucide-react";

export type ViewName = "iso" | "top" | "front" | "right" | "fit";

const VIEWS: { id: Exclude<ViewName, "fit">; label: string }[] = [
  { id: "iso", label: "Iso" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
];

const chip =
  "flex h-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs text-text-2 transition-colors hover:bg-panel-2 hover:text-text lg:h-8";

export function ViewTools({
  edges,
  onView,
  onToggleEdges,
}: {
  edges: boolean;
  onView: (v: ViewName) => void;
  onToggleEdges: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Viewport controls"
      className="flex items-center gap-0.5 rounded-xl border border-line bg-panel/90 p-0.5 backdrop-blur"
    >
      {VIEWS.map((v) => (
        <button key={v.id} type="button" onClick={() => onView(v.id)} className={chip} aria-label={`${v.label} view`}>
          {v.label}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-line-strong" />
      <button type="button" onClick={() => onView("fit")} className={chip} aria-label="Fit model to view">
        <Maximize className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Fit</span>
      </button>
      <button
        type="button"
        onClick={onToggleEdges}
        aria-pressed={edges}
        aria-label="Toggle edges"
        className={`${chip} ${edges ? "text-accent" : ""}`}
      >
        <Square className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Edges</span>
      </button>
    </div>
  );
}

export function ExportButtons({ onExport }: { onExport: (f: "step" | "stl") => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-panel/90 p-0.5 backdrop-blur">
      {(["step", "stl"] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onExport(f)}
          aria-label={`Download ${f.toUpperCase()}`}
          className={`${chip} font-mono uppercase`}
        >
          <Download className="size-3.5" aria-hidden />
          {f}
        </button>
      ))}
    </div>
  );
}
