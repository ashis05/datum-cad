// Main-thread bridge: turn the worker's raw mesh data into three.js geometry
// (faces + edges) for React Three Fiber. three.js BufferGeometry objects can't
// cross the worker boundary, so this conversion stays on the main thread.

import { syncGeometries } from "replicad-threejs-helper";
import type { ThreeGeometry } from "replicad-threejs-helper";
import type { RawMesh } from "./kernel";

export type { ThreeGeometry };

export function buildGeometries(raw: RawMesh): ThreeGeometry[] {
  return syncGeometries([{ name: "shape", faces: raw.faces, edges: raw.edges }], []);
}
