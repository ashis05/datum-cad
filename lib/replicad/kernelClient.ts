// Main-thread client for the kernel Web Worker (Phase H).
//
// Lazily spawns the worker on first use, wraps it with comlink, and exposes the
// same surface the UI used before — but now async and off the main thread. The
// worker is bundled via `new URL(..., import.meta.url)`, the bundler-friendly
// pattern Next/Turbopack supports.

import * as Comlink from "comlink";
import type { KernelWorkerApi } from "./kernel.worker";
import { buildGeometries, type ThreeGeometry } from "./mesh";

let api: Comlink.Remote<KernelWorkerApi> | null = null;

function getApi(): Comlink.Remote<KernelWorkerApi> {
  if (!api) {
    const worker = new Worker(new URL("./kernel.worker.ts", import.meta.url), {
      type: "module",
    });
    api = Comlink.wrap<KernelWorkerApi>(worker);
  }
  return api;
}

/** Boot the worker + WASM kernel. Idempotent (the worker dedupes init). */
export async function initKernel(): Promise<void> {
  await getApi().init();
}

/** Run generated code in the worker and build three.js geometry on the main thread. */
export async function runAndMesh(
  code: string,
  values: Record<string, number>,
): Promise<ThreeGeometry[]> {
  const raw = await getApi().build(code, values);
  return buildGeometries(raw);
}

/** Export the worker's current solid as a downloadable Blob. */
export async function exportShape(format: "step" | "stl"): Promise<Blob> {
  return getApi().exportBlob(format);
}
