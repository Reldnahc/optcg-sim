import type { ActionLogCardMention, ActionLogEntry } from "../action-log.js";
import { FloatingWindow } from "./FloatingWindow.js";

export interface ActionLogWindowProps {
  entries: readonly ActionLogEntry[];
  minimized: boolean;
  onToggleMinimized: () => void;
  onClose: () => void;
  onRequestRollback?: (rollbackPointId: string) => void;
  onPreviewCard?: (card: ActionLogCardMention["card"]) => void;
}

const textParts = (
  text: string,
  mentions: readonly ActionLogCardMention[] = [],
): Array<string | ActionLogCardMention> => {
  const parts: Array<string | ActionLogCardMention> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = mentions
      .map((mention) => ({
        mention,
        index: text.indexOf(mention.label, cursor),
      }))
      .filter(({ index }) => index >= 0)
      .sort((left, right) => left.index - right.index)[0];
    if (next === undefined) {
      parts.push(text.slice(cursor));
      break;
    }
    if (next.index > cursor) {
      parts.push(text.slice(cursor, next.index));
    }
    parts.push(next.mention);
    cursor = next.index + next.mention.label.length;
  }
  return parts;
};

const renderActionLogText = (
  entry: ActionLogEntry,
  onPreviewCard: ActionLogWindowProps["onPreviewCard"],
): React.ReactNode =>
  textParts(entry.text, entry.cardMentions).map((part, index) =>
    typeof part === "string" ? (
      part
    ) : (
      <button
        key={`${String(index)}:${part.card.playerId}:${part.card.cardId}`}
        className="action-log-card-mention"
        type="button"
        title={part.card.name}
        onPointerEnter={() => {
          onPreviewCard?.(part.card);
        }}
        onFocus={() => {
          onPreviewCard?.(part.card);
        }}
      >
        {part.label}
      </button>
    ),
  );

export const ActionLogWindow = ({
  entries,
  minimized,
  onToggleMinimized,
  onClose,
  onRequestRollback,
  onPreviewCard,
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
          const rollbackTitle =
            rollback === undefined
              ? undefined
              : `Request rollback to ${rollback.label}`;
          return (
            <li key={entry.id} className="action-log-entry">
              <span className="action-log-seq">{entry.seq}</span>
              <span className="action-log-text">
                {renderActionLogText(entry, onPreviewCard)}
              </span>
              {rollback === undefined ||
              onRequestRollback === undefined ? null : (
                <button
                  className="action-log-rollback"
                  type="button"
                  aria-label={rollbackTitle}
                  title={rollbackTitle}
                  onClick={() => {
                    onRequestRollback(rollback.rollbackPointId);
                  }}
                >
                  <svg
                    className="action-log-rollback-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M7.5 9.5H3.5V5.5" />
                    <path d="M3.6 9.5A8.4 8.4 0 1 1 6.1 15.6" />
                    <path d="M11.8 8.3v4.1l2.8 1.8" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </FloatingWindow>
);
