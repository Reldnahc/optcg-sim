import type { ClientActionModel } from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";

export interface ControlRailProps {
  lobbyId?: string | undefined;
  matchId?: string | undefined;
  playerId?: string | undefined;
  status?: string | undefined;
  phase?: string | undefined;
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  disabled: boolean;
  onAction: (actionIndex: number) => void;
  onNewMatch: () => void;
  concedeDisabled?: boolean | undefined;
  concedeConfirming?: boolean | undefined;
  onConcede?: (() => void) | undefined;
}

export const ControlRail = ({
  lobbyId,
  matchId,
  playerId,
  status,
  phase,
  errors,
  globalActions,
  disabled,
  onAction,
  onNewMatch,
  concedeDisabled = true,
  concedeConfirming = false,
  onConcede,
}: ControlRailProps): React.JSX.Element => (
  <aside className="control-rail">
    <section className="summary-panel opponent-summary">
      <h2>Opponent</h2>
    </section>
    <section className="controls-panel">
      <div className="control-actions">
        <button className="action-button" type="button" onClick={onNewMatch}>
          New match
        </button>
        <button
          className={`action-button concede-button ${
            concedeConfirming ? "is-confirming" : ""
          }`}
          type="button"
          disabled={concedeDisabled}
          onClick={onConcede}
        >
          {concedeConfirming ? "Confirm concede" : "Concede"}
        </button>
      </div>
      <dl className="match-facts">
        <div>
          <dt>Lobby</dt>
          <dd>{lobbyId ?? "none"}</dd>
        </div>
        <div>
          <dt>Match</dt>
          <dd>{matchId ?? "loading"}</dd>
        </div>
        <div>
          <dt>Seat</dt>
          <dd>{playerId ?? "none"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{status ?? "unknown"}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{phase ?? "unknown"}</dd>
        </div>
      </dl>
      {errors.map((error) => (
        <p key={error} className="error-text">
          {error}
        </p>
      ))}
      <ActionMenu
        title="Global actions"
        actions={globalActions}
        disabled={disabled}
        onAction={onAction}
      />
    </section>
    <section className="summary-panel player-summary">
      <h2>Player</h2>
    </section>
  </aside>
);
