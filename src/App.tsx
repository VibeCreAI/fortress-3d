import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseComputerPlan } from "./game/aiLogic";
import {
  EXPLOSION_DURATION_MS,
  DEFAULT_ELEVATION,
  KEYBOARD_AIM_ELEVATION_STEP,
  KEYBOARD_AIM_YAW_STEP,
  MAX_ELEVATION,
  MAX_POWER,
  MIN_ELEVATION,
  MIN_POWER,
  MOVEMENT_PER_TURN,
  OMNISCIENT_DEFAULT_DISTANCE,
  OMNISCIENT_MAX_DISTANCE,
  OMNISCIENT_MIN_DISTANCE,
  PLAYER_MOVE_STEP,
  REWARD_HEAL_AMOUNT,
  REWARD_MOVE_BONUS,
  STAGE_CLEAR_DELAY_MS,
  STARTING_HP,
  SUPPLY_DROP_AVOID_RADIUS,
  SUPPLY_DROP_CHANCE,
  SUPPLY_DROP_DELIVERY_MS,
  SUPPLY_DROP_MAX_DISTANCE,
  SUPPLY_DROP_MIN_DISTANCE,
  SUPPLY_DROP_PICKUP_RADIUS,
  getStageConfig,
} from "./game/constants";
import { GameScene } from "./game/GameScene";
import {
  applyExplosionCrater,
  calculateExplosionDamage,
  canMoveTankTo,
  clamp,
  createLaunchVelocity,
  createStageBlueprint,
  createWind,
  getCannonTip,
  gravityDamageMultiplier,
  groundDistance,
  groundFromWorld,
  normalizeDegrees,
  randomBetween,
  snapTankToTerrain,
  terrainHeightAt,
  yawTo,
} from "./game/gameMath";
import type {
  ComputerPlan,
  ExplosionState,
  GamePhase,
  GroundPos,
  ProjectileImpactProfile,
  ProjectileLaunch,
  RewardChoice,
  RewardItemType,
  SupplyDrop,
  TankState,
  TerrainState,
  TurnOwner,
  Vec3,
  WeaponType,
} from "./game/gameTypes";
import { GameHUD, type SavedCameraView } from "./ui/GameHUD";

function makeTank(
  terrain: TerrainState,
  position: GroundPos,
  target: GroundPos,
  hp: number = STARTING_HP,
  maxHp: number = hp,
): TankState {
  const yaw = yawTo(position, target);

  return {
    position,
    height: terrainHeightAt(terrain, position),
    hp,
    maxHp,
    bodyYaw: yaw,
    turretYaw: yaw,
    elevation: DEFAULT_ELEVATION,
    power: 62,
    movementRemaining: MOVEMENT_PER_TURN,
  };
}

type StageState = {
  stage: number;
  terrain: TerrainState;
  playerTank: TankState;
  computerTanks: TankState[];
};

function buildStage(stage: number, prevPlayerHp?: number): StageState {
  const blueprint = createStageBlueprint(stage);
  const config = getStageConfig(stage);
  const playerTank = makeTank(
    blueprint.terrain,
    blueprint.playerStart,
    blueprint.enemyStarts[0],
    prevPlayerHp ?? STARTING_HP,
    STARTING_HP,
  );
  const computerTanks = blueprint.enemyStarts.map((start) =>
    makeTank(blueprint.terrain, start, blueprint.playerStart, config.enemyHp, config.enemyHp),
  );
  return {
    stage,
    terrain: blueprint.terrain,
    playerTank,
    computerTanks,
  };
}

const REWARD_POOL: RewardItemType[] = [
  "heal",
  "moveBoost",
  "windShield",
  "redShot",
  "earthShot",
  "magnetShot",
];

function createRewardChoices(firstId: number): RewardChoice[] {
  return [...REWARD_POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((item, index) => ({ id: firstId + index, item }));
}

function weaponForReward(item: RewardItemType): WeaponType | null {
  if (item === "redShot") return "red";
  if (item === "earthShot") return "earth";
  if (item === "magnetShot") return "magnet";
  return null;
}

function createSupplyDropNearPlayer(
  id: number,
  terrain: TerrainState,
  player: TankState,
  computerTanks: TankState[],
  existingDrops: SupplyDrop[],
): SupplyDrop | null {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const distance = randomBetween(SUPPLY_DROP_MIN_DISTANCE, SUPPLY_DROP_MAX_DISTANCE);
    const desired: GroundPos = {
      x: player.position.x + Math.cos(angle) * distance,
      y: player.position.y + Math.sin(angle) * distance,
    };
    const move = canMoveTankTo(player, terrain, desired, computerTanks);

    if (!move.allowed) continue;
    const clearsExistingDrops = existingDrops.every(
      (drop) => groundDistance(move.position, drop.position) >= SUPPLY_DROP_AVOID_RADIUS,
    );
    if (!clearsExistingDrops) continue;

    const createdAtMs = Date.now();
    return {
      id,
      position: move.position,
      height: move.height,
      createdAtMs,
      readyAtMs: createdAtMs + SUPPLY_DROP_DELIVERY_MS,
    };
  }

  return null;
}

