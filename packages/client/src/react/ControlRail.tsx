import type { ClientActionModel } from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";

export interface ControlRailProps {
  matchId?: string | undefined;
  playerId?: string | undefined;
  status?: string | undefined;
  phase?: string | undefined;
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  selectedActions: readonly ClientActionModel[];
  selectedCardInstanceId?: string | undefined;
  disabled: boolean;
  onAction: (actionIndex: number) => void;
  onNewMatch: () => void;
  onRefresh: () => void;
}

export const ControlRail = ({
  matchId,
  playerId,
  status,
  phase,
  errors,
  globalActions,
  selectedActions,
  selectedCardInstanceId,
  disabled,
  onAction,
  onNewMatch,
  onRefresh,
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
        <button className="action-button" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <dl className="match-facts">
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
        title={
          selectedCardInstanceId === undefined
            ? "Selected card"
            : selectedCardInstanceId
        }
        actions={selectedActions}
        disabled={disabled}
        onAction={onAction}
      />
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
