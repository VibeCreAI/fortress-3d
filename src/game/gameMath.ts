import {
  CANNON_BASE_FORWARD_OFFSET,
  CANNON_BASE_HEIGHT,
  CANNON_LENGTH,
  CRATER_DEPTH,
  CRATER_MIN_HEIGHT,
  EXPLOSION_RADIUS,
  GRAVITY,
  GRAVITY_DAMAGE_FULL_APEX_RISE,
  GRAVITY_DAMAGE_FULL_DOWNWARD_SPEED,
  GRAVITY_DAMAGE_MAX_MULTIPLIER,
  GRAVITY_DAMAGE_MIN_APEX_RISE,
  GRAVITY_DAMAGE_MIN_DOWNWARD_SPEED,
  MAGNET_SHOT_ACCELERATION,
  MAGNET_SHOT_RANGE,
  MAX_ELEVATION,
  MAX_EXPLOSION_DAMAGE,
  MAX_POWER,
  MIN_ELEVATION,
  MIN_POWER,
  MIN_TANK_DISTANCE,
  POWER_TO_VELOCITY,
  TANK_CENTER_HEIGHT,
  TERRAIN_BASE_DEPTH,
  TERRAIN_CELL_SIZE,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_MIN_HEIGHT,
  TRAJECTORY_PREVIEW_STEPS,
  TRAJECTORY_PREVIEW_TIME,
  WIND_ACCELERATION_SCALE,
  getStageConfig,
} from "./constants";
import type {
  GroundPos,
  ProjectileImpactProfile,
  TankState,
  TerrainState,
  TurnOwner,
  Vec3,
  WeaponType,
  Wind,
} from "./gameTypes";

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

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plateau = { position: GroundPos; radius: number };

type GeneratedHill = { x: number; y: number; radius: number; height: number; sign: 1 | -1 };

export type StageBlueprint = {
  terrain: TerrainState;
  playerStart: GroundPos;
  enemyStarts: GroundPos[];
  boundsX: number;
  boundsY: number;
};

function spreadEnemyStarts(count: number, boundsX: number, boundsY: number): GroundPos[] {
  const baseX = boundsX * 0.65;
  if (count === 1) {
    return [{ x: baseX, y: boundsY * 0.4 }];
  }
  if (count === 2) {
    return [
      { x: baseX, y: boundsY * 0.55 },
      { x: baseX, y: -boundsY * 0.55 },
    ];
  }
  if (count === 3) {
    return [
      { x: baseX, y: 0 },
      { x: baseX * 0.92, y: boundsY * 0.6 },
      { x: baseX * 0.92, y: -boundsY * 0.6 },
    ];
  }
  // 4+: spread along right side
  const out: GroundPos[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push({ x: baseX * (i % 2 === 0 ? 1 : 0.88), y: (t - 0.5) * 2 * boundsY * 0.7 });
  }
  return out;
}

function generateHills(
  rng: () => number,
  count: number,
  boundsX: number,
  boundsY: number,
  hMin: number,
  hMax: number,
  rMin: number,
  rMax: number,
  plateaus: Plateau[],
): GeneratedHill[] {
  const hills: GeneratedHill[] = [];
  let attempts = 0;
  while (hills.length < count && attempts < count * 10) {
    attempts += 1;
    const x = (rng() * 2 - 1) * boundsX * 0.85;
    const y = (rng() * 2 - 1) * boundsY * 0.85;
    const radius = rMin + rng() * (rMax - rMin);
    const height = hMin + rng() * (hMax - hMin);
    const sign: 1 | -1 = rng() < 0.18 ? -1 : 1;

    const tooNearPlateau = plateaus.some(
      (p) => Math.hypot(x - p.position.x, y - p.position.y) < p.radius + radius * 0.45,
    );
    if (tooNearPlateau) continue;

    hills.push({ x, y, radius, height, sign });
  }
  return hills;
}

