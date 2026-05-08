import {
  Flame,
  HeartPulse,
  Minus,
  Plus,
  RefreshCcw,
  Trophy,
  Wind as WindIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEFAULT_ELEVATION,
  KEYBOARD_AIM_ELEVATION_STEP,
  KEYBOARD_AIM_YAW_STEP,
  MAX_ELEVATION,
  MAX_POWER,
  MIN_ELEVATION,
  MIN_POWER,
  OMNISCIENT_MAX_DISTANCE,
  OMNISCIENT_MIN_DISTANCE,
} from "../game/constants";
import type {
  ExplosionState,
  GamePhase,
  RewardChoice,
  RewardItemType,
  TankState,
  TurnOwner,
  WeaponType,
  Wind,
} from "../game/gameTypes";

type GameHUDProps = {
  stage: number;
  playerTank: TankState;
  computerTanks: TankState[];
  activeEnemyIndex: number;
  turnOwner: TurnOwner;
  phase: GamePhase;
  wind: Wind;
  winner: TurnOwner | null;
  lastExplosion: ExplosionState | null;
  canPlayerAct: boolean;
  rewardChoices: RewardChoice[] | null;
  queuedWeapon: WeaponType;
  queuedWindIgnoreShots: number;
  activeMoveBonus: number;
  movementBudget: number;
  cameraDistance: number;
  onTurretYawChange: (delta: number) => void;
  onTurretYawSet: (value: number) => void;
  onElevationChange: (delta: number) => void;
  onElevationSet: (value: number) => void;
  onPowerChange: (delta: number) => void;
  onPowerSet: (value: number) => void;
  onJoystickMove: (xDirection: number, yDirection: number) => void;
  onCameraZoomChange: (delta: number) => void;
  onCameraZoomSet: (value: number) => void;
  onFire: () => void;
  onRewardChoice: (item: RewardItemType) => void;
  onReset: () => void;
};

type AimRangeProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  sliderValue?: number;
  sliderMin?: number;
  sliderMax?: number;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onSet: (value: number) => void;
  onSliderSet?: (value: number) => void;
};

type PowerRangeProps = Pick<
  AimRangeProps,
  "value" | "min" | "max" | "disabled" | "onDecrease" | "onIncrease" | "onSet"
>;

type JoystickVector = { x: number; y: number };

const MOBILE_AIM_DEAD_ZONE = 0.14;
const MOBILE_AIM_REPEAT_MS = 46;
const MOBILE_AIM_YAW_DELTA = 1.35;
const MOBILE_AIM_ELEVATION_DELTA = 0.85;

function hpPercent(hp: number) {
  return `${Math.max(0, Math.min(100, hp))}%`;
}

function tankHpPercent(tank: TankState) {
  return hpPercent((tank.hp / Math.max(1, tank.maxHp)) * 100);
}

function normalizePercent(value: number, min: number, max: number) {
  return `${Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100))}%`;
}

function signedAngleOffset(value: number, center: number) {
  return ((((value - center) % 360) + 540) % 360) - 180;
}

function valueToCenteredOffset(value: number, center: number, min: number, max: number) {
  if (value >= center) {
    return ((value - center) / Math.max(1, max - center)) * 100;
  }
  return -((center - value) / Math.max(1, center - min)) * 100;
}

function centeredOffsetToValue(offset: number, center: number, min: number, max: number) {
  if (offset >= 0) {
    return center + (offset / 100) * (max - center);
  }
  return center + (offset / 100) * (center - min);
}

function turnText(
  turnOwner: TurnOwner,
  phase: GamePhase,
  winner: TurnOwner | null,
  activeEnemyIndex: number,
  enemyCount: number,
) {
  if (winner) {
    return winner === "player" ? "Player wins" : "Computer wins";
  }

  if (phase === "stageClear") {
    return "Stage clear!";
  }

  if (phase === "projectileFlying") {
    return "Shell in flight";
  }

  if (phase === "exploding") {
    return "Impact";
  }

  if (turnOwner === "computer") {
    if (enemyCount > 1) {
      return `Computer ${activeEnemyIndex + 1}/${enemyCount} aiming...`;
    }
    return "Computer is aiming...";
  }

  return "Player aiming";
}

