"use client";

// 3D viewport: renders replicad-meshed geometry as engineering geometry —
// shaded faces + crisp edge lines — with orbit controls, a ground grid, axes,
// and lighting. Auto-frames the model via drei <Bounds>.

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Bounds } from "@react-three/drei";
import type { ThreeGeometry } from "replicad-threejs-helper";

function Model({ geometries }: { geometries: ThreeGeometry[] }) {
  return (
    <group>
      {geometries.map((g, i) => (
        <group key={i}>
          {/* Faces — solid body. Needs light to be visible. */}
          <mesh geometry={g.faces}>
            <meshStandardMaterial
              color="#5b8def"
              metalness={0.1}
              roughness={0.6}
              polygonOffset
              polygonOffsetFactor={2}
              polygonOffsetUnits={1}
            />
          </mesh>
          {/* Edges — drawn on top so the part reads as CAD. */}
          <lineSegments geometry={g.lines}>
            <lineBasicMaterial color="#1e293b" />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

export default function Viewport({ geometries }: { geometries: ThreeGeometry[] }) {
  return (
    <Canvas
      camera={{ position: [60, 60, 60], fov: 45, near: 0.1, far: 10000 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#0b0f17"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 80, 30]} intensity={1.2} />
      <directionalLight position={[-40, -20, -50]} intensity={0.4} />

      {/* Auto-frame the model on every geometry change. */}
      <Bounds fit clip observe margin={1.4}>
        <Model geometries={geometries} />
      </Bounds>

      <Grid
        args={[200, 200]}
        cellSize={10}
        cellThickness={0.5}
        sectionSize={50}
        sectionThickness={1}
        cellColor="#1f2937"
        sectionColor="#374151"
        fadeDistance={500}
        infiniteGrid
        position={[0, -0.01, 0]}
      />

      <OrbitControls makeDefault enableDamping />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
