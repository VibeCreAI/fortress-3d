import { Line } from "@react-three/drei";
import { previewTrajectory } from "./gameMath";
import type { TankState, Wind } from "./gameTypes";

type TrajectoryPreviewProps = {
  tank: TankState;
  wind: Wind;
  color?: string;
};

export function TrajectoryPreview({ tank, wind, color = "#fff3a3" }: TrajectoryPreviewProps) {
  const points = previewTrajectory(tank, wind).map((point) => [point.x, point.y, point.z] as [number, number, number]);

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
