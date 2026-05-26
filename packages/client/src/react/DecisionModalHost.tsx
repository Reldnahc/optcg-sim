import type { InstanceId } from "@optcg/types";

import type { DecisionModalModel } from "../interactions/decision-modal.js";
import { ModalFrame } from "./ModalFrame.js";

export interface DecisionModalHostProps {
  model?: DecisionModalModel | undefined;
  disabled: boolean;
  onToggleCard: (instanceId: InstanceId) => void;
  onQuantity: (quantity: number) => void;
  onOption: (option: string) => void;
  onActionOption: (actionIndex: number) => void;
  onConfirm: () => void;
}

export const DecisionModalHost = ({
  model,
  disabled,
  onToggleCard,
  onQuantity,
  onOption,
  onActionOption,
  onConfirm,
}: DecisionModalHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }
  return (
    <ModalFrame title={model.prompt} className="modal-frame-decision">
      {model.kind === "selectCards" ? (
        <div className="decision-card-grid">
          {model.cards.map((candidate) => {
            const instanceId = candidate.card.instanceId;
            const selected = model.selectedInstanceIds.includes(instanceId);
            return (
              <button
                key={String(instanceId)}
                className={`decision-choice ${selected ? "is-selected" : ""}`}
                type="button"
                onClick={() => {
                  onToggleCard(instanceId);
                }}
              >
                {String(candidate.card.cardId)}
              </button>
            );
          })}
        </div>
      ) : null}
      {model.kind === "orderCards" ? (
        <div className="decision-order-list">
          {model.orderedInstanceIds.map((instanceId, index) => (
            <div key={String(instanceId)} className="decision-order-row">
              <span>{String(instanceId)}</span>
              <span>{index + 1}</span>
            </div>
          ))}
        </div>
      ) : null}
      {model.kind === "chooseQuantity" ? (
        <input
          className="quantity-input"
          type="number"
          min={model.min}
          max={model.max}
          value={model.quantity}
          onChange={(event) => {
            onQuantity(Number(event.currentTarget.value));
          }}
        />
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
        Confirm
      </button>
    </ModalFrame>
  );
};
