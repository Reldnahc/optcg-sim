import type { ActionLogEntry } from "../action-log.js";
import { FloatingWindow } from "./FloatingWindow.js";

export interface ActionLogWindowProps {
  entries: readonly ActionLogEntry[];
  minimized: boolean;
  onToggleMinimized: () => void;
  onClose: () => void;
  onRequestRollback?: (rollbackPointId: string) => void;
}

export const ActionLogWindow = ({
  entries,
  minimized,
  onToggleMinimized,
  onClose,
  onRequestRollback,
}: ActionLogWindowProps): React.JSX.Element => (
  <FloatingWindow
    title="Action Log"
    className="action-log-window"
    initialRect={{ x: 960, y: 80, width: 360, height: 520 }}
    minWidth={280}
    minHeight={220}
    minimized={minimized}
    onToggleMinimized={onToggleMinimized}
    onClose={onClose}
  >
    {entries.length === 0 ? (
      <p className="muted">No visible actions yet.</p>
    ) : (
      <ol className="action-log-list">
        {entries.map((entry) => {
          const rollback = entry.rollback;
          return (
            <li key={entry.id} className="action-log-entry">
              <span className="action-log-seq">{entry.seq}</span>
              <span className="action-log-text">{entry.text}</span>
              {rollback === undefined ||
              onRequestRollback === undefined ? null : (
                <button
                  className="action-log-rollback"
                  type="button"
                  title={rollback.label}
                  onClick={() => {
                    onRequestRollback(rollback.rollbackPointId);
                  }}
                >
                  Request rollback
                </button>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </FloatingWindow>
);