function stageTerrainHeight(
  x: number,
  y: number,
  hills: GeneratedHill[],
  plateaus: Plateau[],
  noiseAmp: number,
  rngOffset: number,
) {
  const waves =
    Math.sin((x + 4.1 + rngOffset) * 0.36) * 0.55 +
    Math.cos((y - 1.7 + rngOffset * 0.5) * 0.48) * 0.46 +
    Math.sin((x + y + rngOffset * 0.31) * 0.22) * 0.34;

  let mountains = 0;
  for (const h of hills) {
    mountains += hill(x, y, h.x, h.y, h.radius, h.height) * h.sign;
  }

  const rawHeight = 1.15 + waves * noiseAmp + mountains;

  let plateauInfluence = 0;
  for (const p of plateaus) {
    plateauInfluence += Math.max(0, 1 - groundDistance({ x, y }, p.position) / p.radius);
  }
  const blendT = clamp(plateauInfluence, 0, 1);
  const plateauHeight = 1.15;
  const blended = rawHeight * (1 - blendT) + plateauHeight * blendT;

  return clamp(Math.round(blended * 2) / 2, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
}

export function createStageBlueprint(stage: number): StageBlueprint {
  const config = getStageConfig(stage);
  const rng = mulberry32(stage * 7919 + config.seedOffset);
  const rngOffset = rng() * 6.28;

  const minX = -config.boundsX;
  const minY = -config.boundsY;

  const playerStart: GroundPos = { x: -config.boundsX * 0.65, y: -config.boundsY * 0.4 };
  const enemyStarts = spreadEnemyStarts(config.enemyCount, config.boundsX, config.boundsY);

  const plateaus: Plateau[] = [
    { position: playerStart, radius: 4.7 },
    ...enemyStarts.map((pos) => ({ position: pos, radius: 4.7 })),
  ];

  const hills = generateHills(
    rng,
    config.hillCount,
    config.boundsX,
    config.boundsY,
    config.hillHeightMin,
    config.hillHeightMax,
    config.hillRadiusMin,
    config.hillRadiusMax,
    plateaus,
  );

  const heights = Array.from({ length: config.terrainDepth }, (_, row) => {
    const y = minY + row * TERRAIN_CELL_SIZE;
    return Array.from({ length: config.terrainWidth }, (_, column) => {
      const x = minX + column * TERRAIN_CELL_SIZE;
      return stageTerrainHeight(x, y, hills, plateaus, config.noiseAmplitude, rngOffset);
    });
  });

  return {
    terrain: {
      minX,
      minY,
      width: config.terrainWidth,
      depth: config.terrainDepth,
      cellSize: TERRAIN_CELL_SIZE,
      heights,
    },
    playerStart,
    enemyStarts,
    boundsX: config.boundsX,
    boundsY: config.boundsY,
  };
}

export function createInitialTerrain(): TerrainState {
  return createStageBlueprint(1).terrain;
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

export function weaponDamageMultiplier(weapon: WeaponType) {
  if (weapon === "red") return 2.2;
  if (weapon === "earth") return 1.2;
  return 1;
}

export function weaponCraterRadiusMultiplier(weapon: WeaponType) {
  return weapon === "earth" ? 1.3 : 1;
}

export function weaponCraterDepthMultiplier(weapon: WeaponType) {
  return weapon === "earth" ? 1.6 : 1;
}

export function weaponWindMultiplier(weapon: WeaponType, ignoresWind: boolean) {
  if (ignoresWind) return 0;
  return weapon === "red" ? 1.6 : 1;
}

export function explosionRadiusForWeapon(weapon: WeaponType) {
  return EXPLOSION_RADIUS * weaponCraterRadiusMultiplier(weapon);
}

export function applyExplosionCrater(terrain: TerrainState, center: GroundPos, weapon: WeaponType = "base") {
  const radius = explosionRadiusForWeapon(weapon);
  const depth = CRATER_DEPTH * weaponCraterDepthMultiplier(weapon);

  const heights = terrain.heights.map((row, rowIndex) =>
    row.map((height, columnIndex) => {
      const x = terrain.minX + columnIndex * terrain.cellSize;
      const y = terrain.minY + rowIndex * terrain.cellSize;
      const distance = groundDistance({ x, y }, center);

      if (distance >= radius) {
        return height;
      }

      const falloff = 1 - distance / radius;
      const lowered = height - depth * falloff;
      return clamp(Math.round(lowered * 4) / 4, CRATER_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
    }),
  );

  return {
    ...terrain,
    heights,
  };
}

export function terrainMaxX(terrain: TerrainState) {
  return terrain.minX + (terrain.width - 1) * terrain.cellSize;
}

export function terrainMaxY(terrain: TerrainState) {
  return terrain.minY + (terrain.depth - 1) * terrain.cellSize;
}

export function clampGroundPosition(position: GroundPos, terrain: TerrainState): GroundPos {
  return {
    x: clamp(position.x, terrain.minX, terrainMaxX(terrain)),
    y: clamp(position.y, terrain.minY, terrainMaxY(terrain)),
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

export function projectileWindAcceleration(wind: Wind, weapon: WeaponType, ignoresWind: boolean): Vec3 {
  return scaleVec3(windAcceleration(wind), weaponWindMultiplier(weapon, ignoresWind));
}

export function magnetShotAcceleration(
  position: Vec3,
  velocity: Vec3,
  targetTanks: TankState[],
  weapon: WeaponType,
): Vec3 {
  if (weapon !== "magnet") {
    return { x: 0, y: 0, z: 0 };
  }

  let nearest: { center: Vec3; distance: number } | null = null;
  for (const tank of targetTanks) {
    if (tank.hp <= 0) continue;
    const center = getTankCenter(tank);
    const distance = Math.hypot(center.x - position.x, center.z - position.z);
    if (distance <= MAGNET_SHOT_RANGE && (!nearest || distance < nearest.distance)) {
      nearest = { center, distance };
    }
  }

  if (!nearest || nearest.distance <= 0.001) {
    return { x: 0, y: 0, z: 0 };
  }

  const rangeRatio = clamp(nearest.distance / MAGNET_SHOT_RANGE, 0, 1);
  const pullRatio = 0.38 + 0.62 * Math.pow(1 - rangeRatio, 1.35);
  const strength = MAGNET_SHOT_ACCELERATION * pullRatio;
  const targetDirection = {
    x: (nearest.center.x - position.x) / nearest.distance,
    z: (nearest.center.z - position.z) / nearest.distance,
  };
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

  if (horizontalSpeed > 0.001) {
    const desiredVelocity = {
      x: targetDirection.x * horizontalSpeed,
      z: targetDirection.z * horizontalSpeed,
    };
    const correction = {
      x: desiredVelocity.x - velocity.x,
      z: desiredVelocity.z - velocity.z,
    };
    const correctionMagnitude = Math.hypot(correction.x, correction.z);
    if (correctionMagnitude > 0.001) {
      return {
        x: (correction.x / correctionMagnitude) * strength,
        y: 0,
        z: (correction.z / correctionMagnitude) * strength,
      };
    }
  }

  return {
    x: targetDirection.x * strength,
    y: 0,
    z: targetDirection.z * strength,
  };
}

export function projectileAcceleration(
  position: Vec3,
  velocity: Vec3,
  wind: Wind,
  weapon: WeaponType,
  ignoresWind: boolean,
  targetTanks: TankState[] = [],
): Vec3 {
  const windAccel = projectileWindAcceleration(wind, weapon, ignoresWind);
  const magnetAccel = magnetShotAcceleration(position, velocity, targetTanks, weapon);
  return {
    x: windAccel.x + magnetAccel.x,
    y: -GRAVITY,
    z: windAccel.z + magnetAccel.z,
  };
}

export function advanceProjectile(
  position: Vec3,
  velocity: Vec3,
  dt: number,
  wind: Wind,
  weapon: WeaponType,
  ignoresWind: boolean,
  targetTanks: TankState[] = [],
) {
  const acceleration = projectileAcceleration(
    position,
    velocity,
    wind,
    weapon,
    ignoresWind,
    targetTanks,
  );
  const nextVelocity = {
    x: velocity.x + acceleration.x * dt,
    y: velocity.y + acceleration.y * dt,
    z: velocity.z + acceleration.z * dt,
  };
  const nextPosition = {
    x: position.x + nextVelocity.x * dt,
    y: position.y + nextVelocity.y * dt,
    z: position.z + nextVelocity.z * dt,
  };

  return { position: nextPosition, velocity: nextVelocity };
}

export function gravityDamageMultiplier(profile?: ProjectileImpactProfile) {
  if (!profile) return 1;

  const apexRise = Math.max(0, profile.peakHeight - profile.launchHeight);
  const downwardSpeed = Math.max(0, -profile.impactVelocity.y);
  const heightScore = clamp(
    (apexRise - GRAVITY_DAMAGE_MIN_APEX_RISE) /
      (GRAVITY_DAMAGE_FULL_APEX_RISE - GRAVITY_DAMAGE_MIN_APEX_RISE),
    0,
    1,
  );
  const fallSpeedScore = clamp(
    (downwardSpeed - GRAVITY_DAMAGE_MIN_DOWNWARD_SPEED) /
      (GRAVITY_DAMAGE_FULL_DOWNWARD_SPEED - GRAVITY_DAMAGE_MIN_DOWNWARD_SPEED),
    0,
    1,
  );
  const airtimeScore = clamp((profile.flightTime - 1.2) / 4, 0, 1);
  const fallingGate = clamp(downwardSpeed / GRAVITY_DAMAGE_MIN_DOWNWARD_SPEED, 0, 1);
  const bonusScore = clamp((heightScore * 0.58 + fallSpeedScore * 0.34 + airtimeScore * 0.08) * fallingGate, 0, 1);

  return 1 + (GRAVITY_DAMAGE_MAX_MULTIPLIER - 1) * bonusScore;
}

export function calculateExplosionDamage(
  impact: Vec3,
  targetTank: TankState,
  weapon: WeaponType = "base",
  gravityMultiplier = 1,
) {
  const impactDistance = vec3Distance(impact, getTankCenter(targetTank));

  if (impactDistance >= EXPLOSION_RADIUS) {
    return 0;
  }

  return Math.round(
    MAX_EXPLOSION_DAMAGE *
      weaponDamageMultiplier(weapon) *
      gravityMultiplier *
      (1 - impactDistance / EXPLOSION_RADIUS),
  );
}

export function canMoveTankTo(
  tank: TankState,
  terrain: TerrainState,
  nextPosition: GroundPos,
  otherTanks: TankState[],
) {
  const clamped = clampGroundPosition(nextPosition, terrain);
  const nextHeight = terrainHeightAt(terrain, clamped);
  const heightDelta = Math.abs(nextHeight - tank.height);
  const farEnough = otherTanks.every(
    (other) => other.hp <= 0 || groundDistance(clamped, other.position) >= MIN_TANK_DISTANCE,
  );

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

export function previewTrajectory(
  tank: TankState,
  wind: Wind,
  weapon: WeaponType = "base",
  ignoresWind = false,
  targetTanks: TankState[] = [],
) {
  let position = getCannonTip(tank);
  let velocity = createLaunchVelocity(tank);
  const points: Vec3[] = [];

  for (let i = 0; i <= TRAJECTORY_PREVIEW_STEPS; i += 1) {
    points.push(position);
    const dt = TRAJECTORY_PREVIEW_TIME / TRAJECTORY_PREVIEW_STEPS;
    const next = advanceProjectile(position, velocity, dt, wind, weapon, ignoresWind, targetTanks);
    position = next.position;
    velocity = next.velocity;
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
  return CRATER_MIN_HEIGHT - 0.75;
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