export default function App() {
  const initial = useMemo(() => buildStage(1), []);
  const [stage, setStage] = useState<number>(initial.stage);
  const [terrain, setTerrain] = useState<TerrainState>(initial.terrain);
  const [playerTank, setPlayerTank] = useState<TankState>(initial.playerTank);
  const [computerTanks, setComputerTanks] = useState<TankState[]>(initial.computerTanks);
  const [turnOwner, setTurnOwner] = useState<TurnOwner>("player");
  const [phase, setPhase] = useState<GamePhase>("aiming");
  const [wind, setWind] = useState(() => createWind());
  const [projectile, setProjectile] = useState<ProjectileLaunch | null>(null);
  const [explosion, setExplosion] = useState<ExplosionState | null>(null);
  const [winner, setWinner] = useState<TurnOwner | null>(null);
  const [pendingTurn, setPendingTurn] = useState<TurnOwner | null>(null);
  const [pendingEnemyIndex, setPendingEnemyIndex] = useState<number>(0);
  const [activeEnemyIndex, setActiveEnemyIndex] = useState<number>(0);
  const [computerPlan, setComputerPlan] = useState<ComputerPlan | null>(null);
  const [omniscientDistance, setOmniscientDistance] = useState(OMNISCIENT_DEFAULT_DISTANCE);
  const [supplyDrops, setSupplyDrops] = useState<SupplyDrop[]>([]);
  const [pendingRewardChoices, setPendingRewardChoices] = useState<RewardChoice[] | null>(null);
  const [queuedWeapon, setQueuedWeapon] = useState<WeaponType>("base");
  const [queuedWindIgnoreShots, setQueuedWindIgnoreShots] = useState(0);
  const [playerMovementBudget, setPlayerMovementBudget] = useState(MOVEMENT_PER_TURN);
  const projectileIdRef = useRef(1);
  const explosionIdRef = useRef(1);
  const supplyDropIdRef = useRef(1);
  const rewardChoiceIdRef = useRef(1);

  const canPlayerAct =
    turnOwner === "player" && phase === "aiming" && !winner && !pendingRewardChoices;

  const omnRef = useRef({ yaw: 10, pitch: 60, panX: 0, panZ: 0, distance: OMNISCIENT_DEFAULT_DISTANCE });
  const cameraSmoothRef = useRef(false);
  const cameraDragModeRef = useRef<"rotate" | "pan" | null>(null);
  const activeTouchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const touchGestureRef = useRef<{
    mode: "rotate" | "pan" | null;
    x: number;
    y: number;
  }>({ mode: null, x: 0, y: 0 });
  omnRef.current.distance = omniscientDistance;

  const otherTanksFor = useCallback(
    (owner: TurnOwner, index: number = 0): TankState[] => {
      if (owner === "player") return computerTanks;
      const others: TankState[] = [playerTank];
      computerTanks.forEach((t, i) => {
        if (i !== index) others.push(t);
      });
      return others;
    },
    [computerTanks, playerTank],
  );

  const beginTurn = useCallback(
    (owner: TurnOwner, enemyIndex: number = 0) => {
      setTurnOwner(owner);
      setWind(createWind());
      setProjectile(null);
      setExplosion(null);
      setPendingTurn(null);
      setComputerPlan(null);
      setActiveEnemyIndex(enemyIndex);

      if (owner === "player") {
        setPlayerMovementBudget(MOVEMENT_PER_TURN);
        setPlayerTank((tank) =>
          snapTankToTerrain({ ...tank, movementRemaining: MOVEMENT_PER_TURN }, terrain),
        );
        setPhase("aiming");
      } else {
        setPlayerMovementBudget(MOVEMENT_PER_TURN);
        setComputerTanks((tanks) =>
          tanks.map((t, i) =>
            i === enemyIndex
              ? snapTankToTerrain({ ...t, movementRemaining: MOVEMENT_PER_TURN }, terrain)
              : t,
          ),
        );
        setPhase("turnTransition");
      }
    },
    [terrain],
  );

  const startStage = useCallback((nextStage: number, carriedPlayerHp?: number) => {
    const built = buildStage(nextStage, carriedPlayerHp);
    setStage(built.stage);
    setTerrain(built.terrain);
    setPlayerTank(built.playerTank);
    setComputerTanks(built.computerTanks);
    setTurnOwner("player");
    setPhase("aiming");
    setWind(createWind());
    setProjectile(null);
    setExplosion(null);
    setWinner(null);
    setPendingTurn(null);
    setActiveEnemyIndex(0);
    setPendingEnemyIndex(0);
    setComputerPlan(null);
    setSupplyDrops([]);
    setPendingRewardChoices(null);
    setQueuedWeapon("base");
    setQueuedWindIgnoreShots(0);
    setPlayerMovementBudget(MOVEMENT_PER_TURN);
    omnRef.current.panX = 0;
    omnRef.current.panZ = 0;
  }, []);

  const resetGame = useCallback(() => {
    startStage(1);
    setOmniscientDistance(OMNISCIENT_DEFAULT_DISTANCE);
    omnRef.current.yaw = 10;
    omnRef.current.pitch = 60;
    omnRef.current.distance = OMNISCIENT_DEFAULT_DISTANCE;
    projectileIdRef.current = 1;
    explosionIdRef.current = 1;
    supplyDropIdRef.current = 1;
    rewardChoiceIdRef.current = 1;
  }, [startStage]);

  const fireTank = useCallback(
    (owner: TurnOwner, overrideTank?: TankState, enemyIndex?: number) => {
      const shooter =
        overrideTank ??
        (owner === "player" ? playerTank : computerTanks[enemyIndex ?? activeEnemyIndex]);
      const weapon: WeaponType = owner === "player" ? queuedWeapon : "base";
      const ignoresWind = owner === "player" && queuedWindIgnoreShots > 0;

      setProjectile({
        id: projectileIdRef.current,
        owner,
        start: getCannonTip(shooter),
        velocity: createLaunchVelocity(shooter),
        weapon,
        ignoresWind,
      });
      projectileIdRef.current += 1;
      if (owner === "player") {
        setQueuedWeapon("base");
        if (ignoresWind) {
          setQueuedWindIgnoreShots((shots) => Math.max(0, shots - 1));
        }
      }
      setExplosion(null);
      setPhase("projectileFlying");
    },
    [activeEnemyIndex, computerTanks, playerTank, queuedWeapon, queuedWindIgnoreShots],
  );

  const movePlayer = useCallback(
    (xDirection: number, yDirection: number) => {
      if (!canPlayerAct) return;

      setPlayerTank((tank) => {
        const magnitude = Math.hypot(xDirection, yDirection);
        if (magnitude <= 0 || tank.movementRemaining <= 0) return tank;

        const usableMovement = Math.min(PLAYER_MOVE_STEP, tank.movementRemaining);
        const desiredPosition = {
          x: tank.position.x + (xDirection / magnitude) * usableMovement,
          y: tank.position.y + (yDirection / magnitude) * usableMovement,
        };
        const move = canMoveTankTo(tank, terrain, desiredPosition, computerTanks);

        if (!move.allowed) return tank;

        const movementUsed = groundDistance(tank.position, move.position);
        const nextBodyYaw = movementUsed > 0.02 ? yawTo(tank.position, move.position) : tank.bodyYaw;

        return {
          ...tank,
          position: move.position,
          height: move.height,
          bodyYaw: nextBodyYaw,
          movementRemaining: Math.max(0, tank.movementRemaining - movementUsed),
        };
      });
    },
    [canPlayerAct, computerTanks, terrain],
  );

  const adjustElevation = useCallback(
    (delta: number) => {
      if (!canPlayerAct) return;
      setPlayerTank((tank) => ({
        ...tank,
        elevation: clamp(tank.elevation + delta, MIN_ELEVATION, MAX_ELEVATION),
      }));
    },
    [canPlayerAct],
  );

  const setElevationValue = useCallback(
    (value: number) => {
      if (!canPlayerAct) return;
      setPlayerTank((tank) => ({
        ...tank,
        elevation: clamp(value, MIN_ELEVATION, MAX_ELEVATION),
      }));
    },
    [canPlayerAct],
  );

  const adjustTurretYaw = useCallback(
    (delta: number) => {
      if (!canPlayerAct) return;
      setPlayerTank((tank) => ({
        ...tank,
        turretYaw: normalizeDegrees(tank.turretYaw + delta),
      }));
    },
    [canPlayerAct],
  );

  const setTurretYawValue = useCallback(
    (value: number) => {
      if (!canPlayerAct) return;
      setPlayerTank((tank) => ({
        ...tank,
        turretYaw: normalizeDegrees(value),
      }));
    },
    [canPlayerAct],
  );

  const adjustPower = useCallback(
    (delta: number) => {
      if (!canPlayerAct) return;
      setPlayerTank((tank) => ({
        ...tank,
        power: clamp(tank.power + delta, MIN_POWER, MAX_POWER),
      }));
    },
    [canPlayerAct],
  );

  const setPowerValue = useCallback(
    (value: number) => {
      if (!canPlayerAct) return;
      setPlayerTank((tank) => ({
        ...tank,
        power: clamp(value, MIN_POWER, MAX_POWER),
      }));
    },
    [canPlayerAct],
  );

  const movePlayerCameraRelative = useCallback(
    (xDirection: number, yDirection: number) => {
      const yaw = (omnRef.current.yaw * Math.PI) / 180;
      movePlayer(
        xDirection * Math.cos(yaw) - yDirection * Math.sin(yaw),
        -xDirection * Math.sin(yaw) - yDirection * Math.cos(yaw),
      );
    },
    [movePlayer],
  );

  const firePlayer = useCallback(() => {
    if (!canPlayerAct) return;
    fireTank("player");
  }, [canPlayerAct, fireTank]);

  const resolveProjectileImpact = useCallback(
    (impact: Vec3, impactProfile: ProjectileImpactProfile) => {
      if (!projectile) return;

      const owner = projectile.owner;
      const weapon = projectile.weapon;
      const gravityMultiplier = gravityDamageMultiplier(impactProfile);
      const craterCenter = groundFromWorld(impact);
      const nextTerrain = applyExplosionCrater(terrain, craterCenter, weapon);
      setTerrain(nextTerrain);

      let playerDamageTaken = 0;
      let totalEnemyDamage = 0;

      // Damage the opposing side(s). Friendly fire is ignored.
      if (owner === "player") {
        const updated = computerTanks.map((t) => {
          if (t.hp <= 0) return t;
          const dmg = calculateExplosionDamage(impact, t, weapon, gravityMultiplier);
          if (dmg > 0) totalEnemyDamage += dmg;
          return snapTankToTerrain({ ...t, hp: Math.max(0, t.hp - dmg) }, nextTerrain);
        });
        setComputerTanks(updated.map((t) => snapTankToTerrain(t, nextTerrain)));
        setPlayerTank((tank) => snapTankToTerrain(tank, nextTerrain));
      } else {
        const dmg = calculateExplosionDamage(impact, playerTank, weapon, gravityMultiplier);
        playerDamageTaken = dmg;
        setPlayerTank((tank) =>
          snapTankToTerrain({ ...tank, hp: Math.max(0, tank.hp - dmg) }, nextTerrain),
        );
        setComputerTanks((tanks) => tanks.map((t) => snapTankToTerrain(t, nextTerrain)));
      }

      const damageShown = owner === "player" ? totalEnemyDamage : playerDamageTaken;
      const target: TurnOwner = owner === "player" ? "computer" : "player";

      setProjectile(null);
      setExplosion({
        id: explosionIdRef.current,
        owner,
        position: impact,
        damage: damageShown,
        target,
        weapon,
        gravityMultiplier,
      });
      explosionIdRef.current += 1;

      // Decide what comes next once explosion finishes (handled by effect).
      // Compute the prospective post-impact state to choose the next phase.
      const postPlayerHp = Math.max(0, playerTank.hp - playerDamageTaken);
      let aliveAfter: { tank: TankState; index: number }[] = [];
      if (owner === "player") {
        aliveAfter = computerTanks
          .map((t, i) => ({ tank: t, index: i }))
          .filter(({ tank }) => {
            const dmg = calculateExplosionDamage(impact, tank, weapon, gravityMultiplier);
            return tank.hp - dmg > 0;
          });
      } else {
        aliveAfter = computerTanks
          .map((t, i) => ({ tank: t, index: i }))
          .filter(({ tank }) => tank.hp > 0);
      }

      const playerDead = postPlayerHp <= 0;
      const allEnemiesDead = aliveAfter.length === 0;

      if (
        damageShown > 0 &&
        !playerDead &&
        !allEnemiesDead &&
        Math.random() < SUPPLY_DROP_CHANCE
      ) {
        const postPlayerTank = snapTankToTerrain(
          { ...playerTank, hp: postPlayerHp },
          nextTerrain,
        );
        const drop = createSupplyDropNearPlayer(
          supplyDropIdRef.current,
          nextTerrain,
          postPlayerTank,
          computerTanks,
          supplyDrops,
        );
        if (drop) {
          supplyDropIdRef.current += 1;
          setSupplyDrops((drops) => [...drops, drop]);
        }
      }

      if (playerDead) {
        setWinner("computer");
        setPendingTurn(null);
      } else if (allEnemiesDead) {
        setWinner(null); // stage clear, game continues
        setPendingTurn(null);
      } else if (owner === "player") {
        // Computer turn next, starting from the first surviving enemy
        setPendingTurn("computer");
        setPendingEnemyIndex(aliveAfter[0].index);
      } else {
        // Find next alive enemy after activeEnemyIndex; if none, player turn
        const nextAlive = aliveAfter.find(({ index }) => index > activeEnemyIndex);
        if (nextAlive) {
          setPendingTurn("computer");
          setPendingEnemyIndex(nextAlive.index);
        } else {
          setPendingTurn("player");
          setPendingEnemyIndex(0);
        }
      }

      setPhase("exploding");
    },
    [activeEnemyIndex, computerTanks, playerTank, projectile, supplyDrops, terrain],
  );

  useEffect(() => {
    if (turnOwner !== "player" || phase !== "aiming" || winner || pendingRewardChoices) {
      return;
    }

    const now = Date.now();
    const nearbyDrops = supplyDrops.filter(
      (drop) => groundDistance(playerTank.position, drop.position) <= SUPPLY_DROP_PICKUP_RADIUS,
    );
    const readyDrops = nearbyDrops
      .filter(
        (drop) => now >= drop.readyAtMs,
      )
      .sort(
        (a, b) =>
          groundDistance(playerTank.position, a.position) -
          groundDistance(playerTank.position, b.position),
      );

    const collected = readyDrops[0];
    if (!collected) {
      const nextReadyAt = nearbyDrops
        .filter((drop) => drop.readyAtMs > now)
        .reduce((soonest, drop) => Math.min(soonest, drop.readyAtMs), Number.POSITIVE_INFINITY);
      if (Number.isFinite(nextReadyAt)) {
        const timer = window.setTimeout(() => {
          setSupplyDrops((drops) => drops.slice());
        }, Math.max(0, nextReadyAt - now + 30));
        return () => window.clearTimeout(timer);
      }
      return;
    }

    const choices = createRewardChoices(rewardChoiceIdRef.current);
    rewardChoiceIdRef.current += choices.length;
    setSupplyDrops((drops) => drops.filter((drop) => drop.id !== collected.id));
    setPendingRewardChoices(choices);
  }, [pendingRewardChoices, phase, playerTank.position, supplyDrops, turnOwner, winner]);

  const chooseReward = useCallback(
    (item: RewardItemType) => {
      if (!pendingRewardChoices?.some((choice) => choice.item === item)) return;

      if (item === "heal") {
        setPlayerTank((tank) => ({
          ...tank,
          hp: Math.min(tank.maxHp, tank.hp + REWARD_HEAL_AMOUNT),
        }));
      } else if (item === "moveBoost") {
        setPlayerMovementBudget((budget) => budget + REWARD_MOVE_BONUS);
        setPlayerTank((tank) => ({
          ...tank,
          movementRemaining: tank.movementRemaining + REWARD_MOVE_BONUS,
        }));
      } else if (item === "windShield") {
        setQueuedWindIgnoreShots((shots) => shots + 1);
      } else {
        const weapon = weaponForReward(item);
        if (weapon) {
          setQueuedWeapon(weapon);
        }
      }

      setPendingRewardChoices(null);
    },
    [pendingRewardChoices],
  );

  const panCameraByScreenDelta = useCallback((xDelta: number, yDelta: number) => {
    const yawRad = (omnRef.current.yaw * Math.PI) / 180;
    const speed = omnRef.current.distance * 0.006;
    omnRef.current.panX +=
      (Math.cos(yawRad) * xDelta + Math.sin(yawRad) * yDelta) * speed;
    omnRef.current.panZ +=
      (-Math.sin(yawRad) * xDelta + Math.cos(yawRad) * yDelta) * speed;
  }, []);

  const setCameraZoomValue = useCallback((value: number) => {
    const next = clamp(value, OMNISCIENT_MIN_DISTANCE, OMNISCIENT_MAX_DISTANCE);
    omnRef.current.distance = next;
    setOmniscientDistance(next);
  }, []);

  const adjustCameraZoom = useCallback((delta: number) => {
    setOmniscientDistance((value) => {
      const next = clamp(value + delta, OMNISCIENT_MIN_DISTANCE, OMNISCIENT_MAX_DISTANCE);
      omnRef.current.distance = next;
      return next;
    });
  }, []);

  const applySavedView = useCallback(
    (view: SavedCameraView) => {
      const aliveEnemies = computerTanks.filter((t) => t.hp > 0);
      const points: GroundPos[] = [
        { x: playerTank.position.x, y: playerTank.position.y },
        ...aliveEnemies.map((t) => ({ x: t.position.x, y: t.position.y })),
      ];
      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const midpoint: GroundPos = {
        x: sumX / points.length,
        y: sumY / points.length,
      };

      let yawDeg = omnRef.current.yaw;
      let pitchDeg = omnRef.current.pitch;
      let nextDistance = omnRef.current.distance;
      let nextPanX = omnRef.current.panX;
      let nextPanZ = omnRef.current.panZ;

      switch (view) {
        case "player": {
          let targetX = playerTank.position.x;
          let targetY = playerTank.position.y;
          let nearestDist = Infinity;
          let foundEnemy = false;
          for (const enemy of computerTanks) {
            if (enemy.hp <= 0) continue;
            const d = Math.hypot(
              enemy.position.x - playerTank.position.x,
              enemy.position.y - playerTank.position.y,
            );
            if (d < nearestDist) {
              nearestDist = d;
              targetX = enemy.position.x;
              targetY = enemy.position.y;
              foundEnemy = true;
            }
          }
          if (!foundEnemy) {
            const yawRad = (playerTank.bodyYaw * Math.PI) / 180;
            targetX = playerTank.position.x + Math.cos(yawRad) * 10;
            targetY = playerTank.position.y + Math.sin(yawRad) * 10;
          }
          const dirX = targetX - playerTank.position.x;
          const dirY = targetY - playerTank.position.y;
          const mag = Math.hypot(dirX, dirY) || 1;
          const fwdX = dirX / mag;
          const fwdY = dirY / mag;
          yawDeg = (Math.atan2(-fwdX, -fwdY) * 180) / Math.PI;
          pitchDeg = 22;
          nextPanX = (playerTank.position.x + targetX) / 2;
          nextPanZ = (playerTank.position.y + targetY) / 2;
          const horizontalRadial = mag / 2 + 9;
          nextDistance = horizontalRadial / Math.cos((pitchDeg * Math.PI) / 180);
          break;
        }
        case "sideRight":
          yawDeg = 0;
          pitchDeg = 14;
          nextDistance = 46;
          nextPanX = midpoint.x;
          nextPanZ = midpoint.y;
          break;
        case "sideLeft":
          yawDeg = 180;
          pitchDeg = 14;
          nextDistance = 46;
          nextPanX = midpoint.x;
          nextPanZ = midpoint.y;
          break;
        case "tilted":
          yawDeg = 270;
          pitchDeg = 45;
          nextDistance = 38;
          nextPanX = midpoint.x;
          nextPanZ = midpoint.y;
          break;
        case "topDown":
          yawDeg = 270;
          pitchDeg = 86;
          nextDistance = 32;
          nextPanX = midpoint.x;
          nextPanZ = midpoint.y;
          break;
      }

      const clampedDistance = clamp(
        nextDistance,
        OMNISCIENT_MIN_DISTANCE,
        OMNISCIENT_MAX_DISTANCE,
      );
      omnRef.current.yaw = normalizeDegrees(yawDeg);
      omnRef.current.pitch = clamp(pitchDeg, 8, 88);
      omnRef.current.panX = nextPanX;
      omnRef.current.panZ = nextPanZ;
      omnRef.current.distance = clampedDistance;
      setOmniscientDistance(clampedDistance);
      cameraSmoothRef.current = true;
    },
    [computerTanks, playerTank.bodyYaw, playerTank.position.x, playerTank.position.y],
  );

  // Mouse: rotate / pan camera
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) {
        return;
      }

      if (event.button === 0) {
        cameraDragModeRef.current = "rotate";
        event.preventDefault();
      } else if (event.button === 2) {
        cameraDragModeRef.current = "pan";
        event.preventDefault();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (event.buttons === 0) {
        cameraDragModeRef.current = null;
        return;
      }

      if (cameraDragModeRef.current === "rotate") {
        omnRef.current.yaw = normalizeDegrees(omnRef.current.yaw + event.movementX * 0.35);
        omnRef.current.pitch = clamp(omnRef.current.pitch - event.movementY * 0.25, 8, 88);
      } else if (cameraDragModeRef.current === "pan") {
        panCameraByScreenDelta(event.movementX, event.movementY);
      }
    };

    const stopCameraDrag = () => {
      cameraDragModeRef.current = null;
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopCameraDrag);
    window.addEventListener("blur", stopCameraDrag);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopCameraDrag);
      window.removeEventListener("blur", stopCameraDrag);
    };
  }, [panCameraByScreenDelta]);

  // Touch: one-finger rotate, two-finger pan. Zoom is handled by the HUD zoom control.
  useEffect(() => {
    const activePointers = activeTouchPointersRef.current;
    const touchGesture = touchGestureRef.current;

    const twoPointerGesture = () => {
      const points = Array.from(activePointers.values()).slice(0, 2);
      if (points.length < 2) return null;
      const midpoint = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      return midpoint;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !(event.target instanceof HTMLCanvasElement)) {
        return;
      }

      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 1) {
        touchGesture.mode = "rotate";
        touchGesture.x = event.clientX;
        touchGesture.y = event.clientY;
      } else {
        const gesture = twoPointerGesture();
        if (gesture) {
          touchGesture.mode = "pan";
          touchGesture.x = gesture.x;
          touchGesture.y = gesture.y;
        }
      }
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !activePointers.has(event.pointerId)) {
        return;
      }

      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 1 && touchGesture.mode === "rotate") {
        const xDelta = event.clientX - touchGesture.x;
        const yDelta = event.clientY - touchGesture.y;
        omnRef.current.yaw = normalizeDegrees(omnRef.current.yaw + xDelta * 0.35);
        omnRef.current.pitch = clamp(omnRef.current.pitch - yDelta * 0.25, 8, 88);
        touchGesture.x = event.clientX;
        touchGesture.y = event.clientY;
      } else if (activePointers.size >= 2) {
        const gesture = twoPointerGesture();
        if (gesture) {
          if (touchGesture.mode !== "pan") {
            touchGesture.mode = "pan";
            touchGesture.x = gesture.x;
            touchGesture.y = gesture.y;
          } else {
            panCameraByScreenDelta(gesture.x - touchGesture.x, gesture.y - touchGesture.y);
            touchGesture.x = gesture.x;
            touchGesture.y = gesture.y;
          }
        }
      }
      event.preventDefault();
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activePointers.delete(event.pointerId);

      if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];
        touchGesture.mode = "rotate";
        touchGesture.x = remaining.x;
        touchGesture.y = remaining.y;
      } else if (activePointers.size === 0) {
        touchGesture.mode = null;
      }
    };

    const handleWindowBlur = () => {
      activePointers.clear();
      touchGesture.mode = null;
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: false });
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [panCameraByScreenDelta]);

  // Mouse wheel: zoom
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setOmniscientDistance((value) => {
        const next = clamp(
          value + event.deltaY * 0.04,
          OMNISCIENT_MIN_DISTANCE,
          OMNISCIENT_MAX_DISTANCE,
        );
        omnRef.current.distance = next;
        return next;
      });
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  // After explosion: progress to next phase
  useEffect(() => {
    if (phase !== "exploding" || !explosion) return undefined;

    const timer = window.setTimeout(() => {
      if (winner) {
        setPhase("gameOver");
        return;
      }

      // No pendingTurn means stage cleared
      if (pendingTurn === null) {
        setPhase("stageClear");
        return;
      }

      beginTurn(pendingTurn, pendingTurn === "computer" ? pendingEnemyIndex : 0);
    }, EXPLOSION_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [beginTurn, explosion, pendingTurn, pendingEnemyIndex, phase, winner]);

  // Stage clear → next stage
  useEffect(() => {
    if (phase !== "stageClear") return undefined;

    const timer = window.setTimeout(() => {
      // Carry forward player HP, fully heal between stages
      startStage(stage + 1, STARTING_HP);
    }, STAGE_CLEAR_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [phase, stage, startStage]);

  // Computer plans its move
  useEffect(() => {
    if (turnOwner !== "computer" || phase !== "turnTransition" || winner) return undefined;

    const timer = window.setTimeout(() => {
      const acting = computerTanks[activeEnemyIndex];
      if (!acting || acting.hp <= 0) {
        // Skip dead — find next alive
        const nextAlive = computerTanks.findIndex((t, i) => i > activeEnemyIndex && t.hp > 0);
        if (nextAlive >= 0) {
          beginTurn("computer", nextAlive);
        } else {
          beginTurn("player");
        }
        return;
      }
      const others = otherTanksFor("computer", activeEnemyIndex);
      const plan = chooseComputerPlan(playerTank, acting, others, terrain, wind);
      setComputerPlan(plan);
      setComputerTanks((tanks) =>
        tanks.map((t, i) =>
          i === activeEnemyIndex
            ? {
                ...t,
                position: plan.position,
                height: plan.height,
                bodyYaw: plan.bodyYaw,
                turretYaw: plan.turretYaw,
                elevation: plan.elevation,
                power: plan.power,
                movementRemaining: plan.movementRemaining,
              }
            : t,
        ),
      );
      setPhase("aiming");
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeEnemyIndex, beginTurn, computerTanks, otherTanksFor, phase, playerTank, terrain, turnOwner, wind, winner]);

  // Computer fires
  useEffect(() => {
    if (turnOwner !== "computer" || phase !== "aiming" || !computerPlan || winner) return undefined;

    const acting = computerTanks[activeEnemyIndex];
    if (!acting) return undefined;

    const plannedTank: TankState = {
      ...acting,
      position: computerPlan.position,
      height: computerPlan.height,
      bodyYaw: computerPlan.bodyYaw,
      turretYaw: computerPlan.turretYaw,
      elevation: computerPlan.elevation,
      power: computerPlan.power,
      movementRemaining: computerPlan.movementRemaining,
    };

    const timer = window.setTimeout(() => {
      setComputerPlan(null);
      fireTank("computer", plannedTank, activeEnemyIndex);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [activeEnemyIndex, computerPlan, computerTanks, fireTank, phase, turnOwner, winner]);

  // Keyboard
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isAimKey = ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key);

      if (["a", "d", "w", "s", "q", "e", " "].includes(key) || isAimKey) {
        event.preventDefault();
      }

      if (isAimKey && key === "arrowleft") {
        adjustTurretYaw(-KEYBOARD_AIM_YAW_STEP);
      } else if (isAimKey && key === "arrowright") {
        adjustTurretYaw(KEYBOARD_AIM_YAW_STEP);
      } else if (isAimKey && key === "arrowup") {
        adjustElevation(KEYBOARD_AIM_ELEVATION_STEP);
      } else if (isAimKey && key === "arrowdown") {
        adjustElevation(-KEYBOARD_AIM_ELEVATION_STEP);
      } else if (key === "a") {
        movePlayerCameraRelative(-1, 0);
      } else if (key === "d") {
        movePlayerCameraRelative(1, 0);
      } else if (key === "w") {
        movePlayerCameraRelative(0, 1);
      } else if (key === "s") {
        movePlayerCameraRelative(0, -1);
      } else if (key === "q") {
        adjustPower(-3);
      } else if (key === "e") {
        adjustPower(3);
      } else if (key === " ") {
        firePlayer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adjustElevation, adjustPower, adjustTurretYaw, firePlayer, movePlayerCameraRelative]);

  const activeSceneState = useMemo(
    () => ({
      stage,
      terrain,
      playerTank,
      computerTanks,
      activeEnemyIndex,
      turnOwner,
      phase,
      wind,
      omniscientDistance,
      projectile,
      explosion,
      supplyDrops,
      playerPreviewWeapon: queuedWeapon,
      playerPreviewIgnoresWind: queuedWindIgnoreShots > 0,
      omnRef,
      cameraSmoothRef,
    }),
    [
      activeEnemyIndex,
      computerTanks,
      explosion,
      omniscientDistance,
      phase,
      playerTank,
      projectile,
      queuedWeapon,
      queuedWindIgnoreShots,
      supplyDrops,
      stage,
      terrain,
      turnOwner,
      wind,
    ],
  );

  const activeMoveBonus = Math.max(0, playerMovementBudget - MOVEMENT_PER_TURN);

  return (
    <main className="app-shell">
      <div className="scene-layer">
        <GameScene {...activeSceneState} onProjectileImpact={resolveProjectileImpact} />
      </div>
      <GameHUD
        stage={stage}
        playerTank={playerTank}
        computerTanks={computerTanks}
        activeEnemyIndex={activeEnemyIndex}
        turnOwner={turnOwner}
        phase={phase}
        wind={wind}
        winner={winner}
        lastExplosion={explosion}
        canPlayerAct={canPlayerAct}
        rewardChoices={pendingRewardChoices}
        queuedWeapon={queuedWeapon}
        queuedWindIgnoreShots={queuedWindIgnoreShots}
        activeMoveBonus={activeMoveBonus}
        movementBudget={playerMovementBudget}
        cameraDistance={omniscientDistance}
        onTurretYawChange={adjustTurretYaw}
        onTurretYawSet={setTurretYawValue}
        onElevationChange={adjustElevation}
        onElevationSet={setElevationValue}
        onPowerChange={adjustPower}
        onPowerSet={setPowerValue}
        onJoystickMove={movePlayerCameraRelative}
        onCameraZoomChange={adjustCameraZoom}
        onCameraZoomSet={setCameraZoomValue}
        onApplySavedView={applySavedView}
        onFire={firePlayer}
        onRewardChoice={chooseReward}
        onReset={resetGame}
      />
    </main>
  );
}
