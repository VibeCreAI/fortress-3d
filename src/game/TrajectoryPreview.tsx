import { Line } from "@react-three/drei";
import { previewTrajectory } from "./gameMath";
import type { TankState, WeaponType, Wind } from "./gameTypes";

type TrajectoryPreviewProps = {
  tank: TankState;
  wind: Wind;
  weapon?: WeaponType;
  ignoresWind?: boolean;
  targetTanks?: TankState[];
  color?: string;
};

export function TrajectoryPreview({
  tank,
  wind,
  weapon = "base",
  ignoresWind = false,
  targetTanks = [],
  color = "#fff3a3",
}: TrajectoryPreviewProps) {
  const points = previewTrajectory(tank, wind, weapon, ignoresWind, targetTanks).map(
    (point) => [point.x, point.y, point.z] as [number, number, number],
  );

  return (
    <group>
      <Line points={points} color={color} lineWidth={4} />
      {points.filter((_, index) => index % 4 === 0).map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}
