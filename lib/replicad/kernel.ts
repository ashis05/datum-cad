// Replicad kernel core (Phase H: runs inside the Web Worker).
//
// Loads opencascade.js (OCCT as WebAssembly) and injects it into replicad via
// setOC, then runs/meshes/exports shapes. This module is intentionally free of
// three.js / DOM so it can run in a worker; turning the raw mesh into three.js
// BufferGeometry happens on the main thread (see ./mesh.ts).
//
// API surface verified against the installed packages (replicad 0.23.x):
//   - loader:  replicad-opencascadejs/src/replicad_single.js  (+ .wasm)
//   - setOC:   (oc: OpenCascadeInstance) => void
//   - meshing: shape.mesh({ tolerance, angularTolerance }) / shape.meshEdges({ ... })

import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import type { OpenCascadeInstance } from "replicad-opencascadejs/src/replicad_single.js";
import * as replicad from "replicad";
import { setOC } from "replicad";
import type { Shape3D } from "replicad";

// Raw, structured-cloneable mesh data (plain arrays) — safe to pass from the
// worker to the main thread, which converts it to three.js geometry.
export interface RawMesh {
  faces: ReturnType<Shape3D["mesh"]>;
  edges: ReturnType<Shape3D["meshEdges"]>;
}

// The published .d.ts types the factory as init() with no args, but the real
// emscripten module accepts { locateFile }. Cast to the real signature.
type OCFactory = (opts: {
  locateFile: (path: string) => string;
}) => Promise<OpenCascadeInstance>;

let kernelReady: Promise<void> | null = null;

/** Idempotent: loads the WASM kernel once and wires it into replicad. */
export function initKernel(): Promise<void> {
  if (!kernelReady) {
    kernelReady = (async () => {
      const OC = await (opencascade as unknown as OCFactory)({
        // The .wasm is served as a static asset from /public.
        locateFile: () => "/replicad_single.wasm",
      });
      setOC(OC);
    })();
  }
  return kernelReady;
}

/**
 * Turn a thrown value from the kernel into a readable message.
 *
 * OpenCascade (via emscripten) throws native exceptions as raw NUMBERS (a
 * pointer into WASM memory), not Error objects — that's why a bad operation
 * surfaces as e.g. "9105936". The slim build has no message decoder, so we map
 * it to actionable guidance (this also becomes the `previousError` fed to the
 * self-correction retry in Phase F).
 */
export function decodeKernelError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "number") {
    return (
      `The CAD kernel rejected this geometry (OpenCascade error #${err}). ` +
      `Common causes: a fillet/chamfer radius too large for an edge, rounding ` +
      `edges that can't be rounded (e.g. around holes), or an invalid boolean. ` +
      `Try a smaller radius, or apply the fillet only to specific edges.`
    );
  }
  return String(err);
}

// Globals hidden from model-authored code so it can't make network calls or
// message the page.
const SHADOWED_GLOBALS = [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
  "indexedDB", "caches", "navigator", "location", "postMessage", "close",
];

/**
 * Evaluate LLM-generated `buildModel` code and run it with the given parameter
 * values, returning the resulting solid.
 *
 * SECURITY (prototype only): `new Function` executes model-authored code with
 * no sandbox. Acceptable for this LOCAL single-user prototype; before shipping,
 * run it inside the Web Worker (Phase H) with time/resource limits. See README.
 */
export function runGeneratedModel(
  code: string,
  values: Record<string, number>,
): Shape3D {
  let factory: (r: typeof replicad, p: Record<string, number>, ...shadowed: undefined[]) => Shape3D;
  try {
    // Extra parameters shadow network/messaging globals; callers pass undefined.
    factory = new Function(
      "replicad",
      "params",
      ...SHADOWED_GLOBALS,
      `${code}\nreturn buildModel(replicad, params);`,
    ) as typeof factory;
  } catch (err) {
    throw new Error(`Generated code has a syntax error: ${decodeKernelError(err)}`);
  }

  let shape: Shape3D;
  try {
    shape = factory(replicad, values, ...SHADOWED_GLOBALS.map(() => undefined));
  } catch (err) {
    throw new Error(decodeKernelError(err));
  }
  if (!shape) {
    throw new Error("buildModel did not return a shape.");
  }
  return shape;
}

/**
 * Export a solid to a downloadable Blob. STEP is exact BREP (opens in CAD);
 * STL is tessellated (opens in slicers/mesh viewers) — binary for smaller files.
 */
export function exportShape(shape: Shape3D, format: "step" | "stl"): Blob {
  try {
    return format === "step" ? shape.blobSTEP() : shape.blobSTL({ binary: true });
  } catch (err) {
    throw new Error(decodeKernelError(err));
  }
}

/**
 * Tessellate a solid into raw mesh data (faces + edges) for display. This is the
 * DISPLAY path from the brief — the BREP solid stays the source of truth; we
 * mesh it for rendering rather than round-tripping STL. Returns plain arrays so
 * the result can be transferred from the worker to the main thread.
 */
export function meshRaw(shape: Shape3D): RawMesh {
  try {
    return {
      faces: shape.mesh({ tolerance: 0.05, angularTolerance: 30 }),
      edges: shape.meshEdges({ tolerance: 0.05, angularTolerance: 30 }),
    };
  } catch (err) {
    throw new Error(decodeKernelError(err));
  }
}
