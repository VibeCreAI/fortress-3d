export const GROUND_MIN_X = -20;
export const GROUND_MAX_X = 20;
export const GROUND_MIN_Y = -12;
export const GROUND_MAX_Y = 12;
export const TERRAIN_CELL_SIZE = 1;
export const TERRAIN_WIDTH = 41;
export const TERRAIN_DEPTH = 25;
export const TERRAIN_MIN_HEIGHT = -0.35;
export const TERRAIN_MAX_HEIGHT = 4.4;
export const TERRAIN_BASE_DEPTH = 3.1;

export const PLAYER_START_POSITION = { x: -13, y: -5 };
export const COMPUTER_START_POSITION = { x: 13, y: 5 };
export const MIN_TANK_DISTANCE = 4.8;

export const STARTING_HP = 100;
export const MOVEMENT_PER_TURN = 7;
export const PLAYER_MOVE_STEP = 0.38;
export const MAX_TANK_STEP_HEIGHT = 1.05;

export const MIN_ELEVATION = 4;
export const MAX_ELEVATION = 84;
export const DEFAULT_ELEVATION = 32;
export const MIN_POWER = 12;
export const MAX_POWER = 115;
export const KEYBOARD_AIM_YAW_STEP = 3;
export const KEYBOARD_AIM_ELEVATION_STEP = 2;

export const TANK_CENTER_HEIGHT = 0.95;
export const TANK_HIT_RADIUS = 1.55;
export const CANNON_BASE_HEIGHT = 1.55;
export const CANNON_BASE_FORWARD_OFFSET = 0.55;
export const CANNON_LENGTH = 2.35;

export const GRAVITY = 18;
export const POWER_TO_VELOCITY = 0.34;
export const WIND_ACCELERATION_SCALE = 0.5;
export const PROJECTILE_MAX_FLIGHT_TIME = 9;

export const EXPLOSION_RADIUS = 4.2;
export const MAX_EXPLOSION_DAMAGE = 36;
export const EXPLOSION_DURATION_MS = 1150;
export const CRATER_DEPTH = 1.35;
export const GRAVITY_DAMAGE_MIN_APEX_RISE = 5;
export const GRAVITY_DAMAGE_FULL_APEX_RISE = 22;
export const GRAVITY_DAMAGE_MIN_DOWNWARD_SPEED = 10;
export const GRAVITY_DAMAGE_FULL_DOWNWARD_SPEED = 32;
export const GRAVITY_DAMAGE_MAX_MULTIPLIER = 1.85;

export const SUPPLY_DROP_CHANCE = 0.35;
export const SUPPLY_DROP_PICKUP_RADIUS = 1.7;
export const SUPPLY_DROP_MIN_DISTANCE = 4;
export const SUPPLY_DROP_MAX_DISTANCE = 7;
export const SUPPLY_DROP_AVOID_RADIUS = 2.5;
export const SUPPLY_DROP_DELIVERY_MS = 2400;
export const REWARD_HEAL_AMOUNT = 30;
export const REWARD_MOVE_BONUS = 5;
export const MAGNET_SHOT_RANGE = 18;
export const MAGNET_SHOT_ACCELERATION = 11;

export const TRAJECTORY_PREVIEW_TIME = 0.58;
export const TRAJECTORY_PREVIEW_STEPS = 18;

export const FIRST_PERSON_MIN_FOV = 34;
export const FIRST_PERSON_MAX_FOV = 78;
export const FIRST_PERSON_DEFAULT_FOV = 56;

export const THIRD_PERSON_MIN_DISTANCE = 9;
export const THIRD_PERSON_MAX_DISTANCE = 26;
export const THIRD_PERSON_DEFAULT_DISTANCE = 15;

export const OMNISCIENT_MIN_DISTANCE = 26;
export const OMNISCIENT_MAX_DISTANCE = 78;
export const OMNISCIENT_DEFAULT_DISTANCE = 38;

export const STAGE_CLEAR_DELAY_MS = 1700;

