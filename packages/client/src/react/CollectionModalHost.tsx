import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";
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
  disabled?: boolean | undefined;
  onClose?: (() => void) | undefined;
  onToggleCard?: ((instanceId: string) => void) | undefined;
  onConfirm?: (() => void) | undefined;
}

export const CollectionModalHost = ({
  model,
  disabled = false,
  onClose,
  onToggleCard,
  onConfirm,
}: CollectionModalHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }
  const selectedIds = new Set(model.selection?.selectedInstanceIds ?? []);
  const selectableIds = new Set(model.selection?.selectableInstanceIds ?? []);
  const orderedSelectionIds = model.selection?.selectedInstanceIds ?? [];

  return (
    <ModalFrame
      title={model.title}
      className="modal-frame-collection collection-modal"
      onClose={onClose}
    >
      <div className="collection-modal-card-grid">
        {model.cards.map((card) => {
          const instanceId = String(card.instanceId);
          const hasSelection = model.selection !== undefined;
          const selectable = !hasSelection || selectableIds.has(instanceId);
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
              disabled={disabled || !selectable}
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
    </ModalFrame>
  );
};
