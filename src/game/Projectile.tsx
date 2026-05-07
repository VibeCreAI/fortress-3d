import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
import type { ProjectileImpactProfile, ProjectileLaunch, TankState, TerrainState, Vec3, Wind } from "./gameTypes";

const TRAIL_POINT_COUNT = 25;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

type ProjectileProps = {
  launch: ProjectileLaunch;
  wind: Wind;
  terrain: TerrainState;
  targetTanks: TankState[];
  onImpact: (position: Vec3, profile: ProjectileImpactProfile) => void;
  onFlightPosition?: (position: Vec3, velocity: Vec3) => void;
};

export function Projectile({ launch, wind, terrain, targetTanks, onImpact, onFlightPosition }: ProjectileProps) {
  const positionRef = useRef<Vec3>({ ...launch.start });
  const velocityRef = useRef<Vec3>({ ...launch.velocity });
  const projectileMeshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const trailPositions = useMemo(() => new Float32Array(TRAIL_POINT_COUNT * 3), []);
  const style = useMemo(() => projectileStyle(launch.weapon), [launch.weapon]);
  const trailLine = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    geometry.setDrawRange(0, 1);
    const material = new THREE.LineBasicMaterial({
      color: style.trail,
      transparent: true,
      opacity: style.trailOpacity,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    return line;
  }, [style.trail, style.trailOpacity, trailPositions]);
  const trailCountRef = useRef(1);
  const impactedRef = useRef(false);
  const elapsedRef = useRef(0);
  const peakHeightRef = useRef(launch.start.y);
  const directionRef = useRef(new THREE.Vector3());

  const writeTrailPoint = (index: number, point: Vec3) => {
    const offset = index * 3;
    trailPositions[offset] = point.x;
    trailPositions[offset + 1] = point.y;
    trailPositions[offset + 2] = point.z;
  };

  const refreshTrail = () => {
    const geometry = trailLine.geometry;
    geometry.setDrawRange(0, trailCountRef.current);
    const positionAttribute = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (positionAttribute) {
      positionAttribute.needsUpdate = true;
    }
  };

  const moveVisuals = (position: Vec3, velocity: Vec3) => {
    const mesh = projectileMeshRef.current;
    if (mesh) {
      mesh.position.set(position.x, position.y, position.z);
      if (launch.weapon === "earth") {
        directionRef.current.set(velocity.x, velocity.y, velocity.z);
        if (directionRef.current.lengthSq() > 0.0001) {
          directionRef.current.normalize();
          mesh.quaternion.setFromUnitVectors(Y_AXIS, directionRef.current);
        }
      }
    }
    lightRef.current?.position.set(position.x, position.y, position.z);
  };

  useEffect(() => {
    return () => {
      trailLine.geometry.dispose();
      (trailLine.material as THREE.Material).dispose();
    };
  }, [trailLine]);

  useEffect(() => {
    positionRef.current = { ...launch.start };
    velocityRef.current = { ...launch.velocity };
    trailPositions.fill(0);
    writeTrailPoint(0, launch.start);
    trailCountRef.current = 1;
    impactedRef.current = false;
    elapsedRef.current = 0;
    peakHeightRef.current = launch.start.y;
    moveVisuals(launch.start, launch.velocity);
    refreshTrail();
    onFlightPosition?.(launch.start, launch.velocity);
  }, [launch.id, launch.start, launch.velocity, onFlightPosition, trailPositions]);

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
    peakHeightRef.current = Math.max(peakHeightRef.current, next.position.y);
    moveVisuals(next.position, next.velocity);
    onFlightPosition?.(next.position, next.velocity);

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
      onImpact(
        {
          x: next.position.x,
          y: expired ? terrainHeight + 0.12 : Math.max(next.position.y, terrainHeight + 0.12),
          z: next.position.z,
        },
        {
          launchHeight: launch.start.y,
          peakHeight: peakHeightRef.current,
          impactVelocity: { ...next.velocity },
          flightTime: elapsedRef.current,
        },
      );
      return;
    }

    if (trailCountRef.current < TRAIL_POINT_COUNT) {
      writeTrailPoint(trailCountRef.current, next.position);
      trailCountRef.current += 1;
    } else {
      trailPositions.copyWithin(0, 3);
      writeTrailPoint(TRAIL_POINT_COUNT - 1, next.position);
    }
    refreshTrail();
  });

  return (
    <group>
      <primitive object={trailLine} />
      {launch.weapon === "earth" ? (
        <mesh
          ref={projectileMeshRef}
          castShadow
          position={[launch.start.x, launch.start.y, launch.start.z]}
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
        <mesh ref={projectileMeshRef} castShadow position={[launch.start.x, launch.start.y, launch.start.z]}>
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
        ref={lightRef}
        position={[launch.start.x, launch.start.y, launch.start.z]}
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
      trailOpacity: 0.64,
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
      trailOpacity: 0.62,
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
      trailOpacity: 0.68,
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
    trailOpacity: 0.6,
    trailWidth: 3,
  };
}
