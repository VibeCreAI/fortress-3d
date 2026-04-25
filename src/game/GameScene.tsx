import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CANNON_BASE_HEIGHT,
  FIRST_PERSON_DEFAULT_FOV,
} from "./constants";
import { Explosion } from "./Explosion";
import { Projectile } from "./Projectile";
import { Tank } from "./Tank";
import { Terrain } from "./Terrain";
import { TrajectoryPreview } from "./TrajectoryPreview";
import {
  forwardVector,
  getTankCenter,
  scaleVec3,
  terrainHeightAt,
  worldFromGround,
} from "./gameMath";
import type {
  CameraMode,
  ExplosionState,
  GamePhase,
  ProjectileLaunch,
  TankState,
  TerrainState,
  TurnOwner,
  Vec3,
  Wind,
} from "./gameTypes";

type GameSceneProps = {
  terrain: TerrainState;
  playerTank: TankState;
  computerTank: TankState;
  turnOwner: TurnOwner;
  phase: GamePhase;
  wind: Wind;
  cameraMode: CameraMode;
  zoomFov: number;
  thirdPersonDistance: number;
  aimInputActive: boolean;
  projectile: ProjectileLaunch | null;
  explosion: ExplosionState | null;
  onProjectileImpact: (position: Vec3) => void;
  onCanvasAimClick: (event: MouseEvent) => void;
};

function CameraRig({
  terrain,
  playerTank,
  computerTank,
  turnOwner,
  phase,
  cameraMode,
  zoomFov,
  thirdPersonDistance,
}: Pick<
  GameSceneProps,
  "terrain" | "playerTank" | "computerTank" | "turnOwner" | "phase" | "cameraMode" | "zoomFov" | "thirdPersonDistance"
>) {
  const { camera, size } = useThree();
  const lookTarget = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();

  useFrame(() => {
    const playerAiming = turnOwner === "player" && phase === "aiming";

    if (playerAiming && cameraMode === "firstPerson") {
      const base = worldFromGround(playerTank.position, playerTank.height + CANNON_BASE_HEIGHT + 0.18);
      const flatForward = forwardVector(playerTank.turretYaw, 0);
      const viewElevation = Math.min(22, Math.max(6, playerTank.elevation * 0.55));
      const aimForward = forwardVector(playerTank.turretYaw, viewElevation);
      const cameraOffset = scaleVec3(flatForward, -1.28);

      targetPosition.set(base.x + cameraOffset.x, base.y + 0.48, base.z + cameraOffset.z);
      lookTarget.set(base.x + aimForward.x * 26, base.y + aimForward.y * 26, base.z + aimForward.z * 26);
    } else if (playerAiming && cameraMode === "thirdPerson") {
      const tankCenter = getTankCenter(playerTank);
      const flatForward = forwardVector(playerTank.turretYaw, 0);
      const behind = scaleVec3(flatForward, -thirdPersonDistance);
      const side = new THREE.Vector3(-flatForward.z, 0, flatForward.x).multiplyScalar(2.4);
      const cameraHeight = clampThirdPersonHeight(thirdPersonDistance);

      targetPosition.set(
        tankCenter.x + behind.x + side.x,
        tankCenter.y + cameraHeight,
        tankCenter.z + behind.z + side.z,
      );
      lookTarget.set(
        tankCenter.x + flatForward.x * 10,
        tankCenter.y + 1.2 + playerTank.elevation * 0.025,
        tankCenter.z + flatForward.z * 10,
      );
    } else {
      const playerCenter = getTankCenter(playerTank);
      const computerCenter = getTankCenter(computerTank);
      const centerX = (playerCenter.x + computerCenter.x) / 2;
      const centerZ = (playerCenter.z + computerCenter.z) / 2;
      const centerHeight = Math.max(
        terrainHeightAt(terrain, playerTank.position),
        terrainHeightAt(terrain, computerTank.position),
      );
      const aspect = size.width / size.height;
      const narrowViewport = aspect < 0.75;

      targetPosition.set(centerX, centerHeight + (narrowViewport ? 24 : 17), centerZ + (narrowViewport ? 42 : 30));
      lookTarget.set(centerX, centerHeight + 1.4, centerZ);
    }

    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov =
        playerAiming && cameraMode === "firstPerson"
          ? zoomFov
          : playerAiming && cameraMode === "thirdPerson"
            ? 50
            : size.width / size.height < 0.75
              ? 68
              : 48;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * 0.18;
        camera.updateProjectionMatrix();
      }
    }

    camera.position.lerp(targetPosition, 0.24);
    camera.lookAt(lookTarget);
  });

  return null;
}

function clampThirdPersonHeight(distance: number) {
  return THREE.MathUtils.clamp(distance * 0.42, 4.8, 9.5);
}

export function GameScene({
  terrain,
  playerTank,
  computerTank,
  turnOwner,
  phase,
  wind,
  cameraMode,
  zoomFov,
  thirdPersonDistance,
  aimInputActive,
  projectile,
  explosion,
  onProjectileImpact,
  onCanvasAimClick,
}: GameSceneProps) {
  const showPlayerPreview = turnOwner === "player" && phase === "aiming" && !projectile;
  const showComputerPreview = turnOwner === "computer" && phase === "aiming" && !projectile;
  const projectileTarget = projectile?.owner === "player" ? computerTank : playerTank;

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 12, 28], fov: FIRST_PERSON_DEFAULT_FOV, near: 0.1, far: 130 }}
      gl={{ antialias: true }}
      onClick={(event) => onCanvasAimClick(event.nativeEvent)}
      className={aimInputActive ? "aim-locked-canvas" : undefined}
    >
      <color attach="background" args={["#9fdbff"]} />
      <fog attach="fog" args={["#9fdbff", 72, 128]} />
      <CameraRig
        terrain={terrain}
        playerTank={playerTank}
        computerTank={computerTank}
        turnOwner={turnOwner}
        phase={phase}
        cameraMode={cameraMode}
        zoomFov={zoomFov}
        thirdPersonDistance={thirdPersonDistance}
      />
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
      <Tank tank={playerTank} owner="player" active={turnOwner === "player" && phase === "aiming"} />
      <Tank tank={computerTank} owner="computer" active={turnOwner === "computer" && phase === "aiming"} />

      {showPlayerPreview && <TrajectoryPreview tank={playerTank} wind={wind} />}
      {showComputerPreview && <TrajectoryPreview tank={computerTank} wind={wind} color="#ffc36e" />}

      {projectile && projectileTarget && (
        <Projectile
          key={projectile.id}
          launch={projectile}
          wind={wind}
          terrain={terrain}
          targetTank={projectileTarget}
          onImpact={onProjectileImpact}
        />
      )}
      {explosion && <Explosion key={explosion.id} explosion={explosion} />}
    </Canvas>
  );
}
