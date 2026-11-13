import * as React from "react";
import { ThreeCanvas } from "@remotion/three";
import { useLoader, useThree } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useFrameEvents } from "../context/index";
import type { Model3D } from "../schema/index";

/** The same asset rule as image/video: relative source paths use Remotion's
 * static-file server; hosted previews use their already resolved URL. */
export function resolveModel3DSrc(src: string): string {
  return /^(https?:|data:|blob:|file:|\/)/i.test(src) ? src : staticFile(src);
}

/** Pure frame-based animation, independent of playback history and wall clock. */
export function model3dAngle(frame: number, durationFrames: number, turns: number): number {
  return 2 * Math.PI * turns * Math.max(0, Math.min(1, frame / Math.max(1, durationFrames - 1)));
}

const radians = (degrees: number) => degrees * Math.PI / 180;

const CameraAim: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const { camera } = useThree();
  React.useLayoutEffect(() => {
    camera.position.set(...position);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, position[0], position[1], position[2]]);
  return null;
};

/** Suspends while GLB and embedded textures load; ThreeCanvas supplies the
 * Remotion-aware Suspense render blocker so MP4 never captures the placeholder. */
const LoadedModel: React.FC<{ stream: Model3D; angle: number }> = ({ stream, angle }) => {
  const gltf = useLoader(GLTFLoader, resolveModel3DSrc(stream.src));
  const copy = React.useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const { center, factor } = React.useMemo(() => {
    if (!stream.autoFit) return { center: new Vector3(), factor: 1 };
    const box = new Box3().setFromObject(copy);
    const size = box.getSize(new Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxSize) || maxSize <= 0) {
      return { center: new Vector3(), factor: 1 };
    }
    return { center: box.getCenter(new Vector3()), factor: 2 / maxSize };
  }, [copy, stream.autoFit]);

  const rx = radians(stream.rotation[0]);
  const ry = radians(stream.rotation[1]);
  const rz = radians(stream.rotation[2]);
  return (
    <group position={stream.position} rotation={[rx, ry, rz]}>
      <group rotation={[0, stream.motion === "turntable" ? angle : 0, 0]} scale={factor * stream.scale}>
        <primitive object={copy} position={[-center.x, -center.y, -center.z]} />
      </group>
    </group>
  );
};

export const Model3DLeaf: React.FC<{ stream: Model3D }> = ({ stream }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const durationFrames = Math.max(1, Math.round((stream.durationInSeconds ?? stream.duration ?? 4) * fps));
  useFrameEvents(stream.on, durationFrames);
  const angle = model3dAngle(frame, durationFrames, stream.turns);
  const baseCamera = stream.camera?.position ?? [0, 0, 4.5];
  const cameraPos: [number, number, number] = stream.motion === "orbit"
    ? [
        baseCamera[0] * Math.cos(angle) + baseCamera[2] * Math.sin(angle),
        baseCamera[1],
        baseCamera[2] * Math.cos(angle) - baseCamera[0] * Math.sin(angle),
      ]
    : baseCamera;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: stream.camera?.fov ?? 40, position: cameraPos, near: 0.05, far: 100 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", backgroundColor: stream.background ?? "transparent" }}
    >
      <CameraAim position={cameraPos} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 5, 4]} intensity={2.3} />
      <directionalLight position={[3, 1, -4]} intensity={1.1} />
      <LoadedModel stream={stream} angle={angle} />
    </ThreeCanvas>
  );
};
