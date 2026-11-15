"use client";

// 3D viewport. The scene is built in CAD coordinates (Z-up, like Replicad): the
// camera's up vector is +Z and the grid lies in the XY plane, so parts sit on
// the grid and +Z points up on screen. Shaded faces + crisp edge lines, orbit
// controls with damping, a small axis gizmo, and animated view presets.

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { Box3, Sphere, Vector3, type Group, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ThreeGeometry } from "replicad-threejs-helper";
import type { ViewName } from "./ViewportToolbar";

export interface ViewCommand {
  view: ViewName;
  n: number; // changes on every click so repeated presses re-trigger
}

// Directions are camera offsets from the target, in CAD axes (Z up).
const DIRS: Record<Exclude<ViewName, "fit">, Vector3> = {
  iso: new Vector3(1, -1, 0.9).normalize(),
  top: new Vector3(0, -0.002, 1).normalize(),
  front: new Vector3(0, -1, 0).normalize(),
  right: new Vector3(1, 0, 0).normalize(),
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Model({ geometries, edges }: { geometries: ThreeGeometry[]; edges: boolean }) {
  return (
    <>
      {geometries.map((g, i) => (
        <group key={i}>
          <mesh geometry={g.faces}>
            <meshStandardMaterial
              color="#c9ced6"
              metalness={0.15}
              roughness={0.55}
              polygonOffset
              polygonOffsetFactor={2}
              polygonOffsetUnits={1}
            />
          </mesh>
          <lineSegments geometry={g.lines} visible={edges}>
            <lineBasicMaterial color="#0b0d10" />
          </lineSegments>
        </group>
      ))}
    </>
  );
}

interface Anim {
  t0: number;
  dur: number;
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
}

function Scene({
  geometries,
  edges,
  command,
  fitToken,
}: {
  geometries: ThreeGeometry[];
  edges: boolean;
  command: ViewCommand | null;
  fitToken: number;
}) {
  const modelRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const anim = useRef<Anim | null>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);

  function frame(view: ViewName) {
    const controls = controlsRef.current;
    if (!controls) return;
    const box = new Box3();
    if (modelRef.current) {
      modelRef.current.updateWorldMatrix(true, true);
      box.setFromObject(modelRef.current);
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new Vector3(0, 0, 10), new Vector3(40, 40, 20));
    const center = box.getCenter(new Vector3());
    const radius = Math.max(box.getBoundingSphere(new Sphere()).radius, 1);

    const dir =
      view === "fit"
        ? camera.position.clone().sub(controls.target).normalize()
        : DIRS[view].clone();
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / size.height));
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.15;
    const toPos = center.clone().add(dir.multiplyScalar(dist));

    if (prefersReducedMotion()) {
      anim.current = null;
      camera.position.copy(toPos);
      controls.target.copy(center);
      controls.update();
      return;
    }
    anim.current = {
      t0: performance.now(),
      dur: 450,
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget: center,
    };
  }

  useEffect(() => {
    if (command) frame(command.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  useEffect(() => {
    if (fitToken > 0) frame("fit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  useFrame(() => {
    const a = anim.current;
    const controls = controlsRef.current;
    if (!a || !controls) return;
    const p = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - p, 3);
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
    controls.update();
    if (p >= 1) anim.current = null;
  });

  return (
    <>
      <hemisphereLight args={["#dfe6f0", "#1a1d24", 0.95]} up={[0, 0, 1]} />
      <directionalLight position={[60, -50, 100]} intensity={1.5} />
      <directionalLight position={[-70, 40, 40]} intensity={0.5} />
      <directionalLight position={[40, 80, 20]} intensity={0.6} />

      <group ref={modelRef}>
        <Model geometries={geometries} edges={edges} />
      </group>

      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.02]}
        args={[200, 200]}
        cellSize={10}
        cellThickness={0.8}
        cellColor="#1a1f27"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#1f3a46"
        fadeDistance={320}
        fadeStrength={1.6}
        infiniteGrid
      />

      <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.12} />
      <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
        <GizmoViewport
          scale={32}
          axisColors={["#d9605f", "#56b886", "#5a8fd6"]}
          axisHeadScale={0.85}
          labelColor="#0c0e12"
        />
      </GizmoHelper>
    </>
  );
}

export default function Viewport({
  geometries,
  edges,
  command,
  fitToken,
}: {
  geometries: ThreeGeometry[];
  edges: boolean;
  command: ViewCommand | null;
  fitToken: number;
}) {
  return (
    <div className="viewport-bg absolute inset-0">
      <Canvas
        camera={{ position: [60, -60, 54], up: [0, 0, 1], fov: 40, near: 0.1, far: 10000 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <Scene geometries={geometries} edges={edges} command={command} fitToken={fitToken} />
      </Canvas>
    </div>
  );
}
