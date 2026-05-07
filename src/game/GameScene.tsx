import { useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, type MutableRefObject } from "react";
import * as THREE from "three";
import { Explosion } from "./Explosion";
import { Projectile } from "./Projectile";
import { SupplyDropMarker } from "./SupplyDropMarker";
import { Tank } from "./Tank";
import { Terrain } from "./Terrain";
import { TrajectoryPreview } from "./TrajectoryPreview";
import { WindFlag } from "./WindFlag";
import { terrainHeightAt } from "./gameMath";
import type {
  ExplosionState,
  GamePhase,
  ProjectileLaunch,
  SupplyDrop,
  TankState,
  TerrainState,
  TurnOwner,
  Vec3,
  WeaponType,
  Wind,
} from "./gameTypes";

type OmnCam = { yaw: number; pitch: number; panX: number; panZ: number; distance: number };

type GameSceneProps = {
  stage: number;
  terrain: TerrainState;
  playerTank: TankState;
  computerTanks: TankState[];
  activeEnemyIndex: number;
  turnOwner: TurnOwner;
  phase: GamePhase;
  wind: Wind;
  omniscientDistance: number;
  projectile: ProjectileLaunch | null;
  explosion: ExplosionState | null;
  supplyDrops: SupplyDrop[];
  playerPreviewWeapon: WeaponType;
  playerPreviewIgnoresWind: boolean;
  omnRef: MutableRefObject<OmnCam>;
  onProjectileImpact: (position: Vec3) => void;
};

function SkyBackground() {
  const texture = useTexture("/sky-backdrop.png");
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return <primitive attach="background" object={texture} />;
}

function CameraRig({
  terrain,
  omnRef,
}: Pick<GameSceneProps, "terrain" | "omnRef">) {
  const { camera, size } = useThree();

  useFrame(() => {
    const { yaw, pitch, panX, panZ, distance } = omnRef.current;
    const pitchRad = pitch * Math.PI / 180;
    const yawRad = yaw * Math.PI / 180;
    const panH = terrainHeightAt(terrain, { x: panX, y: panZ });

    camera.position.set(
      panX + distance * Math.sin(yawRad) * Math.cos(pitchRad),
      panH + 1.5 + distance * Math.sin(pitchRad),
      panZ + distance * Math.cos(yawRad) * Math.cos(pitchRad),
    );
    camera.lookAt(panX, panH + 1.5, panZ);

    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = size.width / size.height < 0.75 ? 58 : 50;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * 0.18;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

export function GameScene({
  terrain,
  playerTank,
  computerTanks,
  activeEnemyIndex,
  turnOwner,
  phase,
  wind,
  omnRef,
  projectile,
  explosion,
  supplyDrops,
  playerPreviewWeapon,
  playerPreviewIgnoresWind,
  onProjectileImpact,
}: GameSceneProps) {
  const showPlayerPreview = turnOwner === "player" && phase === "aiming" && !projectile;
  const showComputerPreview = turnOwner === "computer" && phase === "aiming" && !projectile;
  const activeComputerTank = computerTanks[activeEnemyIndex];
  const projectileTargets =
    projectile?.owner === "player" ? computerTanks : [playerTank];

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 38, 18], fov: 50, near: 0.1, far: 130 }}
      gl={{ antialias: true }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Suspense fallback={<color attach="background" args={["#9fdbff"]} />}>
        <SkyBackground />
      </Suspense>
      <fog attach="fog" args={["#9fdbff", 72, 128]} />
      <CameraRig terrain={terrain} omnRef={omnRef} />
      <hemisphereLight args={["#eaf7ff", "#a5734d", 1.12]} />
      <directionalLight
        castShadow
        position={[-9, 18, 10]}
        intensity={2.35}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-18}
      />
      <ambientLight intensity={0.2} />

      <Terrain terrain={terrain} />
      <WindFlag terrain={terrain} wind={wind} />
      {supplyDrops.map((drop) => (
        <SupplyDropMarker key={drop.id} drop={drop} />
      ))}
      <Tank tank={playerTank} owner="player" active={turnOwner === "player" && phase === "aiming"} />
      {computerTanks.map((tank, i) =>
        tank.hp > 0 ? (
          <Tank
            key={i}
            tank={tank}
            owner="computer"
            active={turnOwner === "computer" && phase === "aiming" && i === activeEnemyIndex}
          />
        ) : null,
      )}

      {showPlayerPreview && (
        <TrajectoryPreview
          tank={playerTank}
          wind={wind}
          weapon={playerPreviewWeapon}
          ignoresWind={playerPreviewIgnoresWind}
          targetTanks={computerTanks}
          color={previewColor(playerPreviewWeapon, playerPreviewIgnoresWind)}
        />
      )}
      {showComputerPreview && activeComputerTank && (
        <TrajectoryPreview tank={activeComputerTank} wind={wind} color="#ffc36e" />
      )}

      {projectile && (
        <Projectile
          key={projectile.id}
          launch={projectile}
          wind={wind}
          terrain={terrain}
          targetTanks={projectileTargets}
          onImpact={onProjectileImpact}
        />
      )}
      {explosion && <Explosion key={explosion.id} explosion={explosion} />}
    </Canvas>
  );
}

function previewColor(weapon: WeaponType, ignoresWind: boolean) {
  if (ignoresWind) return "#c6f7ff";
  if (weapon === "red") return "#ff8b7f";
  if (weapon === "earth") return "#c79962";
  if (weapon === "magnet") return "#9ef7ff";
  return "#fff3a3";
}
