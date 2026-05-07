export type TurnOwner = "player" | "computer";

export type WeaponType = "base" | "red" | "earth" | "magnet";

export type RewardItemType =
  | "heal"
  | "moveBoost"
  | "windShield"
  | "redShot"
  | "earthShot"
  | "magnetShot";

export type GamePhase =
  | "aiming"
  | "projectileFlying"
  | "exploding"
  | "turnTransition"
  | "stageClear"
  | "gameOver";

export type GroundPos = {
  x: number;
  y: number;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Wind = {
  vector: GroundPos;
  strength: number;
  bearing: number;
  label: string;
};

export type TerrainState = {
  minX: number;
  minY: number;
  width: number;
  depth: number;
  cellSize: number;
  heights: number[][];
};

export type TankState = {
  position: GroundPos;
  height: number;
  hp: number;
  maxHp: number;
  bodyYaw: number;
  turretYaw: number;
  elevation: number;
  power: number;
  movementRemaining: number;
};

export type SupplyDrop = {
  id: number;
  position: GroundPos;
  height: number;
  createdAtMs: number;
  readyAtMs: number;
};

export type RewardChoice = {
  id: number;
  item: RewardItemType;
};

export type ProjectileLaunch = {
  id: number;
  owner: TurnOwner;
  start: Vec3;
  velocity: Vec3;
  weapon: WeaponType;
  ignoresWind: boolean;
};

export type ExplosionState = {
  id: number;
  owner: TurnOwner;
  position: Vec3;
  damage: number;
  target: TurnOwner;
  weapon: WeaponType;
};

export type ComputerPlan = {
  position: GroundPos;
  height: number;
  bodyYaw: number;
  turretYaw: number;
  elevation: number;
  power: number;
  movementRemaining: number;
};
