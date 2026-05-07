import { useMemo } from "react";
import { cellCenter, terrainBottom, terrainHeightAt } from "./gameMath";
import type { TerrainState } from "./gameTypes";

type TerrainProps = {
  terrain: TerrainState;
};

const shrubs = [
  { x: -17, y: -9 },
  { x: -5, y: 8 },
  { x: 7, y: -8 },
  { x: 16, y: 9 },
];

const rocks = [
  { x: -15, y: 7, s: 0.52 },
  { x: -3, y: -7, s: 0.44 },
  { x: 10, y: 1, s: 0.48 },
  { x: 18, y: -4, s: 0.5 },
];

function heightColor(height: number) {
  if (height < -2.4) return "#5b6f4b";
  if (height < -0.8) return "#648356";
  if (height > 3.3) return "#86d37c";
  if (height > 2.1) return "#78c86f";
  if (height > 0.7) return "#69ba64";
  return "#5aa95b";
}

export function Terrain({ terrain }: TerrainProps) {
  const bottom = terrainBottom();
  const cells = useMemo(
    () =>
      terrain.heights.flatMap((row, rowIndex) =>
        row.map((height, columnIndex) => ({
          ...cellCenter(terrain, rowIndex, columnIndex),
          height,
          key: `${rowIndex}-${columnIndex}`,
        })),
      ),
    [terrain],
  );

  return (
    <group>
      {cells.map((cell) => {
        const columnHeight = Math.max(0.1, cell.height - bottom);
        return (
          <group key={cell.key}>
            <mesh castShadow receiveShadow position={[cell.x, bottom + columnHeight / 2, cell.y]}>
              <boxGeometry args={[terrain.cellSize * 0.94, columnHeight, terrain.cellSize * 0.94]} />
              <meshStandardMaterial color="#9a673d" roughness={0.94} />
            </mesh>
            <mesh castShadow receiveShadow position={[cell.x, cell.height + 0.035, cell.y]}>
              <boxGeometry args={[terrain.cellSize * 0.96, 0.07, terrain.cellSize * 0.96]} />
              <meshStandardMaterial color={heightColor(cell.height)} roughness={0.86} />
            </mesh>
          </group>
        );
      })}

      <mesh receiveShadow position={[0, bottom - 0.28, 0]}>
        <boxGeometry args={[terrain.width + 1, 0.45, terrain.depth + 1]} />
        <meshStandardMaterial color="#5f5852" roughness={0.96} />
      </mesh>

      {rocks.map((rock) => {
        const height = terrainHeightAt(terrain, { x: rock.x, y: rock.y });
        return (
          <group key={`${rock.x}-${rock.y}`} position={[rock.x, height + 0.16, rock.y]} scale={rock.s}>
            <mesh castShadow receiveShadow rotation={[0.2, 0.4, 0]}>
              <boxGeometry args={[1.1, 0.65, 0.85]} />
              <meshStandardMaterial color="#777d7a" roughness={0.93} />
            </mesh>
            <mesh castShadow receiveShadow position={[0.38, 0.26, -0.2]} rotation={[0.1, -0.2, 0.1]}>
              <boxGeometry args={[0.68, 0.55, 0.58]} />
              <meshStandardMaterial color="#8c918b" roughness={0.94} />
            </mesh>
          </group>
        );
      })}

      {shrubs.map((shrub) => {
        const height = terrainHeightAt(terrain, { x: shrub.x, y: shrub.y });
        return (
          <group key={`${shrub.x}-${shrub.y}`} position={[shrub.x, height, shrub.y]}>
            <mesh castShadow position={[0, 0.22, 0]}>
              <boxGeometry args={[0.25, 0.44, 0.25]} />
              <meshStandardMaterial color="#54704a" roughness={0.78} />
            </mesh>
            <mesh castShadow position={[0, 0.56, 0]}>
              <boxGeometry args={[0.78, 0.52, 0.78]} />
              <meshStandardMaterial color="#48a94f" roughness={0.72} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
