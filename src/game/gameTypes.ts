export type TurnOwner = "player" | "computer";

export type GamePhase =
  | "aiming"
  | "projectileFlying"
  | "exploding"
  | "turnTransition"
  | "gameOver";

export type CameraMode = "firstPerson" | "thirdPerson";

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
  bodyYaw: number;
  turretYaw: number;
  elevation: number;
  power: number;
  movementRemaining: number;
};

export type ProjectileLaunch = {
  id: number;
  owner: TurnOwner;
  start: Vec3;
  velocity: Vec3;
};

export type ExplosionState = {
  id: number;
  owner: TurnOwner;
  position: Vec3;
  damage: number;
  target: TurnOwner;
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
