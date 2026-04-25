import { useFrame } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { EXPLOSION_DURATION_MS, EXPLOSION_RADIUS } from "./constants";
import type { ExplosionState } from "./gameTypes";

type ExplosionProps = {
  explosion: ExplosionState;
};

const debrisColors = ["#ffdf7e", "#ff9f45", "#f7673c", "#54413a"];

export function Explosion({ explosion }: ExplosionProps) {
  const [age, setAge] = useState(0);
  const debris = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => {
        const angle = (index / 26) * Math.PI * 2;
        const lift = 0.6 + ((index * 7) % 10) / 10;
        const speed = 1.1 + ((index * 11) % 9) / 7;

        return {
          x: Math.cos(angle) * speed,
          y: lift,
          z: Math.sin(angle) * speed,
          color: debrisColors[index % debrisColors.length],
          size: 0.12 + ((index * 5) % 7) * 0.025,
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    setAge((value) => Math.min(1, value + (delta * 1000) / EXPLOSION_DURATION_MS));
  });

  const scale = 0.35 + age * EXPLOSION_RADIUS * 0.82;
  const opacity = Math.max(0, 0.46 * (1 - age));

  return (
    <group position={[explosion.position.x, explosion.position.y, explosion.position.z]}>
      <mesh scale={[scale, scale, scale]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <mesh scale={[scale * 0.62, scale * 0.62, scale * 0.62]}>
        <sphereGeometry args={[1, 18, 18]} />
        <meshBasicMaterial color="#ff6b3a" transparent opacity={opacity * 0.68} depthWrite={false} />
      </mesh>
      {debris.map((piece, index) => (
        <mesh
          key={index}
          castShadow
          position={[
            piece.x * age * 1.45,
            piece.y * Math.sin(age * Math.PI) + age * 0.8,
            piece.z * age * 1.45,
          ]}
          rotation={[age * index, age * 3, age * 2]}
        >
          <boxGeometry args={[piece.size, piece.size, piece.size]} />
          <meshStandardMaterial color={piece.color} roughness={0.72} />
        </mesh>
      ))}
      {explosion.damage > 0 && (
        <mesh position={[0, 2.2 + age * 0.4, 0]}>
          <sphereGeometry args={[0.16, 12, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={Math.max(0, 1 - age)} />
        </mesh>
      )}
    </group>
  );
}
