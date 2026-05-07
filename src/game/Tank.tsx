import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CANNON_BASE_FORWARD_OFFSET,
  CANNON_BASE_HEIGHT,
  CANNON_LENGTH,
} from "./constants";
import { degreesToRadians, signedAngleDelta } from "./gameMath";
import type { TankState, TurnOwner } from "./gameTypes";

type TankProps = {
  tank: TankState;
  owner: TurnOwner;
  active: boolean;
  animateMovement?: boolean;
};

const palette = {
  player: {
    body: "#2f7f74",
    bodyDark: "#1f4f50",
    accent: "#6ee7c8",
    cannon: "#17484c",
    tread: "#29313b",
    wheel: "#8fb8bd",
    glow: "#b8fff1",
  },
  computer: {
    body: "#c95a31",
    bodyDark: "#7b3328",
    accent: "#ffd166",
    cannon: "#5b2824",
    tread: "#332b2d",
    wheel: "#f1a05f",
    glow: "#ffe29b",
  },
};

function yawRotation(yaw: number) {
  return -degreesToRadians(yaw);
}

export function Tank({ tank, owner, active, animateMovement = false }: TankProps) {
  const colors = palette[owner];
  const turretYawDelta = signedAngleDelta(tank.bodyYaw, tank.turretYaw);
  const elevation = degreesToRadians(tank.elevation);
  const groupRef = useRef<THREE.Group>(null);
  const targetPositionRef = useRef(new THREE.Vector3(tank.position.x, tank.height, tank.position.y));

  useEffect(() => {
    targetPositionRef.current.set(tank.position.x, tank.height, tank.position.y);
    if (!animateMovement) {
      groupRef.current?.position.copy(targetPositionRef.current);
    }
  }, [animateMovement, tank.height, tank.position.x, tank.position.y]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (!animateMovement) {
      group.position.copy(targetPositionRef.current);
      return;
    }

    const blend = 1 - Math.exp(-delta * 7.5);
    group.position.lerp(targetPositionRef.current, blend);
  });

  return (
    <group
      ref={groupRef}
      position={[tank.position.x, tank.height, tank.position.y]}
      rotation={[0, yawRotation(tank.bodyYaw), 0]}
    >
      <group scale={active ? 1.03 : 1}>
        <mesh castShadow receiveShadow position={[0, 0.58, 0]}>
          <boxGeometry args={[2.65, 0.72, 1.35]} />
          <meshStandardMaterial color={colors.body} roughness={0.72} />
        </mesh>

        <mesh castShadow receiveShadow position={[-0.24, 0.96, 0]}>
          <boxGeometry args={[1.55, 0.5, 1.05]} />
          <meshStandardMaterial color={colors.bodyDark} roughness={0.7} />
        </mesh>

        <group rotation={[0, yawRotation(turretYawDelta), 0]}>
          <mesh castShadow receiveShadow position={[0.22, 1.28, 0]}>
            <boxGeometry args={[1.18, 0.46, 0.92]} />
            <meshStandardMaterial color={colors.body} roughness={0.66} />
          </mesh>

          <mesh castShadow receiveShadow position={[0.08, 1.54, 0]}>
            <boxGeometry args={[0.74, 0.18, 0.74]} />
            <meshStandardMaterial color={colors.accent} roughness={0.58} />
          </mesh>

          <group position={[CANNON_BASE_FORWARD_OFFSET, CANNON_BASE_HEIGHT, 0]} rotation={[0, 0, elevation]}>
            <mesh castShadow position={[CANNON_LENGTH / 2, 0, 0]}>
              <boxGeometry args={[CANNON_LENGTH, 0.26, 0.26]} />
              <meshStandardMaterial color={colors.cannon} roughness={0.56} />
            </mesh>
            <mesh castShadow position={[CANNON_LENGTH + 0.1, 0, 0]}>
              <boxGeometry args={[0.34, 0.38, 0.38]} />
              <meshStandardMaterial color={colors.accent} roughness={0.44} />
            </mesh>
          </group>
        </group>

        {[-0.86, 0, 0.86].map((offset) => (
          <mesh key={offset} castShadow receiveShadow position={[offset, 0.25, 0.72]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.18, 10]} />
            <meshStandardMaterial color={colors.wheel} roughness={0.82} />
          </mesh>
        ))}
        {[-0.86, 0, 0.86].map((offset) => (
          <mesh key={offset} castShadow receiveShadow position={[offset, 0.25, -0.72]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.18, 10]} />
            <meshStandardMaterial color={colors.wheel} roughness={0.82} />
          </mesh>
        ))}

        <mesh castShadow receiveShadow position={[0, 0.22, 0.72]}>
          <boxGeometry args={[2.85, 0.34, 0.28]} />
          <meshStandardMaterial color={colors.tread} roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.22, -0.72]}>
          <boxGeometry args={[2.85, 0.34, 0.28]} />
          <meshStandardMaterial color={colors.tread} roughness={0.9} />
        </mesh>

        <mesh castShadow position={[1.02, 0.7, 0]}>
          <boxGeometry args={[0.22, 0.28, 1.46]} />
          <meshStandardMaterial color={colors.accent} roughness={0.48} />
        </mesh>

        {active && (
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.75, 1.9, 32]} />
            <meshBasicMaterial color={colors.glow} transparent opacity={0.44} />
          </mesh>
        )}
      </group>
    </group>
  );
}
