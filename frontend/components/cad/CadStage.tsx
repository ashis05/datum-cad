"use client";

// Phase B stage: boots the WASM kernel, builds the HARDCODED demo solid,
// meshes it, and hands the geometries to the viewport. No LLM, no backend —
// this proves the riskiest integration (Replicad/OCCT WASM inside Next) works.

import { useEffect, useState } from "react";
import type { ThreeGeometry } from "replicad-threejs-helper";
import { initKernel, buildBoxWithHole, meshShapeToGeometries } from "@/lib/replicad/kernel";
import Viewport from "./Viewport";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; geometries: ThreeGeometry[] };

export default function CadStage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initKernel();
        const shape = buildBoxWithHole();
        const geometries = meshShapeToGeometries(shape);
        if (!cancelled) setState({ status: "ready", geometries });
      } catch (err) {
        if (!cancelled)
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0b0f17] text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
          <p className="text-sm">Loading CAD kernel (OpenCascade WASM)…</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0b0f17] p-8">
        <div className="max-w-lg rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-red-200">
          <p className="mb-1 font-semibold">Kernel error</p>
          <pre className="whitespace-pre-wrap break-words text-sm">{state.message}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <Viewport geometries={state.geometries} />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-black/40 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
        Phase B · hardcoded 40×20×10mm plate, centered 5mm hole
      </div>
    </div>
  );
}
