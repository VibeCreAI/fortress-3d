import {
  ChevronDown,
  ChevronUp,
  Compass,
  Flame,
  Gauge,
  HeartPulse,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Plus,
  RefreshCcw,
  Wind as WindIcon,
  ZoomIn,
} from "lucide-react";
import type { ExplosionState, GamePhase, TankState, TurnOwner, Wind } from "../game/gameTypes";

type GameHUDProps = {
  playerTank: TankState;
  computerTank: TankState;
  turnOwner: TurnOwner;
  phase: GamePhase;
  wind: Wind;
  winner: TurnOwner | null;
  lastExplosion: ExplosionState | null;
  canPlayerAct: boolean;
  aimInputActive: boolean;
  zoomFov: number;
  onElevationChange: (delta: number) => void;
  onPowerChange: (delta: number) => void;
  onFire: () => void;
  onReset: () => void;
};

function hpPercent(hp: number) {
  return `${Math.max(0, Math.min(100, hp))}%`;
}

function turnText(turnOwner: TurnOwner, phase: GamePhase, winner: TurnOwner | null) {
  if (winner) {
    return winner === "player" ? "Player wins" : "Computer wins";
  }

  if (phase === "projectileFlying") {
    return "Shell in flight";
  }

  if (phase === "exploding") {
    return "Impact";
  }

  if (turnOwner === "computer") {
    return "Computer is aiming...";
  }

  return "Player aiming";
}

export function GameHUD({
  playerTank,
  computerTank,
  turnOwner,
  phase,
  wind,
  winner,
  lastExplosion,
  canPlayerAct,
  aimInputActive,
  zoomFov,
  onElevationChange,
  onPowerChange,
  onFire,
  onReset,
}: GameHUDProps) {
  const disableControls = !canPlayerAct;
  const aimStatus = aimInputActive ? "Mouse aim locked" : "Click arena to aim";

  return (
    <div className="hud-layer">
      <section className="combat-panel hud-panel">
        <div className="turn-chip">{turnText(turnOwner, phase, winner)}</div>
        <div className="hp-row">
          <div className="hp-label">
            <HeartPulse size={16} />
            Player
          </div>
          <div className="hp-track">
            <div className="hp-fill player-hp" style={{ width: hpPercent(playerTank.hp) }} />
          </div>
          <span>{Math.round(playerTank.hp)}</span>
        </div>
        <div className="hp-row">
          <div className="hp-label">
            <HeartPulse size={16} />
            CPU
          </div>
          <div className="hp-track">
            <div className="hp-fill cpu-hp" style={{ width: hpPercent(computerTank.hp) }} />
          </div>
          <span>{Math.round(computerTank.hp)}</span>
        </div>
        {lastExplosion && phase === "exploding" && (
          <div className="impact-note">
            {lastExplosion.damage > 0
              ? `${lastExplosion.target === "player" ? "Player" : "CPU"} took ${lastExplosion.damage}`
              : "No damage"}
          </div>
        )}
      </section>

      <section className="aim-panel hud-panel">
        <div className="aim-lock-row">
          <MousePointer2 size={16} />
          {aimStatus}
        </div>
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
            <span>Zoom</span>
            <strong>{Math.round(zoomFov)} fov</strong>
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
        <span>WASD move X/Y</span>
        <span>Mouse aim</span>
        <span>Wheel zoom</span>
        <span>Q/E power</span>
        <span>Space fire</span>
        <span>Esc release</span>
      </div>

      {winner && (
        <section className="winner-panel hud-panel">
          <div className="winner-title">{winner === "player" ? "Victory" : "Defeat"}</div>
          <div className="winner-copy">
            {winner === "player" ? "The computer tank is out." : "Your tank is out."}
          </div>
          <button type="button" className="reset-button" onClick={onReset}>
            <RefreshCcw size={18} />
            Restart
          </button>
        </section>
      )}
    </div>
  );
}
