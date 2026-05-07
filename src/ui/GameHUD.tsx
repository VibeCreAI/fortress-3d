import {
  ChevronDown,
  ChevronUp,
  Compass,
  Flame,
  Gauge,
  HeartPulse,
  Minus,
  MoveHorizontal,
  Plus,
  RefreshCcw,
  Trophy,
  Wind as WindIcon,
  ZoomIn,
} from "lucide-react";
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
  omniscientDistance: number;
  rewardChoices: RewardChoice[] | null;
  queuedWeapon: WeaponType;
  queuedWindIgnoreShots: number;
  queuedMoveBonus: number;
  onElevationChange: (delta: number) => void;
  onPowerChange: (delta: number) => void;
  onFire: () => void;
  onRewardChoice: (item: RewardItemType) => void;
  onReset: () => void;
};

function hpPercent(hp: number) {
  return `${Math.max(0, Math.min(100, hp))}%`;
}

function tankHpPercent(tank: TankState) {
  return hpPercent((tank.hp / Math.max(1, tank.maxHp)) * 100);
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
    return { label: "Move Boost", detail: "+5 next turn", className: "reward-move" };
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
  if (item === "heal") return <HeartPulse size={18} />;
  if (item === "moveBoost") return <MoveHorizontal size={18} />;
  if (item === "windShield") return <WindIcon size={18} />;
  if (item === "redShot") return <Flame size={18} />;
  if (item === "earthShot") return <ChevronDown size={18} />;
  return <Compass size={18} />;
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
  omniscientDistance,
  rewardChoices,
  queuedWeapon,
  queuedWindIgnoreShots,
  queuedMoveBonus,
  onElevationChange,
  onPowerChange,
  onFire,
  onRewardChoice,
  onReset,
}: GameHUDProps) {
  const disableControls = !canPlayerAct;
  const enemyCount = computerTanks.length;
  const isChoosingReward = Boolean(rewardChoices);
  const hasQueuedEffects =
    queuedWeapon !== "base" || queuedWindIgnoreShots > 0 || queuedMoveBonus > 0;

  return (
    <div className="hud-layer">
      <section className="combat-panel hud-panel">
        <div className="stage-chip">Stage {stage}</div>
        <div className="turn-chip">
          {isChoosingReward
            ? "Choose supply reward"
            : turnText(turnOwner, phase, winner, activeEnemyIndex, enemyCount)}
        </div>
        <div className="hp-row">
          <div className="hp-label">
            <HeartPulse size={16} />
            Player
          </div>
          <div className="hp-track">
            <div className="hp-fill player-hp" style={{ width: tankHpPercent(playerTank) }} />
          </div>
          <span>{Math.round(playerTank.hp)}</span>
        </div>
        {computerTanks.map((tank, i) => {
          const labelSuffix = enemyCount > 1 ? ` ${i + 1}` : "";
          const isActive = turnOwner === "computer" && i === activeEnemyIndex && tank.hp > 0;
          return (
            <div className={`hp-row${isActive ? " hp-row-active" : ""}`} key={i}>
              <div className="hp-label">
                <HeartPulse size={16} />
                {`CPU${labelSuffix}`}
              </div>
              <div className="hp-track">
                <div
                  className="hp-fill cpu-hp"
                  style={{
                    width: tankHpPercent(tank),
                    opacity: tank.hp > 0 ? 1 : 0.3,
                  }}
                />
              </div>
              <span>{Math.round(tank.hp)}</span>
            </div>
          );
        })}
        {lastExplosion && phase === "exploding" && (
          <div className="impact-note">
            {lastExplosion.damage > 0
              ? `${lastExplosion.target === "player" ? "Player" : "CPU"} took ${lastExplosion.damage}`
              : "No damage"}
          </div>
        )}
      </section>

      <section className="aim-panel hud-panel">
        <div className="stat-grid three-d-stat-grid">
          <div className="stat-cell">
            <Compass size={17} />
            <span>Yaw</span>
            <strong>{Math.round(playerTank.turretYaw)} deg</strong>
          </div>
          <div className="stat-cell">
            <Compass size={17} />
            <span>Elev</span>
            <strong>{Math.round(playerTank.elevation)} deg</strong>
          </div>
          <div className="stat-cell">
            <Gauge size={17} />
            <span>Power</span>
            <strong>{Math.round(playerTank.power)}</strong>
          </div>
          <div className="stat-cell">
            <WindIcon size={17} />
            <span>Wind</span>
            <strong>
              {wind.label} {wind.strength}
            </strong>
          </div>
          <div className="stat-cell">
            <MoveHorizontal size={17} />
            <span>Move</span>
            <strong>{playerTank.movementRemaining.toFixed(1)}</strong>
          </div>
          <div className="stat-cell">
            <ZoomIn size={17} />
            <span>Height</span>
            <strong>{omniscientDistance.toFixed(1)} m</strong>
          </div>
          <div className="stat-cell">
            <MoveHorizontal size={17} />
            <span>Pos</span>
            <strong>
              {playerTank.position.x.toFixed(1)}, {playerTank.position.y.toFixed(1)}
            </strong>
          </div>
          <div className="stat-cell">
            <ChevronUp size={17} />
            <span>Alt</span>
            <strong>{playerTank.height.toFixed(1)}</strong>
          </div>
        </div>

        {hasQueuedEffects && (
          <div className="effect-row">
            {queuedWeapon !== "base" && (
              <span className={`effect-chip effect-${queuedWeapon}`}>
                <Flame size={14} />
                Next: {weaponLabel(queuedWeapon)}
              </span>
            )}
            {queuedWindIgnoreShots > 0 && (
              <span className="effect-chip effect-wind">
                <WindIcon size={14} />
                Wind Shield
              </span>
            )}
            {queuedMoveBonus > 0 && (
              <span className="effect-chip effect-move">
                <MoveHorizontal size={14} />
                +{queuedMoveBonus} next move
              </span>
            )}
          </div>
        )}

        <div className="control-row">
          <button type="button" className="icon-button" disabled={disableControls} onClick={() => onElevationChange(2)} title="Raise elevation">
            <ChevronUp size={18} />
          </button>
          <button type="button" className="icon-button" disabled={disableControls} onClick={() => onElevationChange(-2)} title="Lower elevation">
            <ChevronDown size={18} />
          </button>
          <button type="button" className="icon-button" disabled={disableControls} onClick={() => onPowerChange(-3)} title="Lower power">
            <Minus size={18} />
          </button>
          <button type="button" className="icon-button" disabled={disableControls} onClick={() => onPowerChange(3)} title="Raise power">
            <Plus size={18} />
          </button>
          <button type="button" className="fire-button" disabled={disableControls} onClick={onFire}>
            <Flame size={18} />
            Fire
          </button>
        </div>
      </section>

      <div className="bottom-hint">
        <span>WASD Move</span>
        <span>Arrow Keys Aim</span>
        <span>Q/E Power</span>
        <span>Space Fire</span>
        <span>Mouse Rotate Camera</span>
        <span>Right-Drag Move</span>
        <span>Wheel Zoom</span>
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
