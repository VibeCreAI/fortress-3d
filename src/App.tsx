import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseComputerPlan } from "./game/aiLogic";
import {
  EXPLOSION_DURATION_MS,
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
  STAGE_CLEAR_DELAY_MS,
  STARTING_HP,
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
  groundDistance,
  groundFromWorld,
  normalizeDegrees,
  snapTankToTerrain,
  terrainHeightAt,
  yawTo,
} from "./game/gameMath";
import type {
  ComputerPlan,
  ExplosionState,
  GamePhase,
  GroundPos,
  ProjectileLaunch,
  TankState,
  TerrainState,
  TurnOwner,
  Vec3,
} from "./game/gameTypes";
import { GameHUD } from "./ui/GameHUD";

function makeTank(
  terrain: TerrainState,
  position: GroundPos,
  target: GroundPos,
  hp: number = STARTING_HP,
): TankState {
  const yaw = yawTo(position, target);

  return {
    position,
    height: terrainHeightAt(terrain, position),
    hp,
    bodyYaw: yaw,
    turretYaw: yaw,
    elevation: 32,
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
  );
  const computerTanks = blueprint.enemyStarts.map((start) =>
    makeTank(blueprint.terrain, start, blueprint.playerStart, config.enemyHp),
  );
  return {
    stage,
    terrain: blueprint.terrain,
    playerTank,
    computerTanks,
  };
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
  const projectileIdRef = useRef(1);
  const explosionIdRef = useRef(1);

  const canPlayerAct = turnOwner === "player" && phase === "aiming" && !winner;

  const omnRef = useRef({ yaw: 10, pitch: 60, panX: 0, panZ: 0, distance: OMNISCIENT_DEFAULT_DISTANCE });
  omnRef.current.distance = omniscientDistance;
  const canPlayerActRef = useRef(false);
  canPlayerActRef.current = canPlayerAct;

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
        setPlayerTank((tank) =>
          snapTankToTerrain({ ...tank, movementRemaining: MOVEMENT_PER_TURN }, terrain),
        );
        setPhase("aiming");
      } else {
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
  }, [startStage]);

  const fireTank = useCallback(
    (owner: TurnOwner, overrideTank?: TankState, enemyIndex?: number) => {
      const shooter =
        overrideTank ??
        (owner === "player" ? playerTank : computerTanks[enemyIndex ?? activeEnemyIndex]);

      setProjectile({
        id: projectileIdRef.current,
        owner,
        start: getCannonTip(shooter),
        velocity: createLaunchVelocity(shooter),
      });
      projectileIdRef.current += 1;
      setExplosion(null);
      setPhase("projectileFlying");
    },
    [activeEnemyIndex, computerTanks, playerTank],
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

  const firePlayer = useCallback(() => {
    if (!canPlayerAct) return;
    fireTank("player");
  }, [canPlayerAct, fireTank]);

  const resolveProjectileImpact = useCallback(
    (impact: Vec3) => {
      if (!projectile) return;

      const owner = projectile.owner;
      const craterCenter = groundFromWorld(impact);
      const nextTerrain = applyExplosionCrater(terrain, craterCenter);
      setTerrain(nextTerrain);

      let playerDamageTaken = 0;
      let totalEnemyDamage = 0;

      // Damage the opposing side(s). Friendly fire is ignored.
      if (owner === "player") {
        const updated = computerTanks.map((t) => {
          if (t.hp <= 0) return t;
          const dmg = calculateExplosionDamage(impact, t);
          if (dmg > 0) totalEnemyDamage += dmg;
          return snapTankToTerrain({ ...t, hp: Math.max(0, t.hp - dmg) }, nextTerrain);
        });
        setComputerTanks(updated.map((t) => snapTankToTerrain(t, nextTerrain)));
        setPlayerTank((tank) => snapTankToTerrain(tank, nextTerrain));
      } else {
        const dmg = calculateExplosionDamage(impact, playerTank);
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
            const dmg = calculateExplosionDamage(impact, tank);
            return tank.hp - dmg > 0;
          });
      } else {
        aliveAfter = computerTanks
          .map((t, i) => ({ tank: t, index: i }))
          .filter(({ tank }) => tank.hp > 0);
      }

      const playerDead = postPlayerHp <= 0;
      const allEnemiesDead = aliveAfter.length === 0;

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
    [activeEnemyIndex, computerTanks, playerTank, projectile, terrain],
  );

  // Mouse: rotate / pan camera
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (event.buttons === 1) {
        omnRef.current.yaw = normalizeDegrees(omnRef.current.yaw + event.movementX * 0.35);
        omnRef.current.pitch = clamp(omnRef.current.pitch - event.movementY * 0.25, 8, 88);
      } else if (event.buttons === 2) {
        const yawRad = (omnRef.current.yaw * Math.PI) / 180;
        const speed = omnRef.current.distance * 0.006;
        omnRef.current.panX +=
          (Math.cos(yawRad) * event.movementX + Math.sin(yawRad) * event.movementY) * speed;
        omnRef.current.panZ +=
          (-Math.sin(yawRad) * event.movementX + Math.cos(yawRad) * event.movementY) * speed;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

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
        const yaw = (omnRef.current.yaw * Math.PI) / 180;
        movePlayer(-Math.cos(yaw), Math.sin(yaw));
      } else if (key === "d") {
        const yaw = (omnRef.current.yaw * Math.PI) / 180;
        movePlayer(Math.cos(yaw), -Math.sin(yaw));
      } else if (key === "w") {
        const yaw = (omnRef.current.yaw * Math.PI) / 180;
        movePlayer(-Math.sin(yaw), -Math.cos(yaw));
      } else if (key === "s") {
        const yaw = (omnRef.current.yaw * Math.PI) / 180;
        movePlayer(Math.sin(yaw), Math.cos(yaw));
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
  }, [adjustElevation, adjustPower, adjustTurretYaw, firePlayer, movePlayer]);

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
      omnRef,
    }),
    [
      activeEnemyIndex,
      computerTanks,
      explosion,
      omniscientDistance,
      phase,
      playerTank,
      projectile,
      stage,
      terrain,
      turnOwner,
      wind,
    ],
  );

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
        omniscientDistance={omniscientDistance}
        onElevationChange={adjustElevation}
        onPowerChange={adjustPower}
        onFire={firePlayer}
        onReset={resetGame}
      />
    </main>
  );
}
