import {
  CANNON_BASE_FORWARD_OFFSET,
  CANNON_BASE_HEIGHT,
  CANNON_LENGTH,
  COMPUTER_START_POSITION,
  CRATER_DEPTH,
  EXPLOSION_RADIUS,
  GRAVITY,
  GROUND_MAX_X,
  GROUND_MAX_Y,
  GROUND_MIN_X,
  GROUND_MIN_Y,
  MAX_ELEVATION,
  MAX_EXPLOSION_DAMAGE,
  MAX_POWER,
  MIN_ELEVATION,
  MIN_POWER,
  MIN_TANK_DISTANCE,
  PLAYER_START_POSITION,
  POWER_TO_VELOCITY,
  TANK_CENTER_HEIGHT,
  TERRAIN_BASE_DEPTH,
  TERRAIN_CELL_SIZE,
  TERRAIN_DEPTH,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_MIN_HEIGHT,
  TERRAIN_WIDTH,
  TRAJECTORY_PREVIEW_STEPS,
  TRAJECTORY_PREVIEW_TIME,
  WIND_ACCELERATION_SCALE,
} from "./constants";
import type { GroundPos, TankState, TerrainState, TurnOwner, Vec3, Wind } from "./gameTypes";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

export function signedAngleDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

export function createWind(): Wind {
  const bearing = Math.round(randomBetween(0, 360));
  const radians = degreesToRadians(bearing);
  const vector = {
    x: Math.cos(radians),
    y: Math.sin(radians),
  };

  return {
    vector,
    strength: Math.round(randomBetween(0, 8)),
    bearing,
    label: bearingToCompass(bearing),
  };
}

export function bearingToCompass(bearing: number) {
  const labels = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  return labels[Math.round(normalizeDegrees(bearing) / 45) % labels.length];
}

function hill(x: number, y: number, cx: number, cy: number, radius: number, height: number) {
  const distanceSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  return Math.exp(-distanceSq / (radius * radius)) * height;
}

