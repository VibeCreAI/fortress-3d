import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  PROJECTILE_MAX_FLIGHT_TIME,
  TANK_HIT_RADIUS,
} from "./constants";
import {
  advanceProjectile,
  getTankCenter,
  groundFromWorld,
  terrainHeightAt,
  terrainMaxX,
  terrainMaxY,
  vec3Distance,
} from "./gameMath";
import type { ProjectileLaunch, TankState, TerrainState, Vec3, Wind } from "./gameTypes";

type ProjectileProps = {
  launch: ProjectileLaunch;
  wind: Wind;
  terrain: TerrainState;
  targetTanks: TankState[];
  onImpact: (position: Vec3) => void;
};

export function Projectile({ launch, wind, terrain, targetTanks, onImpact }: ProjectileProps) {
  const positionRef = useRef<Vec3>({ ...launch.start });
  const velocityRef = useRef<Vec3>({ ...launch.velocity });
  const trailRef = useRef<Vec3[]>([{ ...launch.start }]);
  const impactedRef = useRef(false);
  const elapsedRef = useRef(0);
  const [renderPosition, setRenderPosition] = useState<Vec3>({ ...launch.start });
  const [renderVelocity, setRenderVelocity] = useState<Vec3>({ ...launch.velocity });
  const [trail, setTrail] = useState<Vec3[]>([{ ...launch.start }]);
  const style = projectileStyle(launch.weapon);
  const directionQuaternion = useMemo(() => {
    const direction = new THREE.Vector3(renderVelocity.x, renderVelocity.y, renderVelocity.z);
    if (direction.lengthSq() <= 0.0001) {
      return new THREE.Quaternion();
    }
    direction.normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  }, [renderVelocity]);

  useEffect(() => {
    positionRef.current = { ...launch.start };
    velocityRef.current = { ...launch.velocity };
    trailRef.current = [{ ...launch.start }];
    impactedRef.current = false;
    elapsedRef.current = 0;
    setRenderPosition({ ...launch.start });
    setRenderVelocity({ ...launch.velocity });
    setTrail([{ ...launch.start }]);
  }, [launch.id, launch.start, launch.velocity]);

  useFrame((_, delta) => {
    if (impactedRef.current) {
      return;
    }

    const dt = Math.min(delta, 0.033);
    elapsedRef.current += dt;
    const velocity = velocityRef.current;
    const position = positionRef.current;
    const next = advanceProjectile(
      position,
      velocity,
      dt,
      wind,
      launch.weapon,
      launch.ignoresWind,
      targetTanks,
    );

    velocityRef.current = next.velocity;
    positionRef.current = next.position;

    const groundPosition = groundFromWorld(next.position);
    const terrainHeight = terrainHeightAt(terrain, groundPosition);
    const hitTank = targetTanks.some(
      (t) => t.hp > 0 && vec3Distance(next.position, getTankCenter(t)) <= TANK_HIT_RADIUS,
    );
    const hitTerrain = next.position.y <= terrainHeight + 0.08;
    const expired = elapsedRef.current >= PROJECTILE_MAX_FLIGHT_TIME;
    const leftArena =
      groundPosition.x < terrain.minX - 4 ||
      groundPosition.x > terrainMaxX(terrain) + 4 ||
      groundPosition.y < terrain.minY - 4 ||
      groundPosition.y > terrainMaxY(terrain) + 4;

    if (hitTerrain || hitTank || leftArena || expired) {
      impactedRef.current = true;
      onImpact({
        x: next.position.x,
        y: expired ? terrainHeight + 0.12 : Math.max(next.position.y, terrainHeight + 0.12),
        z: next.position.z,
      });
      return;
    }

    trailRef.current = [...trailRef.current.slice(-24), { ...next.position }];
    setRenderPosition({ ...next.position });
    setRenderVelocity({ ...next.velocity });
    setTrail(trailRef.current);
  });

  return (
    <group>
      {trail.length > 1 && (
        <Line
          points={trail.map((point) => [point.x, point.y, point.z] as [number, number, number])}
          color={style.trail}
          lineWidth={style.trailWidth}
        />
      )}
      {launch.weapon === "earth" ? (
        <mesh
          castShadow
          position={[renderPosition.x, renderPosition.y, renderPosition.z]}
          quaternion={directionQuaternion}
        >
          <coneGeometry args={[0.22, 0.7, 12]} />
          <meshStandardMaterial
            color={style.color}
            emissive={style.emissive}
            emissiveIntensity={0.7}
            roughness={0.5}
          />
        </mesh>
      ) : (
        <mesh castShadow position={[renderPosition.x, renderPosition.y, renderPosition.z]}>
          <sphereGeometry args={[style.radius, 18, 18]} />
          <meshStandardMaterial
            color={style.color}
            emissive={style.emissive}
            emissiveIntensity={style.emissiveIntensity}
            roughness={0.35}
          />
        </mesh>
      )}
      <pointLight
        position={[renderPosition.x, renderPosition.y, renderPosition.z]}
        color={style.light}
        intensity={style.lightIntensity}
        distance={style.lightDistance}
      />
    </group>
  );
}

function projectileStyle(weapon: ProjectileLaunch["weapon"]) {
  if (weapon === "red") {
    return {
      color: "#e5322d",
      emissive: "#ff1e12",
      emissiveIntensity: 2.1,
      light: "#ff3b30",
      lightIntensity: 2.1,
      lightDistance: 5.4,
      radius: 0.17,
      trail: "#ff8b7f",
      trailWidth: 3,
    };
  }

  if (weapon === "earth") {
    return {
      color: "#8b5a2b",
      emissive: "#5a3218",
      emissiveIntensity: 0.8,
      light: "#d68c45",
      lightIntensity: 1.3,
      lightDistance: 4.8,
      radius: 0.24,
      trail: "#c79962",
      trailWidth: 4,
    };
  }

  if (weapon === "magnet") {
    return {
      color: "#6de8ff",
      emissive: "#2bb7ff",
      emissiveIntensity: 2.4,
      light: "#6de8ff",
      lightIntensity: 2.2,
      lightDistance: 6,
      radius: 0.25,
      trail: "#9ef7ff",
      trailWidth: 4,
    };
  }

  return {
    color: "#ffe27a",
    emissive: "#ff9c2a",
    emissiveIntensity: 1.4,
    light: "#ffb347",
    lightIntensity: 1.5,
    lightDistance: 4.5,
    radius: 0.24,
    trail: "#fff0b4",
    trailWidth: 3,
  };
}
