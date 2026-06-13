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
  zIndex?: number | undefined;
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onActivate?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
  onToggleCard?: ((instanceId: string) => void) | undefined;
  onConfirm?: (() => void) | undefined;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
}

export interface CollectionModalContentProps {
  model: CollectionModalModel;
  disabled?: boolean | undefined;
  largeSingleCard?: boolean | undefined;
  onToggleCard?: ((instanceId: string) => void) | undefined;
  onConfirm?: (() => void) | undefined;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
}

export const CollectionModalContent = ({
  model,
  disabled = false,
  largeSingleCard = false,
  onToggleCard,
  onConfirm,
  onPreviewCard,
}: CollectionModalContentProps): React.JSX.Element => {
  const selectedIds = new Set(model.selection?.selectedInstanceIds ?? []);
  const selectableIds = new Set(model.selection?.selectableInstanceIds ?? []);
  const orderedSelectionIds = model.selection?.selectedInstanceIds ?? [];

  return (
    <>
      <div
        className={`collection-modal-card-grid ${
          largeSingleCard && model.cards.length === 1 ? "is-single-card" : ""
        }`.trim()}
      >
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
            className="action-button primary-action modal-submit-button"
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
};

export const CollectionModalHost = ({
  model,
  presentation = "window",
  disabled = false,
  minimized = false,
  docked = false,
  initialRect,
  zIndex,
  onToggleMinimized,
  onClose,
  onActivate,
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
  const body = (
    <CollectionModalContent
      model={model}
      disabled={disabled}
      largeSingleCard={presentation === "modal"}
      onToggleCard={onToggleCard}
      onConfirm={onConfirm}
      onPreviewCard={onPreviewCard}
    />
  );

  if (presentation === "modal") {
    return (
      <ModalFrame
        title={model.title}
        className="collection-modal modal-frame-collection-decision"
      >
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
      zIndex={zIndex}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onActivate={onActivate}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {body}
    </FloatingWindow>
  );
};
