import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseComputerPlan } from "./game/aiLogic";
import {
  COMPUTER_START_POSITION,
  EXPLOSION_DURATION_MS,
  FIRST_PERSON_DEFAULT_FOV,
  FIRST_PERSON_MAX_FOV,
  FIRST_PERSON_MIN_FOV,
  MAX_ELEVATION,
  MAX_POWER,
  MIN_ELEVATION,
  MIN_POWER,
  MOVEMENT_PER_TURN,
  PLAYER_MOVE_STEP,
  PLAYER_START_POSITION,
  STARTING_HP,
} from "./game/constants";
import { GameScene } from "./game/GameScene";
import {
  applyExplosionCrater,
  calculateExplosionDamage,
  canMoveTankTo,
  clamp,
  createInitialTerrain,
  createLaunchVelocity,
  createWind,
  getCannonTip,
  groundDistance,
  groundFromWorld,
  nextOwner,
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

function makeTank(terrain: TerrainState, position: GroundPos, target: GroundPos): TankState {
  const yaw = yawTo(position, target);

  return {
    position,
    height: terrainHeightAt(terrain, position),
    hp: STARTING_HP,
    bodyYaw: yaw,
    turretYaw: yaw,
    elevation: 32,
    power: 62,
    movementRemaining: MOVEMENT_PER_TURN,
  };
}

function makeInitialGame() {
  const terrain = createInitialTerrain();
  return {
    terrain,
    playerTank: makeTank(terrain, PLAYER_START_POSITION, COMPUTER_START_POSITION),
    computerTank: makeTank(terrain, COMPUTER_START_POSITION, PLAYER_START_POSITION),
  };
}

export default function App() {
  const initialGame = useMemo(() => makeInitialGame(), []);
  const [terrain, setTerrain] = useState<TerrainState>(initialGame.terrain);
  const [playerTank, setPlayerTank] = useState<TankState>(initialGame.playerTank);
  const [computerTank, setComputerTank] = useState<TankState>(initialGame.computerTank);
  const [turnOwner, setTurnOwner] = useState<TurnOwner>("player");
  const [phase, setPhase] = useState<GamePhase>("aiming");
  const [wind, setWind] = useState(() => createWind());
  const [projectile, setProjectile] = useState<ProjectileLaunch | null>(null);
  const [explosion, setExplosion] = useState<ExplosionState | null>(null);
  const [winner, setWinner] = useState<TurnOwner | null>(null);
  const [pendingTurn, setPendingTurn] = useState<TurnOwner | null>(null);
  const [computerPlan, setComputerPlan] = useState<ComputerPlan | null>(null);
  const [aimInputActive, setAimInputActive] = useState(false);
  const [zoomFov, setZoomFov] = useState(FIRST_PERSON_DEFAULT_FOV);
  const projectileIdRef = useRef(1);
  const explosionIdRef = useRef(1);

  const canPlayerAct = turnOwner === "player" && phase === "aiming" && !winner;

  const beginTurn = useCallback((owner: TurnOwner) => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    setTurnOwner(owner);
    setWind(createWind());
    setProjectile(null);
    setExplosion(null);
    setPendingTurn(null);
    setComputerPlan(null);
    setAimInputActive(false);

    if (owner === "player") {
      setPlayerTank((tank) => snapTankToTerrain({ ...tank, movementRemaining: MOVEMENT_PER_TURN }, terrain));
      setPhase("aiming");
    } else {
      setComputerTank((tank) => snapTankToTerrain({ ...tank, movementRemaining: MOVEMENT_PER_TURN }, terrain));
      setPhase("turnTransition");
    }
  }, [terrain]);

  const resetGame = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    const nextGame = makeInitialGame();
    setTerrain(nextGame.terrain);
    setPlayerTank(nextGame.playerTank);
    setComputerTank(nextGame.computerTank);
    setTurnOwner("player");
    setPhase("aiming");
    setWind(createWind());
    setProjectile(null);
    setExplosion(null);
    setWinner(null);
    setPendingTurn(null);
    setComputerPlan(null);
    setAimInputActive(false);
    setZoomFov(FIRST_PERSON_DEFAULT_FOV);
    projectileIdRef.current = 1;
    explosionIdRef.current = 1;
  }, []);

  const fireTank = useCallback((owner: TurnOwner, overrideTank?: TankState) => {
    const shooter = overrideTank ?? (owner === "player" ? playerTank : computerTank);

    setProjectile({
      id: projectileIdRef.current,
      owner,
      start: getCannonTip(shooter),
      velocity: createLaunchVelocity(shooter),
    });
    projectileIdRef.current += 1;
    setExplosion(null);
    setAimInputActive(false);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    setPhase("projectileFlying");
  }, [computerTank, playerTank]);

  const movePlayer = useCallback((xDirection: number, yDirection: number) => {
    if (!canPlayerAct) {
      return;
    }

    setPlayerTank((tank) => {
      const magnitude = Math.hypot(xDirection, yDirection);
      if (magnitude <= 0 || tank.movementRemaining <= 0) {
        return tank;
      }

      const usableMovement = Math.min(PLAYER_MOVE_STEP, tank.movementRemaining);
      const desiredPosition = {
        x: tank.position.x + (xDirection / magnitude) * usableMovement,
        y: tank.position.y + (yDirection / magnitude) * usableMovement,
      };
      const move = canMoveTankTo(tank, terrain, desiredPosition, computerTank);

      if (!move.allowed) {
        return tank;
      }

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
  }, [canPlayerAct, computerTank, terrain]);

  const adjustElevation = useCallback((delta: number) => {
    if (!canPlayerAct) {
      return;
    }

    setPlayerTank((tank) => ({
      ...tank,
      elevation: clamp(tank.elevation + delta, MIN_ELEVATION, MAX_ELEVATION),
    }));
  }, [canPlayerAct]);

  const adjustPower = useCallback((delta: number) => {
    if (!canPlayerAct) {
      return;
    }

    setPlayerTank((tank) => ({
      ...tank,
      power: clamp(tank.power + delta, MIN_POWER, MAX_POWER),
    }));
  }, [canPlayerAct]);

  const firePlayer = useCallback(() => {
    if (!canPlayerAct) {
      return;
    }

    fireTank("player");
  }, [canPlayerAct, fireTank]);

  const activateAimInput = useCallback((event: MouseEvent) => {
    if (!canPlayerAct || !(event.target instanceof HTMLCanvasElement)) {
      return;
    }

    event.target.requestPointerLock();
  }, [canPlayerAct]);

  const resolveProjectileImpact = useCallback((impact: Vec3) => {
    if (!projectile) {
      return;
    }

    const owner = projectile.owner;
    const target = nextOwner(owner);
    const targetTank = target === "player" ? playerTank : computerTank;
    const damage = calculateExplosionDamage(impact, targetTank);
    const nextHp = Math.max(0, targetTank.hp - damage);
    const craterCenter = groundFromWorld(impact);
    const nextTerrain = applyExplosionCrater(terrain, craterCenter);

    setTerrain(nextTerrain);
    setPlayerTank((tank) =>
      snapTankToTerrain(
        {
          ...tank,
          hp: target === "player" ? Math.max(0, tank.hp - damage) : tank.hp,
        },
        nextTerrain,
      ),
    );
    setComputerTank((tank) =>
      snapTankToTerrain(
        {
          ...tank,
          hp: target === "computer" ? Math.max(0, tank.hp - damage) : tank.hp,
        },
        nextTerrain,
      ),
    );

    setProjectile(null);
    setExplosion({
      id: explosionIdRef.current,
      owner,
      position: impact,
      damage,
      target,
    });
    explosionIdRef.current += 1;
    setPendingTurn(nextOwner(owner));
    setWinner(nextHp <= 0 ? owner : null);
    setPhase("exploding");
  }, [computerTank, playerTank, projectile, terrain]);

  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement instanceof HTMLCanvasElement;
      setAimInputActive(locked && canPlayerAct);
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return () => document.removeEventListener("pointerlockchange", handlePointerLockChange);
  }, [canPlayerAct]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragAiming = event.buttons === 1;
      if ((!aimInputActive && !dragAiming) || !canPlayerAct) {
        return;
      }

      setPlayerTank((tank) => ({
        ...tank,
        turretYaw: normalizeDegrees(tank.turretYaw + event.movementX * 0.18),
        elevation: clamp(tank.elevation - event.movementY * 0.14, MIN_ELEVATION, MAX_ELEVATION),
      }));
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [aimInputActive, canPlayerAct]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!canPlayerAct) {
        return;
      }

      event.preventDefault();
      setZoomFov((value) => clamp(value + event.deltaY * 0.035, FIRST_PERSON_MIN_FOV, FIRST_PERSON_MAX_FOV));
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [canPlayerAct]);

  useEffect(() => {
    if (phase !== "exploding" || !explosion) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (winner) {
        setPhase("gameOver");
        return;
      }

      if (pendingTurn) {
        beginTurn(pendingTurn);
      }
    }, EXPLOSION_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [beginTurn, explosion, pendingTurn, phase, winner]);

  useEffect(() => {
    if (turnOwner !== "computer" || phase !== "turnTransition" || winner) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const plan = chooseComputerPlan(playerTank, computerTank, terrain, wind);
      setComputerPlan(plan);
      setComputerTank((tank) => ({
        ...tank,
        position: plan.position,
        height: plan.height,
        bodyYaw: plan.bodyYaw,
        turretYaw: plan.turretYaw,
        elevation: plan.elevation,
        power: plan.power,
        movementRemaining: plan.movementRemaining,
      }));
      setPhase("aiming");
    }, 650);

    return () => window.clearTimeout(timer);
  }, [computerTank, phase, playerTank, terrain, turnOwner, wind, winner]);

  useEffect(() => {
    if (turnOwner !== "computer" || phase !== "aiming" || !computerPlan || winner) {
      return undefined;
    }

    const plannedTank: TankState = {
      ...computerTank,
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
      fireTank("computer", plannedTank);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [computerPlan, computerTank, fireTank, phase, turnOwner, winner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (["a", "d", "w", "s", "q", "e", " "].includes(key)) {
        event.preventDefault();
      }

      if (key === "a") {
        movePlayer(-1, 0);
      } else if (key === "d") {
        movePlayer(1, 0);
      } else if (key === "w") {
        movePlayer(0, 1);
      } else if (key === "s") {
        movePlayer(0, -1);
      } else if (key === "q") {
        adjustPower(-3);
      } else if (key === "e") {
        adjustPower(3);
      } else if (key === " ") {
        firePlayer();
      } else if (key === "escape" && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adjustPower, firePlayer, movePlayer]);

  const activeSceneState = useMemo(
    () => ({
      terrain,
      playerTank,
      computerTank,
      turnOwner,
      phase,
      wind,
      zoomFov,
      aimInputActive,
      projectile,
      explosion,
    }),
    [aimInputActive, computerTank, explosion, phase, playerTank, projectile, terrain, turnOwner, wind, zoomFov],
  );

  return (
    <main className="app-shell">
      <div className="scene-layer">
        <GameScene
          {...activeSceneState}
          onProjectileImpact={resolveProjectileImpact}
          onCanvasAimClick={activateAimInput}
        />
      </div>
      <GameHUD
        playerTank={playerTank}
        computerTank={computerTank}
        turnOwner={turnOwner}
        phase={phase}
        wind={wind}
        winner={winner}
        lastExplosion={explosion}
        canPlayerAct={canPlayerAct}
        aimInputActive={aimInputActive}
        zoomFov={zoomFov}
        onElevationChange={adjustElevation}
        onPowerChange={adjustPower}
        onFire={firePlayer}
        onReset={resetGame}
      />
    </main>
  );
}