function weaponLabel(weapon: WeaponType) {
  if (weapon === "red") return "Red Shot";
  if (weapon === "earth") return "Earth Shot";
  if (weapon === "magnet") return "Magnet Shot";
  return "Base Shot";
}

function rewardMeta(item: RewardItemType) {
  if (item === "heal") {
    return { label: "Repair", detail: "+30 HP now", className: "reward-heal" };
  }
  if (item === "moveBoost") {
    return { label: "Move Boost", detail: "+5 movement now", className: "reward-move" };
  }
  if (item === "windShield") {
    return { label: "Wind Shield", detail: "Next shot ignores wind", className: "reward-wind" };
  }
  if (item === "redShot") {
    return { label: "Red Shot", detail: "2.2x damage, wind sensitive", className: "reward-red" };
  }
  if (item === "earthShot") {
    return { label: "Earth Shot", detail: "Bigger crater, +20% damage", className: "reward-earth" };
  }
  return { label: "Magnet Shot", detail: "Curves toward enemies", className: "reward-magnet" };
}

function rewardIcon(item: RewardItemType) {
  return (
    <img
      className="reward-icon"
      src={rewardIconSrc(item)}
      alt=""
      aria-hidden="true"
      decoding="async"
      loading="lazy"
    />
  );
}

function rewardIconSrc(item: RewardItemType) {
  if (item === "heal") return "/icons/heal.png";
  if (item === "moveBoost") return "/icons/move-boost.png";
  if (item === "windShield") return "/icons/wind-shield.png";
  if (item === "redShot") return "/icons/red-shot.png";
  if (item === "earthShot") return "/icons/earth-shot.png";
  return "/icons/magnet-shot.png";
}

function shotResultMeta(explosion: ExplosionState) {
  const target = explosion.target === "player" ? "Player" : "CPU";

  if (explosion.damage <= 0) {
    return {
      title: "No Damage",
      detail: "Shot landed outside blast range",
      className: "shot-result-miss",
    };
  }

  if (explosion.gravityMultiplier > 1.08) {
    return {
      title: "Gravity Impact",
      detail: `${target} -${explosion.damage} HP  |  x${explosion.gravityMultiplier.toFixed(1)} fall bonus`,
      className: "shot-result-gravity",
    };
  }

  return {
    title: "Hit Confirmed",
    detail: `${target} -${explosion.damage} HP`,
    className: "shot-result-hit",
  };
}

