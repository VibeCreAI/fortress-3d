import { useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Explosion } from "./Explosion";
import { Projectile } from "./Projectile";
import { SupplyDropMarker } from "./SupplyDropMarker";
import { Tank } from "./Tank";
import { Terrain } from "./Terrain";
import { TrajectoryPreview } from "./TrajectoryPreview";
import { WindFlag } from "./WindFlag";
import { WindParticles } from "./WindParticles";
import { SUPPLY_DROP_DELIVERY_MS } from "./constants";
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
type ProjectileFocus = { active: boolean; position: Vec3; velocity: Vec3 };

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

function easeCameraFov(camera: THREE.Camera, targetFov: number) {
  if (!(camera instanceof THREE.PerspectiveCamera) || Math.abs(camera.fov - targetFov) <= 0.05) {
    return;
  }
  camera.fov += (targetFov - camera.fov) * 0.18;
  camera.updateProjectionMatrix();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smooth(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function getActiveDeliveryDrop(supplyDrops: SupplyDrop[], now: number) {
  let activeDrop: SupplyDrop | null = null;
  let activeCreatedAt = -Infinity;

  for (const drop of supplyDrops) {
    const progress = (now - drop.createdAtMs) / SUPPLY_DROP_DELIVERY_MS;
    if (progress >= 0 && progress < 0.99 && drop.createdAtMs > activeCreatedAt) {
      activeDrop = drop;
      activeCreatedAt = drop.createdAtMs;
    }
  }

  return activeDrop;
}

function CameraRig({
  terrain,
  omnRef,
  projectile,
  supplyDrops,
  projectileFocusRef,
}: Pick<GameSceneProps, "terrain" | "omnRef" | "projectile" | "supplyDrops"> & {
  projectileFocusRef: MutableRefObject<ProjectileFocus>;
}) {
  const { camera, size } = useThree();
  const returningFromCinematicRef = useRef(false);
  const lookAtRef = useRef(new THREE.Vector3());
  const projectilePositionRef = useRef(new THREE.Vector3());
  const velocityRef = useRef(new THREE.Vector3());
  const forwardRef = useRef(new THREE.Vector3(1, 0, 0));
  const sideRef = useRef(new THREE.Vector3(1, 0, 0));
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetLookRef = useRef(new THREE.Vector3());
  const dronePositionRef = useRef(new THREE.Vector3());
  const droneLookRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const baseFov = size.width / size.height < 0.75 ? 58 : 50;

    const activeProjectile = projectile;
    const focus = projectileFocusRef.current;
    if (activeProjectile && focus.active) {
      const projectilePosition = projectilePositionRef.current.set(
        focus.position.x,
        focus.position.y,
        focus.position.z,
      );
      const velocity = velocityRef.current.set(focus.velocity.x, focus.velocity.y, focus.velocity.z);
      const speed = velocity.length();
      const forward = forwardRef.current;
      if (speed > 0.01) {
        forward.copy(velocity).multiplyScalar(1 / speed);
      } else {
        forward.set(1, 0, 0);
      }
      const side = sideRef.current.set(-forward.z, 0, forward.x);
      if (side.lengthSq() <= 0.0001) {
        side.set(1, 0, 0);
      } else {
        side.normalize();
      }

      if (!returningFromCinematicRef.current) {
        lookAtRef.current.copy(projectilePosition);
      }
      returningFromCinematicRef.current = true;

      const sideSign = activeProjectile.owner === "player" ? 1 : -1;
      const targetPosition = targetPositionRef.current
        .copy(projectilePosition)
        .addScaledVector(forward, -13.5)
        .addScaledVector(side, sideSign * 4.8);
      targetPosition.y += 4.4 + Math.min(2.8, speed * 0.03);
      const lookTarget = targetLookRef.current.copy(projectilePosition).addScaledVector(forward, 1.8);

      camera.position.lerp(targetPosition, 0.2);
      lookAtRef.current.lerp(lookTarget, 0.32);
      camera.lookAt(lookAtRef.current);
      easeCameraFov(camera, baseFov + 8);
      return;
    }

    const now = Date.now();
    const activeDeliveryDrop = getActiveDeliveryDrop(supplyDrops, now);
    if (activeDeliveryDrop) {
      const elapsed = now - activeDeliveryDrop.createdAtMs;
      const progress = Math.min(1, Math.max(0, elapsed / SUPPLY_DROP_DELIVERY_MS));
      const baseY = activeDeliveryDrop.height;
      const hoverY = baseY + 6.9 + Math.sin(elapsed * 0.011) * 0.12;
      let droneX = activeDeliveryDrop.position.x;
      let droneY = hoverY;
      let droneZ = activeDeliveryDrop.position.y;

      if (progress < 0.48) {
        const t = smooth(progress / 0.48);
        droneX = lerp(activeDeliveryDrop.position.x - 8, activeDeliveryDrop.position.x, t);
        droneY = lerp(baseY + 9.2, hoverY, t);
        droneZ = lerp(activeDeliveryDrop.position.y - 4.8, activeDeliveryDrop.position.y, t);
      } else if (progress > 0.76) {
        const t = smooth((progress - 0.76) / 0.24);
        droneX = lerp(activeDeliveryDrop.position.x, activeDeliveryDrop.position.x + 7.5, t);
        droneY = lerp(hoverY, baseY + 8.8, t);
        droneZ = lerp(activeDeliveryDrop.position.y, activeDeliveryDrop.position.y + 4.2, t);
      }

      const dronePosition = dronePositionRef.current.set(droneX, droneY, droneZ);
      const lookTarget = droneLookRef.current.set(
        lerp(droneX, activeDeliveryDrop.position.x, 0.4),
        lerp(droneY, baseY + 1.0, 0.32),
        lerp(droneZ, activeDeliveryDrop.position.y, 0.4),
      );
      const targetPosition = targetPositionRef.current.set(droneX - 6.6, droneY + 2.8, droneZ + 7.2);

      if (!returningFromCinematicRef.current) {
        lookAtRef.current.copy(dronePosition);
      }
      returningFromCinematicRef.current = true;
      camera.position.lerp(targetPosition, 0.16);
      lookAtRef.current.lerp(lookTarget, 0.24);
      camera.lookAt(lookAtRef.current);
      easeCameraFov(camera, baseFov + 6);
      return;
    }

    const { yaw, pitch, panX, panZ, distance } = omnRef.current;
    const pitchRad = pitch * Math.PI / 180;
    const yawRad = yaw * Math.PI / 180;
    const panH = terrainHeightAt(terrain, { x: panX, y: panZ });
    const targetPosition = targetPositionRef.current.set(
      panX + distance * Math.sin(yawRad) * Math.cos(pitchRad),
      panH + 1.5 + distance * Math.sin(pitchRad),
      panZ + distance * Math.cos(yawRad) * Math.cos(pitchRad),
    );
    const lookTarget = targetLookRef.current.set(panX, panH + 1.5, panZ);

    if (returningFromCinematicRef.current) {
      camera.position.lerp(targetPosition, 0.14);
      lookAtRef.current.lerp(lookTarget, 0.18);
      camera.lookAt(lookAtRef.current);
      if (camera.position.distanceTo(targetPosition) < 0.16 && lookAtRef.current.distanceTo(lookTarget) < 0.16) {
        returningFromCinematicRef.current = false;
        camera.position.copy(targetPosition);
        lookAtRef.current.copy(lookTarget);
      }
    } else {
      camera.position.copy(targetPosition);
      lookAtRef.current.copy(lookTarget);
      camera.lookAt(lookTarget);
    }
    easeCameraFov(camera, baseFov);
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
  const projectileFocusRef = useRef<ProjectileFocus>({
    active: false,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  });
  const handleProjectileFlight = useCallback((position: Vec3, velocity: Vec3) => {
    const focus = projectileFocusRef.current;
    focus.active = true;
    focus.position.x = position.x;
    focus.position.y = position.y;
    focus.position.z = position.z;
    focus.velocity.x = velocity.x;
    focus.velocity.y = velocity.y;
    focus.velocity.z = velocity.z;
  }, []);

  useEffect(() => {
    if (!projectile) {
      projectileFocusRef.current.active = false;
    }
  }, [projectile]);

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
      <CameraRig
        terrain={terrain}
        omnRef={omnRef}
        projectile={projectile}
        supplyDrops={supplyDrops}
        projectileFocusRef={projectileFocusRef}
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
      <WindFlag terrain={terrain} wind={wind} />
      <WindParticles terrain={terrain} wind={wind} />
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
            animateMovement
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
          onFlightPosition={handleProjectileFlight}
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