export type StageConfig = {
  index: number;
  terrainWidth: number;
  terrainDepth: number;
  boundsX: number;
  boundsY: number;
  hillCount: number;
  hillHeightMin: number;
  hillHeightMax: number;
  hillRadiusMin: number;
  hillRadiusMax: number;
  noiseAmplitude: number;
  enemyCount: number;
  enemyHp: number;
  seedOffset: number;
};

export const STAGE_CONFIGS: StageConfig[] = [
  {
    index: 1,
    terrainWidth: 41,
    terrainDepth: 25,
    boundsX: 20,
    boundsY: 12,
    hillCount: 4,
    hillHeightMin: 0.9,
    hillHeightMax: 1.8,
    hillRadiusMin: 5.5,
    hillRadiusMax: 7.4,
    noiseAmplitude: 1.0,
    enemyCount: 1,
    enemyHp: 100,
    seedOffset: 11,
  },
  {
    index: 2,
    terrainWidth: 47,
    terrainDepth: 29,
    boundsX: 23,
    boundsY: 14,
    hillCount: 5,
    hillHeightMin: 1.0,
    hillHeightMax: 2.1,
    hillRadiusMin: 5.0,
    hillRadiusMax: 7.4,
    noiseAmplitude: 1.15,
    enemyCount: 1,
    enemyHp: 115,
    seedOffset: 23,
  },
  {
    index: 3,
    terrainWidth: 54,
    terrainDepth: 33,
    boundsX: 26,
    boundsY: 16,
    hillCount: 6,
    hillHeightMin: 1.0,
    hillHeightMax: 2.3,
    hillRadiusMin: 4.8,
    hillRadiusMax: 7.6,
    noiseAmplitude: 1.25,
    enemyCount: 2,
    enemyHp: 100,
    seedOffset: 47,
  },
  {
    index: 4,
    terrainWidth: 60,
    terrainDepth: 37,
    boundsX: 29,
    boundsY: 18,
    hillCount: 7,
    hillHeightMin: 1.1,
    hillHeightMax: 2.5,
    hillRadiusMin: 4.6,
    hillRadiusMax: 7.8,
    noiseAmplitude: 1.35,
    enemyCount: 2,
    enemyHp: 120,
    seedOffset: 71,
  },
  {
    index: 5,
    terrainWidth: 66,
    terrainDepth: 41,
    boundsX: 32,
    boundsY: 20,
    hillCount: 8,
    hillHeightMin: 1.2,
    hillHeightMax: 2.7,
    hillRadiusMin: 4.4,
    hillRadiusMax: 8.0,
    noiseAmplitude: 1.45,
    enemyCount: 3,
    enemyHp: 110,
    seedOffset: 95,
  },
];

export function getStageConfig(stage: number): StageConfig {
  if (stage <= 1) return STAGE_CONFIGS[0];
  if (stage <= STAGE_CONFIGS.length) return STAGE_CONFIGS[stage - 1];

  const last = STAGE_CONFIGS[STAGE_CONFIGS.length - 1];
  const extra = stage - STAGE_CONFIGS.length;
  return {
    index: stage,
    terrainWidth: Math.min(95, last.terrainWidth + extra * 4),
    terrainDepth: Math.min(60, last.terrainDepth + extra * 3),
    boundsX: Math.min(46, last.boundsX + extra * 2),
    boundsY: Math.min(30, last.boundsY + extra * 1.5),
    hillCount: Math.min(14, last.hillCount + extra),
    hillHeightMin: 1.2,
    hillHeightMax: Math.min(3.4, last.hillHeightMax + extra * 0.12),
    hillRadiusMin: 4.4,
    hillRadiusMax: 8.0,
    noiseAmplitude: Math.min(1.8, last.noiseAmplitude + extra * 0.06),
    enemyCount: Math.min(5, last.enemyCount + Math.floor(extra / 2) + 1),
    enemyHp: 115 + extra * 6,
    seedOffset: last.seedOffset + 31 * extra,
  };
}