function AimRange({
  label,
  value,
  min,
  max,
  unit,
  sliderValue,
  sliderMin,
  sliderMax,
  disabled,
  onDecrease,
  onIncrease,
  onSet,
  onSliderSet,
}: AimRangeProps) {
  const inputValue = sliderValue ?? value;
  const inputMin = sliderMin ?? min;
  const inputMax = sliderMax ?? max;
  const fill = normalizePercent(inputValue, inputMin, inputMax);

  return (
    <div className="aim-range">
      <div className="control-label-row">
        <span>{label}</span>
        <strong>
          {Math.round(value)}
          {unit}
        </strong>
      </div>
      <div className="range-row">
        <button
          type="button"
          className="round-step-button"
          disabled={disabled}
          onClick={onDecrease}
          title={`Lower ${label.toLowerCase()}`}
        >
          <Minus size={18} />
        </button>
        <input
          className="hud-range horizontal-range"
          type="range"
          min={inputMin}
          max={inputMax}
          step={1}
          value={Math.round(inputValue)}
          disabled={disabled}
          onChange={(event) => (onSliderSet ?? onSet)(Number(event.currentTarget.value))}
          style={{ "--fill": fill } as CSSProperties}
          aria-label={label}
        />
        <button
          type="button"
          className="round-step-button"
          disabled={disabled}
          onClick={onIncrease}
          title={`Raise ${label.toLowerCase()}`}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function PowerRange({
  value,
  min,
  max,
  disabled,
  onDecrease,
  onIncrease,
  onSet,
}: PowerRangeProps) {
  const fill = normalizePercent(value, min, max);

  return (
    <div className="power-control">
      <div className="control-label-row power-title">
        <span>Power</span>
        <strong>{Math.round(Number.parseFloat(fill))}%</strong>
      </div>
      <div className="power-vertical-row">
        <input
          className="hud-range power-vertical-range"
          type="range"
          min={min}
          max={max}
          step={1}
          value={Math.round(value)}
          disabled={disabled}
          onChange={(event) => onSet(Number(event.currentTarget.value))}
          style={{ "--fill": fill } as CSSProperties}
          aria-label="Power"
        />
        <div className="power-button-stack">
          <button
            type="button"
            className="round-step-button"
            disabled={disabled}
            onClick={onIncrease}
            title="Raise power"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="round-step-button"
            disabled={disabled}
            onClick={onDecrease}
            title="Lower power"
          >
            <Minus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MobilePowerControl({
  value,
  min,
  max,
  disabled,
  onDecrease,
  onIncrease,
}: Omit<PowerRangeProps, "onSet">) {
  const fill = normalizePercent(value, min, max);

  return (
    <div className="mobile-power-control">
      <div className="mobile-power-row">
        <button
          type="button"
          className="round-step-button mobile-power-step"
          disabled={disabled}
          onClick={onDecrease}
          title="Lower power"
          aria-label="Lower power"
        >
          <Minus size={16} />
        </button>
        <strong className="mobile-power-value">{Math.round(Number.parseFloat(fill))}%</strong>
        <button
          type="button"
          className="round-step-button mobile-power-step"
          disabled={disabled}
          onClick={onIncrease}
          title="Raise power"
          aria-label="Raise power"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function MovementMeter({
  remaining,
  budget,
  compact = false,
}: {
  remaining: number;
  budget: number;
  compact?: boolean;
}) {
  const movePercent = hpPercent((remaining / Math.max(1, budget)) * 100);

  return (
    <div className={`movement-meter${compact ? " movement-meter-compact" : ""}`}>
      {compact ? (
        <div className="movement-compact-value">{remaining.toFixed(1)} m</div>
      ) : (
        <div className="control-label-row">
          <span>Movement</span>
          <strong>{remaining.toFixed(1)} m</strong>
        </div>
      )}
      <div className="movement-track" aria-label="Movement remaining">
        <div className="movement-fill" style={{ width: movePercent }} />
      </div>
    </div>
  );
}

function MobileAimJoystick({
  yaw,
  elevation,
  disabled,
  onYawChange,
  onElevationChange,
}: {
  yaw: number;
  elevation: number;
  disabled: boolean;
  onYawChange: (delta: number) => void;
  onElevationChange: (delta: number) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const vectorRef = useRef<JoystickVector>({ x: 0, y: 0 });
  const [vector, setVector] = useState<JoystickVector>({ x: 0, y: 0 });

  useEffect(() => {
    if (disabled) {
      vectorRef.current = { x: 0, y: 0 };
      setVector({ x: 0, y: 0 });
      return undefined;
    }

    let frame = 0;
    let lastAimAt = 0;
    const tick = (time: number) => {
      const current = vectorRef.current;
      const yawInput = Math.abs(current.x) > MOBILE_AIM_DEAD_ZONE ? current.x : 0;
      const elevationInput = Math.abs(current.y) > MOBILE_AIM_DEAD_ZONE ? current.y : 0;

      if ((yawInput || elevationInput) && time - lastAimAt > MOBILE_AIM_REPEAT_MS) {
        if (yawInput) {
          onYawChange(yawInput * MOBILE_AIM_YAW_DELTA);
        }
        if (elevationInput) {
          onElevationChange(-elevationInput * MOBILE_AIM_ELEVATION_DELTA);
        }
        lastAimAt = time;
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [disabled, onElevationChange, onYawChange]);

  const updateVector = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const rawX = (event.clientX - (rect.left + rect.width / 2)) / radius;
    const rawY = ((rect.top + rect.height / 2) - event.clientY) / radius;
    const magnitude = Math.hypot(rawX, rawY);
    const next =
      magnitude > 1
        ? { x: rawX / magnitude, y: rawY / magnitude }
        : { x: rawX, y: rawY };
    vectorRef.current = next;
    setVector(next);
  };

  const stop = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    vectorRef.current = { x: 0, y: 0 };
    setVector({ x: 0, y: 0 });
  };

  return (
    <div className={`mobile-aim-controls${disabled ? " mobile-aim-disabled" : ""}`}>
      <div className="mobile-aim-header">
        <span>Aim</span>
      </div>
      <div className="mobile-aim-pad-wrap">
        <button
          type="button"
          className="aim-step-button aim-step-up"
          disabled={disabled}
          onClick={() => onElevationChange(-KEYBOARD_AIM_ELEVATION_STEP)}
          title="Lower elevation"
          aria-label="Lower elevation"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="aim-step-button aim-step-left"
          disabled={disabled}
          onClick={() => onYawChange(-KEYBOARD_AIM_YAW_STEP)}
          title="Rotate left"
          aria-label="Rotate left"
        >
          <Minus size={15} />
        </button>
        <div
          className="aim-joystick-pad"
          onPointerDown={(event) => {
            if (disabled) return;
            pointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateVector(event);
          }}
          onPointerMove={(event) => {
            if (disabled || pointerIdRef.current !== event.pointerId) return;
            updateVector(event);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
        >
          <div
            className="aim-joystick-thumb"
            style={{
              transform: `translate(calc(-50% + ${vector.x * 23}px), calc(-50% + ${-vector.y * 23}px))`,
            }}
          />
        </div>
        <button
          type="button"
          className="aim-step-button aim-step-right"
          disabled={disabled}
          onClick={() => onYawChange(KEYBOARD_AIM_YAW_STEP)}
          title="Rotate right"
          aria-label="Rotate right"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="aim-step-button aim-step-down"
          disabled={disabled}
          onClick={() => onElevationChange(KEYBOARD_AIM_ELEVATION_STEP)}
          title="Raise elevation"
          aria-label="Raise elevation"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="mobile-aim-values">
        <span>
          Rotation <strong>{Math.round(yaw)} deg</strong>
        </span>
        <span>
          Elevation <strong>{Math.round(elevation)} deg</strong>
        </span>
      </div>
    </div>
  );
}

function CameraZoomControl({
  value,
  disabled,
  onChange,
  onSet,
}: {
  value: number;
  disabled: boolean;
  onChange: (delta: number) => void;
  onSet: (value: number) => void;
}) {
  const fill = normalizePercent(value, OMNISCIENT_MIN_DISTANCE, OMNISCIENT_MAX_DISTANCE);

  return (
    <div className={`camera-zoom-control${disabled ? " camera-zoom-disabled" : ""}`}>
      <button
        type="button"
        className="camera-zoom-button"
        disabled={disabled}
        onClick={() => onChange(-4)}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn size={18} />
      </button>
      <input
        className="camera-zoom-range"
        type="range"
        min={OMNISCIENT_MIN_DISTANCE}
        max={OMNISCIENT_MAX_DISTANCE}
        step={1}
        value={Math.round(value)}
        disabled={disabled}
        onChange={(event) => onSet(Number(event.currentTarget.value))}
        style={{ "--fill": fill } as CSSProperties}
        aria-label="Camera zoom"
      />
      <button
        type="button"
        className="camera-zoom-button"
        disabled={disabled}
        onClick={() => onChange(4)}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut size={18} />
      </button>
    </div>
  );
}

function MobileJoystick({
  disabled,
  onMove,
  className = "",
  travel = 34,
}: {
  disabled: boolean;
  onMove: (xDirection: number, yDirection: number) => void;
  className?: string;
  travel?: number;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const vectorRef = useRef<JoystickVector>({ x: 0, y: 0 });
  const [vector, setVector] = useState<JoystickVector>({ x: 0, y: 0 });

  useEffect(() => {
    if (disabled) {
      vectorRef.current = { x: 0, y: 0 };
      setVector({ x: 0, y: 0 });
      return undefined;
    }

    let frame = 0;
    let lastMoveAt = 0;
    const tick = (time: number) => {
      const current = vectorRef.current;
      if (Math.hypot(current.x, current.y) > 0.12 && time - lastMoveAt > 42) {
        onMove(current.x, current.y);
        lastMoveAt = time;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [disabled, onMove]);

  const updateVector = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const rawX = (event.clientX - (rect.left + rect.width / 2)) / radius;
    const rawY = ((rect.top + rect.height / 2) - event.clientY) / radius;
    const magnitude = Math.hypot(rawX, rawY);
    const next =
      magnitude > 1
        ? { x: rawX / magnitude, y: rawY / magnitude }
        : { x: rawX, y: rawY };
    vectorRef.current = next;
    setVector(next);
  };

  const stop = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    vectorRef.current = { x: 0, y: 0 };
    setVector({ x: 0, y: 0 });
  };

  return (
    <div
      className={`joystick-shell${className ? ` ${className}` : ""}${
        disabled ? " joystick-disabled" : ""
      }`}
    >
      <div
        className="joystick-pad"
        onPointerDown={(event) => {
          if (disabled) return;
          pointerIdRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateVector(event);
        }}
        onPointerMove={(event) => {
          if (disabled || pointerIdRef.current !== event.pointerId) return;
          updateVector(event);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div
          className="joystick-thumb"
          style={{
            transform: `translate(calc(-50% + ${vector.x * travel}px), calc(-50% + ${-vector.y * travel}px))`,
          }}
        />
      </div>
    </div>
  );
}

export function GameHUD({
  stage,
  playerTank,
  computerTanks,
  activeEnemyIndex,
  turnOwner,
  phase,
  wind,
  winner,
  lastExplosion,
  canPlayerAct,
  rewardChoices,
  queuedWeapon,
  queuedWindIgnoreShots,
  activeMoveBonus,
  movementBudget,
  cameraDistance,
  onTurretYawChange,
  onTurretYawSet,
  onElevationChange,
  onElevationSet,
  onPowerChange,
  onPowerSet,
  onJoystickMove,
  onCameraZoomChange,
  onCameraZoomSet,
  onFire,
  onRewardChoice,
  onReset,
}: GameHUDProps) {
  const disableControls = !canPlayerAct;
  const enemyCount = computerTanks.length;
  const isChoosingReward = Boolean(rewardChoices);
  const disableCameraZoom = isChoosingReward || phase === "stageClear" || Boolean(winner);
  const [rotationCenterYaw, setRotationCenterYaw] = useState(playerTank.turretYaw);
  const wasPlayerAimingRef = useRef(false);
  const lastStageRef = useRef(stage);
  const isPlayerAimingPhase = turnOwner === "player" && phase === "aiming" && !winner;
  const rotationOffset = signedAngleOffset(playerTank.turretYaw, rotationCenterYaw);
  const elevationOffset = valueToCenteredOffset(
    playerTank.elevation,
    DEFAULT_ELEVATION,
    MIN_ELEVATION,
    MAX_ELEVATION,
  );
  const shotResult =
    lastExplosion && phase === "exploding" ? shotResultMeta(lastExplosion) : null;

  useEffect(() => {
    if (isPlayerAimingPhase && (!wasPlayerAimingRef.current || lastStageRef.current !== stage)) {
      setRotationCenterYaw(playerTank.turretYaw);
    }
    wasPlayerAimingRef.current = isPlayerAimingPhase;
    lastStageRef.current = stage;
  }, [isPlayerAimingPhase, playerTank.turretYaw, stage]);

  return (
    <div className="hud-layer">
      <section className="status-strip hud-panel">
        <div className="status-left">
          <div className="stage-chip">Stage {stage}</div>
          <div className="turn-chip">
            {isChoosingReward
              ? "Choose supply reward"
              : turnText(turnOwner, phase, winner, activeEnemyIndex, enemyCount)}
          </div>
        </div>
        <div className="status-health-grid">
          <div className="status-health">
            <div className="hp-label">
              <HeartPulse size={15} />
              Player
            </div>
            <div className="hp-track">
              <div className="hp-fill player-hp" style={{ width: tankHpPercent(playerTank) }} />
            </div>
            <strong>{Math.round(playerTank.hp)}</strong>
          </div>
          {computerTanks.map((tank, index) => {
            const isActive =
              turnOwner === "computer" && index === activeEnemyIndex && tank.hp > 0;
            const label = enemyCount > 1 ? `CPU ${index + 1}` : "CPU";
            return (
              <div
                className={`status-health status-enemy${isActive ? " status-health-active" : ""}${
                  tank.hp <= 0 ? " status-health-defeated" : ""
                }`}
                key={index}
              >
                <div className="hp-label">
                  <HeartPulse size={15} />
                  {label}
                </div>
                <div className="hp-track">
                  <div
                    className="hp-fill cpu-hp"
                    style={{ width: tankHpPercent(tank) }}
                  />
                </div>
                <strong>{Math.round(Math.max(0, tank.hp))}</strong>
              </div>
            );
          })}
        </div>
        <div className="status-meta">
          <span className="meta-chip">
            <WindIcon size={14} />
            {wind.label} {wind.strength}
          </span>
          {queuedWeapon !== "base" && (
            <span className={`meta-chip effect-${queuedWeapon}`}>
              Next {weaponLabel(queuedWeapon)}
            </span>
          )}
          {queuedWindIgnoreShots > 0 && (
            <span className="meta-chip effect-wind">
              Wind Shield
            </span>
          )}
          {activeMoveBonus > 0 && (
            <span className="meta-chip effect-move">+{activeMoveBonus} move active</span>
          )}
        </div>
      </section>

      {shotResult && (
        <section className={`shot-result-toast ${shotResult.className}`} aria-live="polite">
          <div className="shot-result-title">{shotResult.title}</div>
          <div className="shot-result-detail">{shotResult.detail}</div>
        </section>
      )}

      <section className="control-deck" aria-label="Tank controls">
        <div className="control-card aim-card hud-panel">
          <div className="desktop-aim-controls">
            <AimRange
              label="Rotation"
              value={playerTank.turretYaw}
              min={0}
              max={360}
              unit=" deg"
              sliderValue={rotationOffset}
              sliderMin={-180}
              sliderMax={180}
              disabled={disableControls}
              onDecrease={() => onTurretYawChange(-KEYBOARD_AIM_YAW_STEP)}
              onIncrease={() => onTurretYawChange(KEYBOARD_AIM_YAW_STEP)}
              onSet={onTurretYawSet}
              onSliderSet={(offset) => onTurretYawSet(rotationCenterYaw + offset)}
            />
            <AimRange
              label="Elevation"
              value={playerTank.elevation}
              min={MIN_ELEVATION}
              max={MAX_ELEVATION}
              unit=" deg"
              sliderValue={elevationOffset}
              sliderMin={-100}
              sliderMax={100}
              disabled={disableControls}
              onDecrease={() => onElevationChange(-KEYBOARD_AIM_ELEVATION_STEP)}
              onIncrease={() => onElevationChange(KEYBOARD_AIM_ELEVATION_STEP)}
              onSet={onElevationSet}
              onSliderSet={(offset) =>
                onElevationSet(
                  centeredOffsetToValue(offset, DEFAULT_ELEVATION, MIN_ELEVATION, MAX_ELEVATION),
                )
              }
            />
            <MovementMeter
              remaining={playerTank.movementRemaining}
              budget={movementBudget}
            />
            <div className="desktop-card-guide">
              <span>
                <kbd>Arrow Keys</kbd>
                Aim
              </span>
            </div>
          </div>
          <MobileAimJoystick
            yaw={playerTank.turretYaw}
            elevation={playerTank.elevation}
            disabled={disableControls}
            onYawChange={onTurretYawChange}
            onElevationChange={onElevationChange}
          />
        </div>

        <div className="fire-cluster">
          <div
            className="fire-button-wrap"
            style={
              {
                "--power-fill": normalizePercent(playerTank.power, MIN_POWER, MAX_POWER),
              } as CSSProperties
            }
          >
            <button
              type="button"
              className="fire-orb"
              disabled={disableControls}
              onClick={onFire}
              title="Fire"
            >
              <Flame size={22} />
              FIRE!
            </button>
          </div>
          <MobilePowerControl
            value={playerTank.power}
            min={MIN_POWER}
            max={MAX_POWER}
            disabled={disableControls}
            onDecrease={() => onPowerChange(-3)}
            onIncrease={() => onPowerChange(3)}
          />
        </div>

        <div className="control-card power-card move-card hud-panel">
          <div className="desktop-power-controls">
            <PowerRange
              value={playerTank.power}
              min={MIN_POWER}
              max={MAX_POWER}
              disabled={disableControls}
              onDecrease={() => onPowerChange(-3)}
              onIncrease={() => onPowerChange(3)}
              onSet={onPowerSet}
            />
            <div className="desktop-card-guide power-key-guide">
              <span>
                <kbd>E</kbd>
                + Power
              </span>
              <span>
                <kbd>Q</kbd>
                - Power
              </span>
            </div>
          </div>
          <div className="mobile-move-controls">
            <div className="mobile-move-header">Move</div>
            <MobileJoystick disabled={disableControls} onMove={onJoystickMove} travel={25} />
            <MovementMeter
              remaining={playerTank.movementRemaining}
              budget={movementBudget}
              compact
            />
          </div>
        </div>
      </section>

      <CameraZoomControl
        value={cameraDistance}
        disabled={disableCameraZoom}
        onChange={onCameraZoomChange}
        onSet={onCameraZoomSet}
      />

      <div className="control-hints">
        <span>Drag Rotate</span>
        <span>Right-Drag Pan</span>
        <span>Wheel Zoom</span>
        <span>WASD Move</span>
      </div>

      {rewardChoices && (
        <section className="reward-panel hud-panel">
          <div className="reward-title">Supply Drop</div>
          <div className="reward-copy">Choose one upgrade.</div>
          <div className="reward-grid">
            {rewardChoices.map((choice) => {
              const meta = rewardMeta(choice.item);
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={`reward-button ${meta.className}`}
                  onClick={() => onRewardChoice(choice.item)}
                >
                  {rewardIcon(choice.item)}
                  <span>{meta.label}</span>
                  <strong>{meta.detail}</strong>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {phase === "stageClear" && (
        <section className="winner-panel hud-panel">
          <div className="winner-title">
            <Trophy size={20} /> Stage {stage} Clear
          </div>
          <div className="winner-copy">Loading next stage...</div>
        </section>
      )}

      {winner && (
        <section className="winner-panel hud-panel">
          <div className="winner-title">Defeat</div>
          <div className="winner-copy">Your tank is out. You reached Stage {stage}.</div>
          <button type="button" className="reset-button" onClick={onReset}>
            <RefreshCcw size={18} />
            Restart
          </button>
        </section>
      )}
    </div>
  );
}
