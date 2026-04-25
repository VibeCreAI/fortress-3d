import {
  GRAVITY,
  MOVEMENT_PER_TURN,
  POWER_TO_VELOCITY,
} from "./constants";
import {
  canMoveTankTo,
  degreesToRadians,
  groundDistance,
  randomBetween,
  sanitizeElevation,
  sanitizePower,
  terrainHeightAt,
  yawTo,
} from "./gameMath";
import type { ComputerPlan, GroundPos, TankState, TerrainState, Wind } from "./gameTypes";

export function chooseComputerPlan(
  playerTank: TankState,
  computerTank: TankState,
  otherTanks: TankState[],
  terrain: TerrainState,
  wind: Wind,
): ComputerPlan {
  const targetYaw = yawTo(computerTank.position, playerTank.position);
  const sidestepYaw = targetYaw + randomBetween(-105, 105);
  const moveDistance = randomBetween(0.5, Math.min(2.8, MOVEMENT_PER_TURN));
  const desiredPosition: GroundPos = {
    x: computerTank.position.x + Math.cos(degreesToRadians(sidestepYaw)) * moveDistance,
    y: computerTank.position.y + Math.sin(degreesToRadians(sidestepYaw)) * moveDistance,
  };
  const move = canMoveTankTo(computerTank, terrain, desiredPosition, otherTanks);
  const finalPosition = move.allowed ? move.position : computerTank.position;
  const finalHeight = move.allowed ? move.height : terrainHeightAt(terrain, finalPosition);
  const movementUsed = move.allowed ? groundDistance(computerTank.position, finalPosition) : 0;

  const postMoveDistance = groundDistance(playerTank.position, finalPosition);
  const baseElevation = postMoveDistance > 24 ? 54 : postMoveDistance > 16 ? 48 : 42;
  const elevationRadians = degreesToRadians(baseElevation);
  const heightDelta = Math.max(-2, playerTank.height - finalHeight);
  const idealSpeed = Math.sqrt(
    Math.max(
      4,
      (postMoveDistance * GRAVITY) /
        Math.max(0.22, Math.sin(elevationRadians * 2) + heightDelta * 0.035),
    ),
  );
  const shotYaw = yawTo(finalPosition, playerTank.position);
  const windAgainstShot =
    Math.cos(degreesToRadians(shotYaw)) * wind.vector.x +
    Math.sin(degreesToRadians(shotYaw)) * wind.vector.y;
  const powerAdjustment = -windAgainstShot * wind.strength * 1.35;

  return {
    position: finalPosition,
    height: finalHeight,
    bodyYaw: shotYaw,
    turretYaw: shotYaw + randomBetween(-7, 7),
    elevation: sanitizeElevation(baseElevation + randomBetween(-8, 8)),
    power: sanitizePower(idealSpeed / POWER_TO_VELOCITY + powerAdjustment + randomBetween(-9, 10)),
    movementRemaining: Math.max(0, MOVEMENT_PER_TURN - movementUsed),
  };
}
