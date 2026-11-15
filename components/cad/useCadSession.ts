"use client";

// Session state for the CAD app: kernel boot, prompt history with restorable
// snapshots, the current model, local parameter rebuilds, and export.

import { useEffect, useRef, useState } from "react";
import type { ThreeGeometry } from "replicad-threejs-helper";
import { initKernel, runAndMesh, exportShape } from "@/lib/replicad/kernelClient";
import { generateCad, type CadParam, type CadResponse } from "@/lib/api";
import { downloadBlob, slugify } from "@/lib/download";
import { generateAndBuildWithRetry } from "@/lib/selfCorrect";
import { describeError } from "@/lib/ui/errors";
import type { KernelStatus } from "./TopBar";

export interface Snapshot {
  code: string;
  params: CadParam[];
  values: Record<string, number>;
  designPrompt: string; // first prompt of this design — names the export files
}

export interface HistoryItem {
  id: number;
  prompt: string;
  notes?: string;
  error?: string;
  corrected?: boolean; // built only after one or more self-correction retries
  snapshot?: Snapshot;
}

export function useCadSession() {
  const [kernel, setKernel] = useState<{ status: KernelStatus; error: string | null }>({
    status: "loading",
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [code, setCode] = useState<string | null>(null);
  const [params, setParams] = useState<CadParam[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [geometries, setGeometries] = useState<ThreeGeometry[]>([]);
  const [designPrompt, setDesignPrompt] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);

  const [notice, setNotice] = useState<string | null>(null);
  const [paramError, setParamError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  const nextId = useRef(1);
  // Bumped whenever a different model becomes current, so a stale slider build
  // loop can't overwrite it.
  const modelGen = useRef(0);

  // Coalesces rapid slider rebuilds: while one build is in the worker, keep only
  // the latest pending values and build them when it returns (trailing).
  const paramBuildRef = useRef<{
    inFlight: boolean;
    pending: Record<string, number> | null;
  }>({ inFlight: false, pending: null });

  useEffect(() => {
    let cancelled = false;
    initKernel()
      .then(() => !cancelled && setKernel({ status: "ready", error: null }))
      .catch(
        (err) =>
          !cancelled &&
          setKernel({ status: "error", error: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // Replace geometries, disposing the old BufferGeometries first so rapid slider
  // dragging doesn't leak GPU memory.
  function swapGeometries(next: ThreeGeometry[]) {
    setGeometries((prev) => {
      prev.forEach((g) => {
        g.faces.dispose();
        g.lines.dispose();
      });
      return next;
    });
  }

  function adopt(snap: Snapshot, geos: ThreeGeometry[], id: number) {
    modelGen.current++;
    setNotice(null);
    setParamError(null);
    setCode(snap.code);
    setParams(snap.params);
    setValues(snap.values);
    setDesignPrompt(snap.designPrompt);
    setActiveId(id);
    swapGeometries(geos);
    setFitToken((n) => n + 1);
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || kernel.status !== "ready") return;

    setBusy(true);
    setRetryStatus(null);
    const id = nextId.current++;
    setHistory((h) => [...h, { id, prompt: trimmed }]);

    // Build closure: run the generated code in the worker and mesh it. Throwing
    // here (a kernel/build error) triggers a self-correction retry.
    const build = async (result: CadResponse) => {
      const initial = Object.fromEntries(result.params.map((p) => [p.name, p.default]));
      const geos = await runAndMesh(result.code, initial);
      return { values: initial, geos };
    };

    try {
      const { result, built, attempts } = await generateAndBuildWithRetry({
        prompt: trimmed,
        currentCode: code ?? undefined,
        maxAttempts: 3,
        generate: generateCad,
        build,
        onRetry: ({ attempt }) =>
          setRetryStatus(`Build failed (attempt ${attempt}) — asking the model to fix it…`),
      });

      const snap: Snapshot = {
        code: result.code,
        params: result.params,
        values: built.values,
        designPrompt: code ? (designPrompt ?? trimmed) : trimmed,
      };
      adopt(snap, built.geos, id);
      setHistory((h) =>
        h.map((item) =>
          item.id === id
            ? { ...item, notes: result.notes, corrected: attempts > 1, snapshot: snap }
            : item,
        ),
      );
    } catch (err) {
      const message = describeError(err);
      setHistory((h) => h.map((item) => (item.id === id ? { ...item, error: message } : item)));
    } finally {
      setBusy(false);
      setRetryStatus(null);
    }
  }

  async function restore(id: number) {
    const snap = history.find((h) => h.id === id)?.snapshot;
    if (!snap || busy) return;
    setBusy(true);
    setRetryStatus("Restoring version…");
    try {
      const geos = await runAndMesh(snap.code, snap.values);
      adopt(snap, geos, id);
    } catch (err) {
      setNotice(`Couldn't restore that version: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      setRetryStatus(null);
    }
  }

  async function exportAs(format: "step" | "stl") {
    if (geometries.length === 0) return;
    try {
      const blob = await exportShape(format);
      downloadBlob(blob, `${slugify(designPrompt ?? "")}.${format}`);
      setNotice(null);
    } catch (err) {
      setNotice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Slider drag — re-run the current buildModel in the worker with the new value.
  // NO backend call: dimensional tweaks are free. Rapid drags are coalesced so
  // only the latest value is built once the in-flight build returns.
  function rebuild(next: Record<string, number>) {
    setValues(next);
    if (!code) return;

    const ref = paramBuildRef.current;
    if (ref.inFlight) {
      ref.pending = next; // supersede; the running loop will pick this up
      return;
    }
    ref.inFlight = true;
    const gen = modelGen.current;
    void (async () => {
      let target: Record<string, number> | null = next;
      try {
        while (target) {
          const geos = await runAndMesh(code, target);
          if (gen !== modelGen.current) break; // a different model took over
          swapGeometries(geos);
          setParamError(null);
          target = ref.pending;
          ref.pending = null;
        }
      } catch (err) {
        setParamError(err instanceof Error ? err.message : String(err));
      } finally {
        ref.inFlight = false;
        ref.pending = null;
      }
    })();
  }

  function changeParam(name: string, value: number) {
    rebuild({ ...values, [name]: value });
  }

  function resetParams() {
    rebuild(Object.fromEntries(params.map((p) => [p.name, p.default])));
  }

  return {
    kernel,
    busy,
    history,
    retryStatus,
    params,
    values,
    geometries,
    activeId,
    fitToken,
    notice,
    paramError,
    hasModel: geometries.length > 0,
    dismissNotice: () => setNotice(null),
    submit,
    restore,
    exportAs,
    changeParam,
    resetParams,
  };
}
