import type { CardRef, InstanceId } from "@optcg/types";

import type { DecisionModalModel } from "../interactions/decision-modal.js";
import { ModalFrame } from "./ModalFrame.js";
import { reorderPlacementFromPointer } from "./drag-reorder.js";
import type { ReorderPlacement } from "./drag-reorder.js";

export interface DecisionModalHostProps {
  model?: DecisionModalModel | undefined;
  disabled: boolean;
  cardDisplay?:
    | ((card: CardRef) => { name: string; imageUrl?: string })
    | undefined;
  onToggleCard: (instanceId: InstanceId) => void;
  onChooseTrigger: (triggerId: string) => void;
  onQuantity: (quantity: number) => void;
  onOption: (option: string) => void;
  onActionOption: (actionIndex: number) => void;
  onMoveOrderedCard: (
    draggedId: InstanceId,
    targetId: InstanceId,
    placement: ReorderPlacement,
  ) => void;
  onToggleBottomPlacement: (instanceId: InstanceId) => void;
  onConfirm: () => void;
}

export const DecisionModalHost = ({
  model,
  disabled,
  cardDisplay,
  onToggleCard,
  onChooseTrigger,
  onQuantity,
  onOption,
  onActionOption,
  onMoveOrderedCard,
  onToggleBottomPlacement,
  onConfirm,
}: DecisionModalHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }
  return (
    <ModalFrame title={model.prompt} className="modal-frame-decision">
      {model.kind === "selectCards" ? (
        <div className="decision-card-grid">
          {model.cards.map((choice) => {
            const instanceId = choice.card.instanceId;
            const selected = model.selectedInstanceIds.includes(instanceId);
            const display = cardDisplay?.(choice.card) ?? {
              name: String(choice.card.cardId),
            };
            return (
              <button
                key={String(instanceId)}
                className={`decision-choice decision-card-choice ${
                  selected ? "is-selected" : ""
                } ${choice.selectable ? "" : "is-disabled"}`}
                type="button"
                disabled={disabled || !choice.selectable}
                onClick={() => {
                  onToggleCard(instanceId);
                }}
              >
                {display.imageUrl === undefined ? (
                  <span className="decision-card-placeholder">
                    {display.name}
                  </span>
                ) : (
                  <img
                    className="decision-card-face"
                    src={display.imageUrl}
                    alt={display.name}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
      {model.kind === "orderCards" ? (
        <>
          <p className="decision-order-hint">
            {model.destination === "deck"
              ? "Drag cards into deck order. 1 is highest in the deck; last is bottom-most."
              : "Drag cards into order."}
          </p>
          <div className="decision-order-card-grid">
            {model.orderedInstanceIds.map((instanceId, index) => {
              const card = model.cards.find(
                (candidate) => candidate.instanceId === instanceId,
              );
              if (card === undefined) {
                return null;
              }
              const display = cardDisplay?.(card) ?? {
                name: String(card.cardId),
              };
              const dragEnabled = !disabled;
              const isBottom = model.bottomInstanceIds.includes(instanceId);
              return (
                <div
                  key={String(instanceId)}
                  className={`decision-order-card ${
                    isBottom ? "is-bottom" : ""
                  }`}
                  draggable={dragEnabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "text/plain",
                      String(instanceId),
                    );
                  }}
                  onDragOver={(event) => {
                    if (!dragEnabled) {
                      return;
                    }
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedIdValue =
                      event.dataTransfer.getData("text/plain");
                    const draggedId = model.orderedInstanceIds.find(
                      (candidateId) => String(candidateId) === draggedIdValue,
                    );
                    if (draggedId === undefined) {
                      return;
                    }
                    onMoveOrderedCard(
                      draggedId,
                      instanceId,
                      reorderPlacementFromPointer(
                        event.currentTarget.getBoundingClientRect(),
                        event.clientX,
                        event.clientY,
                      ),
                    );
                  }}
                >
                  <span className="decision-order-badge">{index + 1}</span>
                  {display.imageUrl === undefined ? (
                    <span className="decision-card-placeholder">
                      {display.name}
                    </span>
                  ) : (
                    <img
                      className="decision-card-face"
                      src={display.imageUrl}
                      alt={display.name}
                    />
                  )}
                  {model.placement?.type === "topOrBottom" ? (
                    <button
                      className="decision-placement-toggle"
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onToggleBottomPlacement(instanceId);
                      }}
                    >
                      {isBottom ? "Bottom" : "Top"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {model.kind === "orderTriggers" ? (
        <div className="decision-card-grid">
          {model.choices.map((choice) => {
            const display =
              choice.source === undefined
                ? { name: choice.triggerId }
                : (cardDisplay?.(choice.source) ?? {
                    name: String(choice.source.cardId),
                  });
            return (
              <button
                key={choice.triggerId}
                className={`decision-choice decision-card-choice ${
                  choice.selected ? "is-selected" : ""
                }`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChooseTrigger(choice.triggerId);
                }}
              >
                {display.imageUrl === undefined ? (
                  <span className="decision-card-placeholder">
                    {display.name}
                  </span>
                ) : (
                  <img
                    className="decision-card-face"
                    src={display.imageUrl}
                    alt={display.name}
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
      {model.kind === "chooseQuantity" ? (
        <label className="quantity-slider-field">
          <span className="quantity-slider-value">{model.quantity}</span>
          <input
            className="quantity-slider"
            type="range"
            min={model.min}
            max={model.max}
            value={model.quantity}
            onChange={(event) => {
              onQuantity(Number(event.currentTarget.value));
            }}
          />
          <span className="quantity-slider-range">
            {model.min}-{model.max}
          </span>
        </label>
      ) : null}
      {model.kind === "chooseOption" ? (
        <div className="decision-option-list">
          {model.options.map((option) => (
            <button
              key={option.value}
              className={`decision-choice ${
                option.value === model.selectedOption ? "is-selected" : ""
              }`}
              type="button"
              onClick={() => {
                onOption(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {model.kind === "actionOptions" ? (
        <div className="decision-option-list">
          {model.options.map((option) => (
            <button
              key={option.actionIndex}
              className={`decision-choice ${
                option.actionIndex === model.selectedActionIndex
                  ? "is-selected"
                  : ""
              }`}
              type="button"
              onClick={() => {
                onActionOption(option.actionIndex);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {model.kind === "generic" ? (
        <p className="muted">This decision needs a dedicated control.</p>
      ) : null}
      <button
        className="action-button primary-action"
        type="button"
        disabled={disabled || !model.canConfirm}
        onClick={onConfirm}
      >
        {"confirmLabel" in model ? model.confirmLabel : "Confirm"}
      </button>
    </ModalFrame>
  );
};
