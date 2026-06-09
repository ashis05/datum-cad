// Replicad kernel: loads opencascade.js (OCCT as WebAssembly) and injects it
// into replicad via setOC. MUST run in the browser only — the WASM kernel
// cannot run on the Node server, so every caller is a client component that is
// dynamically imported with { ssr: false }.
//
// API surface verified against the installed packages (replicad 0.23.x):
//   - loader:  replicad-opencascadejs/src/replicad_single.js  (+ .wasm)
//   - setOC:   (oc: OpenCascadeInstance) => void
//   - meshing: shape.mesh({ tolerance, angularTolerance }) / shape.meshEdges({ keepMesh })

import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import type { OpenCascadeInstance } from "replicad-opencascadejs/src/replicad_single.js";
import * as replicad from "replicad";
import { setOC, drawRectangle, drawCircle } from "replicad";
import type { Shape3D } from "replicad";
import { syncGeometries } from "replicad-threejs-helper";
import type { ThreeGeometry } from "replicad-threejs-helper";

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
 * Phase B hardcoded demo: a 40×20×10mm plate with a centered 5mm hole.
 * No LLM involved — this exists only to prove the kernel renders.
 */
export function buildBoxWithHole(): Shape3D {
  const length = 40;
  const width = 20;
  const thickness = 10;
  const holeRadius = 2.5;

  const plate = drawRectangle(length, width)
    .sketchOnPlane()
    .extrude(thickness) as Shape3D;
  const hole = drawCircle(holeRadius)
    .sketchOnPlane()
    .extrude(thickness) as Shape3D;

  return plate.cut(hole);
}

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
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    "replicad",
    "params",
    `${code}\nreturn buildModel(replicad, params);`,
  );
  const shape = factory(replicad, values) as Shape3D;
  if (!shape) {
    throw new Error("buildModel did not return a shape.");
  }
  return shape;
}

/**
 * Tessellate a solid into Three.js BufferGeometries (faces + edges) for
 * display. This is the DISPLAY path from the brief — the BREP solid stays the
 * source of truth; we mesh it for rendering rather than round-tripping STL.
 */
export function meshShapeToGeometries(shape: Shape3D): ThreeGeometry[] {
  const meshed = [
    {
      name: "shape",
      faces: shape.mesh({ tolerance: 0.05, angularTolerance: 30 }),
      edges: shape.meshEdges({ tolerance: 0.05, angularTolerance: 30 }),
    },
  ];
  return syncGeometries(meshed, []);
}
