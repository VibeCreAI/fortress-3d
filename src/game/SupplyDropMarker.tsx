import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { SUPPLY_DROP_DELIVERY_MS } from "./constants";
import type { SupplyDrop } from "./gameTypes";

type SupplyDropMarkerProps = {
  drop: SupplyDrop;
};

export function SupplyDropMarker({ drop }: SupplyDropMarkerProps) {
  const droneRef = useRef<THREE.Group>(null);
  const crateRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const rotorRefs = useRef<THREE.Mesh[]>([]);

  useFrame(() => {
    const elapsed = Date.now() - drop.createdAtMs;
    const progress = Math.min(1, Math.max(0, elapsed / SUPPLY_DROP_DELIVERY_MS));
    const baseY = drop.height;
    const hoverY = baseY + 6.9 + Math.sin(elapsed * 0.011) * 0.12;
    const ready = Date.now() >= drop.readyAtMs;

    let droneX = drop.position.x;
    let droneY = hoverY;
    let droneZ = drop.position.y;

    if (progress < 0.48) {
      const t = smooth(progress / 0.48);
      droneX = lerp(drop.position.x - 8, drop.position.x, t);
      droneY = lerp(baseY + 9.2, hoverY, t);
      droneZ = lerp(drop.position.y - 4.8, drop.position.y, t);
    } else if (progress > 0.76) {
      const t = smooth((progress - 0.76) / 0.24);
      droneX = lerp(drop.position.x, drop.position.x + 7.5, t);
      droneY = lerp(hoverY, baseY + 8.8, t);
      droneZ = lerp(drop.position.y, drop.position.y + 4.2, t);
    }

    if (droneRef.current) {
      droneRef.current.position.set(droneX, droneY, droneZ);
      droneRef.current.rotation.y = Math.sin(elapsed * 0.002) * 0.12;
      droneRef.current.visible = progress < 0.99;
    }

    const crateDropT = smooth(Math.min(1, Math.max(0, (progress - 0.2) / 0.56)));
    const crateHandoffT = smooth(Math.min(1, Math.max(0, (progress - 0.16) / 0.22)));
    const crateX = lerp(droneX, drop.position.x, crateHandoffT);
    const crateZ = lerp(droneZ, drop.position.y, crateHandoffT);
    const crateY = lerp(droneY - 1.2, baseY + 0.48, crateDropT);
    if (crateRef.current) {
      crateRef.current.position.set(crateX, crateY, crateZ);
      crateRef.current.rotation.y = elapsed * 0.0018;
      crateRef.current.scale.setScalar(ready ? 1 + Math.sin(elapsed * 0.008) * 0.035 : 1);
    }

    if (beamRef.current) {
      const length = Math.max(0.05, droneY - crateY - 0.7);
      beamRef.current.visible = progress > 0.18 && progress < 0.78;
      beamRef.current.position.set(crateX, crateY + length / 2 + 0.28, crateZ);
      beamRef.current.scale.set(1, length, 1);
    }

    if (glowRef.current) {
      glowRef.current.visible = ready;
      glowRef.current.scale.setScalar(1 + Math.sin(elapsed * 0.006) * 0.08);
    }

    for (const rotor of rotorRefs.current) {
      rotor.rotation.y += 0.38;
    }
  });

  return (
    <group>
      <group ref={droneRef} position={[drop.position.x - 8, drop.height + 9.2, drop.position.y - 4.8]}>
        <mesh castShadow>
          <boxGeometry args={[1.35, 0.35, 0.82]} />
          <meshStandardMaterial color="#263747" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh castShadow position={[0, -0.18, 0]}>
          <boxGeometry args={[0.72, 0.2, 0.5]} />
          <meshStandardMaterial color="#4c6a78" roughness={0.42} metalness={0.25} />
        </mesh>
        {[
          [-1.05, 0.06, -0.78],
          [1.05, 0.06, -0.78],
          [-1.05, 0.06, 0.78],
          [1.05, 0.06, 0.78],
        ].map(([x, y, z], index) => (
          <group key={index} position={[x, y, z]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.1, 0.1, 0.12, 10]} />
              <meshStandardMaterial color="#1c2934" roughness={0.4} />
            </mesh>
            <mesh
              ref={(node) => {
                if (node) rotorRefs.current[index] = node;
              }}
              position={[0, 0.08, 0]}
            >
              <boxGeometry args={[0.96, 0.025, 0.12]} />
              <meshBasicMaterial color="#d7f6ff" transparent opacity={0.72} />
            </mesh>
          </group>
        ))}
        <pointLight color="#b7f4ff" intensity={0.7} distance={5} />
      </group>

      <mesh ref={beamRef} visible={false}>
        <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
        <meshBasicMaterial color="#c6f7ff" transparent opacity={0.55} />
      </mesh>

      <group ref={crateRef} position={[drop.position.x - 8, drop.height + 8, drop.position.y - 4.8]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.72, 0.9]} />
          <meshStandardMaterial color="#f7bd38" emissive="#9a5f13" emissiveIntensity={0.18} roughness={0.52} />
        </mesh>
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry args={[0.98, 0.09, 0.98]} />
          <meshStandardMaterial color="#244150" roughness={0.48} />
        </mesh>
      </group>

      <mesh
        ref={glowRef}
        visible={false}
        position={[drop.position.x, drop.height + 0.04, drop.position.y]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.8, 1.22, 36]} />
        <meshBasicMaterial color="#ffdf74" transparent opacity={0.62} />
      </mesh>
    </group>
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smooth(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
