import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import {
  GROUND_MAX_X,
  GROUND_MAX_Y,
  GROUND_MIN_X,
  GROUND_MIN_Y,
  GRAVITY,
  TANK_HIT_RADIUS,
} from "./constants";
import {
  getTankCenter,
  groundFromWorld,
  terrainHeightAt,
  vec3Distance,
  windAcceleration,
} from "./gameMath";
import type { ProjectileLaunch, TankState, TerrainState, Vec3, Wind } from "./gameTypes";

type ProjectileProps = {
  launch: ProjectileLaunch;
  wind: Wind;
  terrain: TerrainState;
  targetTank: TankState;
  onImpact: (position: Vec3) => void;
};

export function Projectile({ launch, wind, terrain, targetTank, onImpact }: ProjectileProps) {
  const positionRef = useRef<Vec3>({ ...launch.start });
  const velocityRef = useRef<Vec3>({ ...launch.velocity });
  const trailRef = useRef<Vec3[]>([{ ...launch.start }]);
  const impactedRef = useRef(false);
  const [renderPosition, setRenderPosition] = useState<Vec3>({ ...launch.start });
  const [trail, setTrail] = useState<Vec3[]>([{ ...launch.start }]);

  useEffect(() => {
    positionRef.current = { ...launch.start };
    velocityRef.current = { ...launch.velocity };
    trailRef.current = [{ ...launch.start }];
    impactedRef.current = false;
    setRenderPosition({ ...launch.start });
    setTrail([{ ...launch.start }]);
  }, [launch.id, launch.start, launch.velocity]);

  useFrame((_, delta) => {
    if (impactedRef.current) {
      return;
    }

    const dt = Math.min(delta, 0.033);
    const windAccel = windAcceleration(wind);
    const velocity = velocityRef.current;
    const position = positionRef.current;

    velocity.x += windAccel.x * dt;
    velocity.y -= GRAVITY * dt;
    velocity.z += windAccel.z * dt;
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;
    position.z += velocity.z * dt;

    const groundPosition = groundFromWorld(position);
    const terrainHeight = terrainHeightAt(terrain, groundPosition);
    const targetDistance = vec3Distance(position, getTankCenter(targetTank));
    const hitTerrain = position.y <= terrainHeight + 0.08;
    const hitTank = targetDistance <= TANK_HIT_RADIUS;
    const leftArena =
      groundPosition.x < GROUND_MIN_X - 4 ||
      groundPosition.x > GROUND_MAX_X + 4 ||
      groundPosition.y < GROUND_MIN_Y - 4 ||
      groundPosition.y > GROUND_MAX_Y + 4;

    if (hitTerrain || hitTank || leftArena) {
      impactedRef.current = true;
      onImpact({
        x: position.x,
        y: Math.max(position.y, terrainHeight + 0.12),
        z: position.z,
      });
      return;
    }

    trailRef.current = [...trailRef.current.slice(-24), { ...position }];
    setRenderPosition({ ...position });
    setTrail(trailRef.current);
  });

  return (
    <group>
      {trail.length > 1 && (
        <Line
          points={trail.map((point) => [point.x, point.y, point.z] as [number, number, number])}
          color="#fff0b4"
          lineWidth={3}
        />
      )}
      <mesh castShadow position={[renderPosition.x, renderPosition.y, renderPosition.z]}>
        <sphereGeometry args={[0.24, 18, 18]} />
        <meshStandardMaterial color="#ffe27a" emissive="#ff9c2a" emissiveIntensity={1.4} roughness={0.35} />
      </mesh>
      <pointLight
        position={[renderPosition.x, renderPosition.y, renderPosition.z]}
        color="#ffb347"
        intensity={1.5}
        distance={4.5}
      />
    </group>
  );
}
