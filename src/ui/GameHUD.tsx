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
import type { ExplosionState, GamePhase, TankState, TurnOwner, Wind } from "../game/gameTypes";

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
  onElevationChange: (delta: number) => void;
  onPowerChange: (delta: number) => void;
  onFire: () => void;
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
  onElevationChange,
  onPowerChange,
  onFire,
  onReset,
}: GameHUDProps) {
  const disableControls = !canPlayerAct;
  const enemyCount = computerTanks.length;

  return (
    <div className="hud-layer">
      <section className="combat-panel hud-panel">
        <div className="stage-chip">Stage {stage}</div>
        <div className="turn-chip">
          {turnText(turnOwner, phase, winner, activeEnemyIndex, enemyCount)}
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
        <span>WASD 이동</span>
        <span>방향키 조준</span>
        <span>Q/E 화력</span>
        <span>Space 발사</span>
        <span>마우스 카메라 회전</span>
        <span>우클릭 드래그 이동</span>
        <span>휠 줌</span>
      </div>

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
