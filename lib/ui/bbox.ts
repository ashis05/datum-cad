import { Box3 } from "three";
import type { ThreeGeometry } from "replicad-threejs-helper";

/** Bounding-box size in CAD axes (X × Y × Z, mm), or null when empty. */
export function boundingSize(geometries: ThreeGeometry[]): [number, number, number] | null {
  const box = new Box3();
  for (const g of geometries) {
    g.faces.computeBoundingBox();
    if (g.faces.boundingBox) box.union(g.faces.boundingBox);
  }
  if (box.isEmpty()) return null;
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}
