import type { ActionLogCardMention, ActionLogEntry } from "../action-log.js";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface ActionLogWindowProps {
  entries: readonly ActionLogEntry[];
  className?: string | undefined;
  docked?: boolean | undefined;
  minimized: boolean;
  initialRect?: WindowRect | undefined;
  zIndex?: number | undefined;
  onToggleMinimized: () => void;
  onClose: () => void;
  onActivate?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
  onRequestRollback?: (rollbackPointId: string) => void;
  onPreviewCard?: (card: ActionLogCardMention["card"]) => void;
}

export interface ActionLogContentProps {
  entries: readonly ActionLogEntry[];
  onRequestRollback?: ((rollbackPointId: string) => void) | undefined;
  onPreviewCard?: ((card: ActionLogCardMention["card"]) => void) | undefined;
}

export const defaultActionLogWindowRect: WindowRect = {
  x: 960,
  y: 80,
  width: 360,
  height: 520,
};

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

export const ActionLogContent = ({
  entries,
  onRequestRollback,
  onPreviewCard,
}: ActionLogContentProps): React.JSX.Element =>
  entries.length === 0 ? (
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
  );

export const ActionLogWindow = ({
  entries,
  className,
  docked = false,
  minimized,
  initialRect = defaultActionLogWindowRect,
  zIndex,
  onToggleMinimized,
  onClose,
  onActivate,
  onRectChange,
  onDragMove,
  onDragEnd,
  onRequestRollback,
  onPreviewCard,
}: ActionLogWindowProps): React.JSX.Element => (
  <FloatingWindow
    title="Log"
    className={["action-log-window", className ?? ""].filter(Boolean).join(" ")}
    initialRect={initialRect}
    minWidth={240}
    minHeight={180}
    docked={docked}
    minimized={minimized}
    zIndex={zIndex}
    onToggleMinimized={onToggleMinimized}
    onClose={onClose}
    onActivate={onActivate}
    onRectChange={onRectChange}
    onDragMove={onDragMove}
    onDragEnd={onDragEnd}
  >
    <ActionLogContent
      entries={entries}
      onRequestRollback={onRequestRollback}
      onPreviewCard={onPreviewCard}
    />
  </FloatingWindow>
);
