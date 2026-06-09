"use client";

// Phase D — end-to-end loop: prompt -> /api/generate -> eval buildModel -> mesh
// -> render. Boots the WASM kernel once, then each prompt fetches generated
// Replicad code from the backend, runs it locally, and displays the solid.

import { useEffect, useRef, useState } from "react";
import type { ThreeGeometry } from "replicad-threejs-helper";
import type { Shape3D } from "replicad";
import {
  initKernel,
  runGeneratedModel,
  meshShapeToGeometries,
  exportShape,
} from "@/lib/replicad/kernel";
import { generateCad, type CadParam } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import Viewport from "./Viewport";

interface HistoryItem {
  prompt: string;
  notes?: string;
  error?: string;
}

export default function CadStage() {
  const [kernelReady, setKernelReady] = useState(false);
  const [kernelError, setKernelError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Current model state (params/values feed the sliders in Phase G).
  const [code, setCode] = useState<string | null>(null);
  const [, setParams] = useState<CadParam[]>([]);
  const [, setValues] = useState<Record<string, number>>({});
  const [geometries, setGeometries] = useState<ThreeGeometry[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);

  // The current BREP solid — source of truth for export (kept in a ref since
  // export doesn't need to trigger a re-render).
  const shapeRef = useRef<Shape3D | null>(null);

  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    initKernel()
      .then(() => !cancelled && setKernelReady(true))
      .catch(
        (err) =>
          !cancelled &&
          setKernelError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, busy]);

  async function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed || busy || !kernelReady) return;

    setBusy(true);
    setPrompt("");
    const historyIndex = history.length;
    setHistory((h) => [...h, { prompt: trimmed }]);

    try {
      const result = await generateCad({
        prompt: trimmed,
        currentCode: code ?? undefined,
      });

      // Initialize parameter values from each param's default.
      const values = Object.fromEntries(
        result.params.map((p) => [p.name, p.default]),
      );

      // Run the generated code locally and mesh it for display.
      const shape = runGeneratedModel(result.code, values);
      const geos = meshShapeToGeometries(shape);

      shapeRef.current = shape;
      setExportError(null);
      setCode(result.code);
      setParams(result.params);
      setValues(values);
      setGeometries(geos);
      setHistory((h) =>
        h.map((item, i) =>
          i === historyIndex ? { ...item, notes: result.notes } : item,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHistory((h) =>
        h.map((item, i) =>
          i === historyIndex ? { ...item, error: message } : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleExport(format: "step" | "stl") {
    if (!shapeRef.current) return;
    try {
      const blob = exportShape(shapeRef.current, format);
      downloadBlob(blob, `model.${format}`);
      setExportError(null);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  }

  if (kernelError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0b0f17] p-8">
        <div className="max-w-lg rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-red-200">
          <p className="mb-1 font-semibold">Kernel error</p>
          <pre className="whitespace-pre-wrap break-words text-sm">{kernelError}</pre>
        </div>
      </div>
    );
  }

  if (!kernelReady) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0b0f17] text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
          <p className="text-sm">Loading CAD kernel (OpenCascade WASM)…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left pane — prompt & history */}
      <aside className="flex w-[360px] flex-col border-r border-zinc-800 bg-[#0d121c]">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {history.length === 0 && (
            <p className="text-sm leading-6 text-zinc-500">
              Describe a part in plain English — e.g.{" "}
              <span className="text-zinc-300">
                “a 40×20×10mm plate with a centered 5mm hole”
              </span>
              . The model is generated, built, and rendered live.
            </p>
          )}
          {history.map((item, i) => (
            <div key={i} className="space-y-1.5">
              <div className="rounded-lg bg-blue-600/90 px-3 py-2 text-sm text-white">
                {item.prompt}
              </div>
              {item.notes && (
                <div className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200">
                  {item.notes}
                </div>
              )}
              {item.error && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  <span className="font-medium">Error:</span> {item.error}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 px-1 text-sm text-zinc-400">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              Generating…
            </div>
          )}
          <div ref={historyEndRef} />
        </div>

        <div className="border-t border-zinc-800 p-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Describe a part…"
            rows={3}
            disabled={busy}
            className="w-full resize-none rounded-md border border-zinc-700 bg-[#0b0f17] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={handleSubmit}
            disabled={busy || !prompt.trim()}
            className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Generating…" : "Send"}
          </button>
        </div>
      </aside>

      {/* Main pane — 3D viewport */}
      <div className="relative min-h-0 flex-1">
        <Viewport geometries={geometries} />
        {geometries.length === 0 && !busy && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-zinc-600">Your model will appear here</p>
          </div>
        )}

        {/* Export controls */}
        {geometries.length > 0 && (
          <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("step")}
                className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-zinc-800"
              >
                Download STEP
              </button>
              <button
                onClick={() => handleExport("stl")}
                className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-zinc-800"
              >
                Download STL
              </button>
            </div>
            {exportError && (
              <div className="max-w-xs rounded-md border border-red-900/60 bg-red-950/70 px-3 py-1.5 text-xs text-red-200 backdrop-blur">
                Export failed: {exportError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
