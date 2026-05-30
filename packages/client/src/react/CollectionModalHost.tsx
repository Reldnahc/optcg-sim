import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import { ModalFrame } from "./ModalFrame.js";

export interface CollectionModalModel {
  title: string;
  cards: readonly ClientCardModel[];
  selection?:
    | {
        selectedInstanceIds: readonly string[];
        selectableInstanceIds: readonly string[];
        canConfirm: boolean;
        confirmLabel: string;
        orderHint?: string | undefined;
      }
    | undefined;
}

export interface CollectionModalHostProps {
  model?: CollectionModalModel | undefined;
  presentation?: "window" | "modal" | undefined;
  disabled?: boolean | undefined;
  minimized?: boolean | undefined;
  docked?: boolean | undefined;
  initialRect?: WindowRect | undefined;
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
  onToggleCard?: ((instanceId: string) => void) | undefined;
  onConfirm?: (() => void) | undefined;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
}

export const CollectionModalHost = ({
  model,
  presentation = "window",
  disabled = false,
  minimized = false,
  docked = false,
  initialRect,
  onToggleMinimized,
  onClose,
  onRectChange,
  onDragMove,
  onDragEnd,
  onToggleCard,
  onConfirm,
  onPreviewCard,
}: CollectionModalHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }
  const selectedIds = new Set(model.selection?.selectedInstanceIds ?? []);
  const selectableIds = new Set(model.selection?.selectableInstanceIds ?? []);
  const orderedSelectionIds = model.selection?.selectedInstanceIds ?? [];
  const body = (
    <>
      <div className="collection-modal-card-grid">
        {model.cards.map((card) => {
          const instanceId = String(card.instanceId);
          const hasSelection = model.selection !== undefined;
          const selectable = hasSelection && selectableIds.has(instanceId);
          return (
            <CardTile
              key={instanceId}
              card={card}
              selected={selectedIds.has(instanceId)}
              selectionOrderLabel={
                model.selection?.orderHint === undefined ||
                !selectedIds.has(instanceId)
                  ? undefined
                  : String(orderedSelectionIds.indexOf(instanceId) + 1)
              }
              pendingChoice={selectable}
              disabled={disabled || (hasSelection && !selectable)}
              onHover={onPreviewCard}
              onClick={
                hasSelection && selectable
                  ? () => {
                      onToggleCard?.(instanceId);
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      {model.selection === undefined ? null : (
        <div className="collection-modal-actions">
          {model.selection.orderHint === undefined ? null : (
            <p className="collection-modal-order-hint">
              {model.selection.orderHint}
            </p>
          )}
          <button
            className="action-button primary-action"
            type="button"
            disabled={disabled || !model.selection.canConfirm}
            onClick={onConfirm}
          >
            {model.selection.confirmLabel}
          </button>
        </div>
      )}
    </>
  );

  if (presentation === "modal") {
    return (
      <ModalFrame title={model.title} className="collection-modal">
        {body}
      </ModalFrame>
    );
  }

  return (
    <FloatingWindow
      title={model.title}
      className="floating-window-collection collection-modal"
      initialRect={initialRect}
      docked={docked}
      minimized={minimized}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {body}
    </FloatingWindow>
  );
};
