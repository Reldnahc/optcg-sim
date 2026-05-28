import type { ReactNode } from "react";

import type { ClientActionModel } from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";

export interface ControlRailProps {
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  disabled: boolean;
  onAction: (actionIndex: number) => void;
  onNewMatch: () => void;
  concedeDisabled?: boolean | undefined;
  concedeConfirming?: boolean | undefined;
  onConcede?: (() => void) | undefined;
  previewControl?: ReactNode | undefined;
  actionLogControl?: ReactNode | undefined;
}

export const ControlRail = ({
  errors,
  globalActions,
  disabled,
  onAction,
  onNewMatch,
  concedeDisabled = true,
  concedeConfirming = false,
  onConcede,
  previewControl,
  actionLogControl,
}: ControlRailProps): React.JSX.Element => (
  <aside className="control-rail">
    <section className="summary-panel opponent-summary">
      <h2>Opponent</h2>
    </section>
    <section className="controls-panel">
      {previewControl === undefined && actionLogControl === undefined ? null : (
        <div className="control-tool-strip">
          {previewControl === undefined ? null : (
            <div className="control-preview-slot">{previewControl}</div>
          )}
          {actionLogControl === undefined ? null : (
            <div className="control-action-log-slot">{actionLogControl}</div>
          )}
        </div>
      )}
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
