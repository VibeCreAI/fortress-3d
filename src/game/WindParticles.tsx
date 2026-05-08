import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { terrainHeightAt, terrainMaxX, terrainMaxY } from "./gameMath";
import type { TerrainState, Wind } from "./gameTypes";

const PARTICLE_COUNT = 120;
const MAX_STRENGTH = 8;
const UPDATE_INTERVAL_SECONDS = 1 / 36;
const dummy = new THREE.Object3D();

type WindParticlesProps = {
  terrain: TerrainState;
  wind: Wind;
};

type ParticleSeed = {
  along: number;
  cross: number;
  height: number;
  speed: number;
  phase: number;
  size: number;
};

function pseudo(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function WindParticles({ terrain, wind }: WindParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lastUpdateRef = useRef(-UPDATE_INTERVAL_SECONDS);

  const seeds = useMemo<ParticleSeed[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
        along: pseudo(index, 1),
        cross: pseudo(index, 2) - 0.5,
        height: pseudo(index, 3),
        speed: 0.7 + pseudo(index, 4) * 0.8,
        phase: pseudo(index, 5) * Math.PI * 2,
        size: 0.75 + pseudo(index, 6) * 0.75,
      })),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = state.clock.elapsedTime;
    if (elapsed - lastUpdateRef.current < UPDATE_INTERVAL_SECONDS) {
      return;
    }
    lastUpdateRef.current = elapsed;

    const strengthRatio = Math.min(1, Math.max(0, wind.strength / MAX_STRENGTH));
    const activeCount = wind.strength <= 0 ? 0 : Math.round(26 + strengthRatio * (PARTICLE_COUNT - 26));
    mesh.visible = activeCount > 0;
    if (!mesh.visible) return;

    const minX = terrain.minX;
    const maxX = terrainMaxX(terrain);
    const minZ = terrain.minY;
    const maxZ = terrainMaxY(terrain);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const pathLength = Math.hypot(spanX, spanZ) + 16;
    const crossLength = Math.hypot(spanX, spanZ) + 8;
    const dirX = wind.vector.x;
    const dirZ = wind.vector.y;
    const perpX = -dirZ;
    const perpZ = dirX;
    const yaw = -Math.atan2(dirZ, dirX);
    const flowSpeed = 2.0 + wind.strength * 1.35;
    const streakLength = 0.5 + strengthRatio * 1.25;

    if (materialRef.current) {
      materialRef.current.opacity = 0.2 + strengthRatio * 0.22;
    }

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      if (i >= activeCount) {
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const seed = seeds[i];
      const wrappedAlong =
        (((seed.along * pathLength + elapsed * flowSpeed * seed.speed) % pathLength) +
          pathLength) %
          pathLength -
        pathLength / 2;
      const shimmer = Math.sin(elapsed * (1.3 + strengthRatio * 2.4) + seed.phase) * (0.18 + strengthRatio * 0.45);
      const cross = seed.cross * crossLength + shimmer;
      const x = centerX + dirX * wrappedAlong + perpX * cross;
      const z = centerZ + dirZ * wrappedAlong + perpZ * cross;
      const ground = terrainHeightAt(terrain, { x, y: z });
      const y = ground + 2.7 + seed.height * 5.4;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(streakLength * seed.size, 0.025, 0.025);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#f3fbff"
        transparent
        opacity={0.28}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
