// Phase H — Web Worker hosting the CAD kernel.
//
// Moves the heavy compute (OCCT WASM init, running generated buildModel code,
// meshing, STEP/STL export) off the main thread so the UI stays responsive.
// The current BREP solid lives here (source of truth) and is reused for export.
// Exposed to the main thread via comlink (see ./kernelClient.ts).

import * as Comlink from "comlink";
import type { Shape3D } from "replicad";
import {
  initKernel,
  runGeneratedModel,
  meshRaw,
  exportShape,
  type RawMesh,
} from "./kernel";

// Holds the latest built solid so export() doesn't need to re-run the code.
let currentShape: Shape3D | null = null;

/** Release OCCT (WASM heap) memory; never let cleanup mask the real result. */
function freeShape(shape: Shape3D): void {
  try {
    shape.delete();
  } catch {
    /* already deleted */
  }
}

const api = {
  async init(): Promise<void> {
    await initKernel();
  },

  /** Run generated code with the given values, store the solid, return its mesh. */
  build(code: string, values: Record<string, number>): RawMesh {
    // Both calls throw decoded Error objects on failure; comlink propagates them.
    const shape = runGeneratedModel(code, values);
    let mesh: RawMesh;
    try {
      mesh = meshRaw(shape);
    } catch (err) {
      freeShape(shape); // keep the previous (still valid) shape
      throw err;
    }
    const previous = currentShape;
    currentShape = shape;
    if (previous) freeShape(previous);
    return mesh;
  },

  /** Export the current solid as a STEP/STL Blob. */
  exportBlob(format: "step" | "stl"): Blob {
    if (!currentShape) throw new Error("Rebuild the model before exporting.");
    return exportShape(currentShape, format);
  },
};

export type KernelWorkerApi = typeof api;

Comlink.expose(api);
