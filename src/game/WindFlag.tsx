import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { terrainHeightAt } from "./gameMath";
import type { TerrainState, Wind } from "./gameTypes";

const POLE_HEIGHT = 5.6;
const POLE_RADIUS = 0.09;
const FLAG_LENGTH = 2.6;
const FLAG_HEIGHT = 1.05;
const FLAG_SEGMENTS = 6;
const SEGMENT_LENGTH = FLAG_LENGTH / FLAG_SEGMENTS;
const FLAG_THICKNESS = 0.05;
const MAX_STRENGTH = 8;

type WindFlagProps = {
  terrain: TerrainState;
  wind: Wind;
  position?: { x: number; y: number };
};

export function WindFlag({
  terrain,
  wind,
  position = { x: 0, y: 0 },
}: WindFlagProps) {
  const ground = terrainHeightAt(terrain, position);
  const flagAnchorLocalY = POLE_HEIGHT - FLAG_HEIGHT * 0.5 - 0.18;

  const segmentRefs = useRef<(THREE.Group | null)[]>([]);
  const yaw = useMemo(
    () => -Math.atan2(wind.vector.y, wind.vector.x),
    [wind.vector.x, wind.vector.y],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const strengthRatio = Math.min(1, Math.max(0, wind.strength / MAX_STRENGTH));
    const droopFactor = 1 - strengthRatio;
    const maxDroop = FLAG_LENGTH * 0.55;
    const waveFreq = 2.0 + strengthRatio * 6.5;
    const waveAmp = 0.04 + strengthRatio * 0.18;

    for (let i = 0; i < FLAG_SEGMENTS; i++) {
      const seg = segmentRefs.current[i];
      if (!seg) continue;
      const t01 = (i + 0.5) / FLAG_SEGMENTS;
      const phase = t * waveFreq - i * 0.55;
      const droopY = -maxDroop * droopFactor * (t01 * t01);
      const waveY = Math.sin(phase) * waveAmp * t01;
      const waveZ = Math.cos(phase * 1.3) * waveAmp * 0.7 * t01;

      seg.position.set(
        (i + 0.5) * SEGMENT_LENGTH,
        droopY + waveY,
        waveZ,
      );
      seg.rotation.z = Math.sin(phase + 0.4) * 0.05 * t01;
    }
  });

  return (
    <group position={[position.x, ground, position.y]}>
      <mesh castShadow position={[0, POLE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS * 1.35, POLE_HEIGHT, 10]} />
        <meshStandardMaterial color="#6f5a48" roughness={0.86} />
      </mesh>
      <mesh castShadow position={[0, POLE_HEIGHT + 0.1, 0]}>
        <sphereGeometry args={[0.14, 14, 12]} />
        <meshStandardMaterial color="#d8c486" roughness={0.45} metalness={0.45} />
      </mesh>
      <group position={[0, flagAnchorLocalY, 0]} rotation={[0, yaw, 0]}>
        {Array.from({ length: FLAG_SEGMENTS }).map((_, i) => (
          <group
            key={i}
            ref={(g) => {
              segmentRefs.current[i] = g;
            }}
          >
            <mesh castShadow>
              <boxGeometry
                args={[SEGMENT_LENGTH * 0.96, FLAG_HEIGHT, FLAG_THICKNESS]}
              />
              <meshStandardMaterial
                color={i % 2 === 0 ? "#f6f4ef" : "#e9e4d6"}
                roughness={0.82}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
