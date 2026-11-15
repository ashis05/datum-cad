// Main-thread client for the kernel Web Worker (Phase H).
//
// Lazily spawns the worker on first use, wraps it with comlink, and exposes the
// same surface the UI used before — but now async and off the main thread. The
// worker is bundled via `new URL(..., import.meta.url)`, the bundler-friendly
// pattern Next/Turbopack supports.
//
// Builds are time-limited: a runaway model (infinite loop) can't be interrupted
// inside the worker, so on timeout the worker is terminated and respawned.

import * as Comlink from "comlink";
import type { KernelWorkerApi } from "./kernel.worker";
import { buildGeometries, type ThreeGeometry } from "./mesh";

const BUILD_TIMEOUT_MS = 20000;

let worker: Worker | null = null;
let api: Comlink.Remote<KernelWorkerApi> | null = null;
let ready: Promise<Comlink.Remote<KernelWorkerApi>> | null = null;

function spawn(): Promise<Comlink.Remote<KernelWorkerApi>> {
  if (!ready) {
    worker = new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" });
    api = Comlink.wrap<KernelWorkerApi>(worker);
    const current = api;
    ready = current.init().then(
      () => current,
      (err) => {
        // Failed boot: drop it so the next call retries with a fresh worker.
        if (api === current) reset();
        throw err;
      },
    );
  }
  return ready;
}

function reset(): void {
  worker?.terminate();
  worker = null;
  api = null;
  ready = null;
}

/** Boot the worker + WASM kernel. Idempotent. */
export async function initKernel(): Promise<void> {
  await spawn();
}

/** Run generated code in the worker and build three.js geometry on the main thread. */
export async function runAndMesh(
  code: string,
  values: Record<string, number>,
): Promise<ThreeGeometry[]> {
  const remote = await spawn();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reset();
      reject(
        new Error(
          "The model took more than 20 s to build, so it was stopped. It may contain an infinite loop.",
        ),
      );
    }, BUILD_TIMEOUT_MS);
  });
  try {
    const raw = await Promise.race([remote.build(code, values), timeout]);
    return buildGeometries(raw);
  } finally {
    clearTimeout(timer);
  }
}

/** Export the worker's current solid as a downloadable Blob. */
export async function exportShape(format: "step" | "stl"): Promise<Blob> {
  const remote = await spawn();
  return remote.exportBlob(format);
}
