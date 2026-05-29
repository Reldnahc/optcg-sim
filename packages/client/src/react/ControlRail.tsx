import type { ReactNode } from "react";

import type { ClientActionModel } from "../view-model.js";
import { ActionMenu } from "./ActionMenu.js";

export interface ControlRailProps {
  errors: readonly string[];
  globalActions: readonly ClientActionModel[];
  disabled: boolean;
  onAction: (actionIndex: number) => void;
  onNewMatch: () => void;
  rollbackStatus?:
    | {
        message: string;
        canCancel: boolean;
      }
    | undefined;
  onCancelRollback?: (() => void) | undefined;
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
  rollbackStatus,
  onCancelRollback,
  concedeDisabled = true,
  concedeConfirming = false,
  onConcede,
  previewControl,
  actionLogControl,
}: ControlRailProps): React.JSX.Element => {
  const concedeLabel = concedeConfirming ? "Confirm concede" : "Concede";

  return (
    <aside className="control-rail">
      <section className="summary-panel opponent-summary">
        <h2>Opponent</h2>
      </section>
      <section className="controls-panel">
        <div className="control-tool-strip">
          {previewControl === undefined ? null : (
            <div className="control-preview-slot">{previewControl}</div>
          )}
          {actionLogControl === undefined ? null : (
            <div className="control-action-log-slot">{actionLogControl}</div>
          )}
          <button
            className="control-icon-button settings-button"
            type="button"
            aria-label="Settings"
            title="Settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.1 2.8h3.8l.4 2.3a7.2 7.2 0 0 1 1.3.6l2-1.3 2.7 2.7-1.3 2a7.2 7.2 0 0 1 .6 1.3l2.3.4v3.8l-2.3.4a7.2 7.2 0 0 1-.6 1.3l1.3 2-2.7 2.7-2-1.3a7.2 7.2 0 0 1-1.3.6l-.4 2.3h-3.8l-.4-2.3a7.2 7.2 0 0 1-1.3-.6l-2 1.3-2.7-2.7 1.3-2a7.2 7.2 0 0 1-.6-1.3l-2.3-.4v-3.8l2.3-.4A7.2 7.2 0 0 1 5 9.1l-1.3-2 2.7-2.7 2 1.3a7.2 7.2 0 0 1 1.3-.6Z" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </button>
          <button
            className={`control-icon-button concede-button ${
              concedeConfirming ? "is-confirming" : ""
            }`}
            type="button"
            disabled={concedeDisabled}
            aria-label={concedeLabel}
            title={concedeLabel}
            onClick={onConcede}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3v18" />
              <path d="M5 4h12l-2 4 2 4H5" />
            </svg>
          </button>
          <button
            className="control-icon-button new-match-button"
            type="button"
            aria-label="New match"
            title="New match"
            onClick={onNewMatch}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
        {errors.map((error) => (
          <p key={error} className="error-text">
            {error}
          </p>
        ))}
        {rollbackStatus === undefined ? null : (
          <section className="rollback-status-panel">
            <p>{rollbackStatus.message}</p>
            {rollbackStatus.canCancel ? (
              <button
                className="action-button"
                type="button"
                disabled={disabled}
                onClick={onCancelRollback}
              >
                Cancel rollback request
              </button>
            ) : null}
          </section>
        )}
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
};