function deterministicTerrainHeight(x: number, y: number) {
  const waves =
    Math.sin((x + 4.1) * 0.36) * 0.55 +
    Math.cos((y - 1.7) * 0.48) * 0.46 +
    Math.sin((x + y) * 0.22) * 0.34;
  const mountains =
    hill(x, y, -7, 1, 7.4, 1.8) +
    hill(x, y, 5.5, -4.8, 6.2, 1.45) +
    hill(x, y, 12, 7, 5.8, 1.2) -
    hill(x, y, -1.2, 2, 5.2, 0.9);
  const rawHeight = 1.15 + waves + mountains;
  const plateauInfluence =
    Math.max(0, 1 - groundDistance({ x, y }, PLAYER_START_POSITION) / 4.7) +
    Math.max(0, 1 - groundDistance({ x, y }, COMPUTER_START_POSITION) / 4.7);
  const plateauHeight = 1.15;
  const blended = plateauInfluence > 0
    ? rawHeight * (1 - clamp(plateauInfluence, 0, 1)) + plateauHeight * clamp(plateauInfluence, 0, 1)
    : rawHeight;

  return clamp(Math.round(blended * 2) / 2, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
}

export function createInitialTerrain(): TerrainState {
  const heights = Array.from({ length: TERRAIN_DEPTH }, (_, row) => {
    const y = GROUND_MIN_Y + row * TERRAIN_CELL_SIZE;
    return Array.from({ length: TERRAIN_WIDTH }, (_, column) => {
      const x = GROUND_MIN_X + column * TERRAIN_CELL_SIZE;
      return deterministicTerrainHeight(x, y);
    });
  });

  return {
    minX: GROUND_MIN_X,
    minY: GROUND_MIN_Y,
    width: TERRAIN_WIDTH,
    depth: TERRAIN_DEPTH,
    cellSize: TERRAIN_CELL_SIZE,
    heights,
  };
}

function terrainColumn(terrain: TerrainState, x: number) {
  return clamp(Math.round((x - terrain.minX) / terrain.cellSize), 0, terrain.width - 1);
}

function terrainRow(terrain: TerrainState, y: number) {
  return clamp(Math.round((y - terrain.minY) / terrain.cellSize), 0, terrain.depth - 1);
}

export function terrainHeightAt(terrain: TerrainState, position: GroundPos) {
  const fx = clamp((position.x - terrain.minX) / terrain.cellSize, 0, terrain.width - 1);
  const fy = clamp((position.y - terrain.minY) / terrain.cellSize, 0, terrain.depth - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(terrain.width - 1, x0 + 1);
  const y1 = Math.min(terrain.depth - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const h00 = terrain.heights[y0][x0];
  const h10 = terrain.heights[y0][x1];
  const h01 = terrain.heights[y1][x0];
  const h11 = terrain.heights[y1][x1];
  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;

  return hx0 + (hx1 - hx0) * ty;
}

export function applyExplosionCrater(terrain: TerrainState, center: GroundPos) {
  const heights = terrain.heights.map((row, rowIndex) =>
    row.map((height, columnIndex) => {
      const x = terrain.minX + columnIndex * terrain.cellSize;
      const y = terrain.minY + rowIndex * terrain.cellSize;
      const distance = groundDistance({ x, y }, center);

      if (distance >= EXPLOSION_RADIUS) {
        return height;
      }

      const falloff = 1 - distance / EXPLOSION_RADIUS;
      const lowered = height - CRATER_DEPTH * falloff;
      return clamp(Math.round(lowered * 4) / 4, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
    }),
  );

  return {
    ...terrain,
    heights,
  };
}

export function clampGroundPosition(position: GroundPos): GroundPos {
  return {
    x: clamp(position.x, GROUND_MIN_X, GROUND_MAX_X),
    y: clamp(position.y, GROUND_MIN_Y, GROUND_MAX_Y),
  };
}

export function groundDistance(a: GroundPos, b: GroundPos) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function vec3Distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function worldFromGround(position: GroundPos, height: number): Vec3 {
  return {
    x: position.x,
    y: height,
    z: position.y,
  };
}

export function groundFromWorld(position: Vec3): GroundPos {
  return {
    x: position.x,
    y: position.z,
  };
}

export function yawTo(from: GroundPos, to: GroundPos) {
  return normalizeDegrees(radiansToDegrees(Math.atan2(to.y - from.y, to.x - from.x)));
}

export function forwardVector(yawDegrees: number, elevationDegrees = 0): Vec3 {
  const yaw = degreesToRadians(yawDegrees);
  const elevation = degreesToRadians(elevationDegrees);
  const horizontal = Math.cos(elevation);

  return {
    x: Math.cos(yaw) * horizontal,
    y: Math.sin(elevation),
    z: Math.sin(yaw) * horizontal,
  };
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

export function scaleVec3(vector: Vec3, scale: number): Vec3 {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale,
  };
}

export function getTankCenter(tank: TankState): Vec3 {
  return worldFromGround(tank.position, tank.height + TANK_CENTER_HEIGHT);
}

export function getCannonTip(tank: TankState): Vec3 {
  const base = worldFromGround(tank.position, tank.height + CANNON_BASE_HEIGHT);
  const forward = forwardVector(tank.turretYaw, tank.elevation);
  const baseOffset = forwardVector(tank.turretYaw, 0);

  return addVec3(
    addVec3(base, scaleVec3(baseOffset, CANNON_BASE_FORWARD_OFFSET)),
    scaleVec3(forward, CANNON_LENGTH),
  );
}

export function createLaunchVelocity(tank: TankState): Vec3 {
  const speed = tank.power * POWER_TO_VELOCITY;
  return scaleVec3(forwardVector(tank.turretYaw, tank.elevation), speed);
}

export function windAcceleration(wind: Wind): Vec3 {
  return {
    x: wind.vector.x * wind.strength * WIND_ACCELERATION_SCALE,
    y: 0,
    z: wind.vector.y * wind.strength * WIND_ACCELERATION_SCALE,
  };
}

export function calculateExplosionDamage(impact: Vec3, targetTank: TankState) {
  const impactDistance = vec3Distance(impact, getTankCenter(targetTank));

  if (impactDistance >= EXPLOSION_RADIUS) {
    return 0;
  }

  return Math.round(MAX_EXPLOSION_DAMAGE * (1 - impactDistance / EXPLOSION_RADIUS));
}

export function canMoveTankTo(tank: TankState, terrain: TerrainState, nextPosition: GroundPos, otherTank: TankState) {
  const clamped = clampGroundPosition(nextPosition);
  const nextHeight = terrainHeightAt(terrain, clamped);
  const heightDelta = Math.abs(nextHeight - tank.height);
  const farEnough = groundDistance(clamped, otherTank.position) >= MIN_TANK_DISTANCE;

  return {
    allowed: heightDelta <= 1.05 && farEnough,
    position: clamped,
    height: nextHeight,
  };
}

export function snapTankToTerrain(tank: TankState, terrain: TerrainState): TankState {
  return {
    ...tank,
    height: terrainHeightAt(terrain, tank.position),
  };
}

export function previewTrajectory(tank: TankState, wind: Wind) {
  const start = getCannonTip(tank);
  const velocity = createLaunchVelocity(tank);
  const windAccel = windAcceleration(wind);
  const points: Vec3[] = [];

  for (let i = 0; i <= TRAJECTORY_PREVIEW_STEPS; i += 1) {
    const t = (i / TRAJECTORY_PREVIEW_STEPS) * TRAJECTORY_PREVIEW_TIME;
    points.push({
      x: start.x + velocity.x * t + 0.5 * windAccel.x * t * t,
      y: start.y + velocity.y * t - 0.5 * GRAVITY * t * t,
      z: start.z + velocity.z * t + 0.5 * windAccel.z * t * t,
    });
  }

  return points;
}

export function nextOwner(owner: TurnOwner): TurnOwner {
  return owner === "player" ? "computer" : "player";
}

export function sanitizeElevation(elevation: number) {
  return clamp(Math.round(elevation), MIN_ELEVATION, MAX_ELEVATION);
}

export function sanitizePower(power: number) {
  return clamp(Math.round(power), MIN_POWER, MAX_POWER);
}

export function terrainBottom() {
  return TERRAIN_MIN_HEIGHT - TERRAIN_BASE_DEPTH;
}

export function cellCenter(terrain: TerrainState, row: number, column: number): GroundPos {
  return {
    x: terrain.minX + column * terrain.cellSize,
    y: terrain.minY + row * terrain.cellSize,
  };
}

export function nearestTerrainHeight(terrain: TerrainState, position: GroundPos) {
  return terrain.heights[terrainRow(terrain, position.y)][terrainColumn(terrain, position.x)];
}
