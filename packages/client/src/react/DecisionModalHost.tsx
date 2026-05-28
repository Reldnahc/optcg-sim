import { useState } from "react";
import type { CSSProperties } from "react";

import type { CardRef, InstanceId } from "@optcg/types";

import type { DecisionModalModel } from "../interactions/decision-modal.js";
import { ModalFrame } from "./ModalFrame.js";
import { reorderPlacementFromPointer } from "./drag-reorder.js";
import type { ReorderPlacement } from "./drag-reorder.js";

interface PointerReorderDrag {
  pointerId: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

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

interface DecisionOrderCardProps {
  card: CardRef;
  display: { name: string; imageUrl?: string };
  index: number;
  isBottom: boolean;
  disabled: boolean;
  topOrBottomPlacement: boolean;
  onMoveOrderedCard: (
    draggedId: InstanceId,
    targetId: InstanceId,
    placement: ReorderPlacement,
  ) => void;
  onToggleBottomPlacement: (instanceId: InstanceId) => void;
}

const DecisionOrderCard = ({
  card,
  display,
  index,
  isBottom,
  disabled,
  topOrBottomPlacement,
  onMoveOrderedCard,
  onToggleBottomPlacement,
}: DecisionOrderCardProps): React.JSX.Element => {
  const [pointerDrag, setPointerDrag] = useState<
    PointerReorderDrag | undefined
  >(undefined);
  const pointerReorderEnabled = !disabled;
  const pointerDragStyle =
    pointerDrag?.moved === true
      ? ({
          transform: `translate(${String(
            pointerDrag.currentX - pointerDrag.originX,
          )}px, ${String(pointerDrag.currentY - pointerDrag.originY)}px)`,
        } satisfies CSSProperties)
      : undefined;
  return (
    <div
      className={`decision-order-card is-pointer-reorderable ${
        isBottom ? "is-bottom" : ""
      } ${pointerDrag?.moved === true ? "is-pointer-reorder-dragging" : ""}`}
      data-decision-order-instance-id={String(card.instanceId)}
      style={pointerDragStyle}
      onPointerDown={(event) => {
        if (!pointerReorderEnabled || event.button !== 0) {
          return;
        }
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest(".decision-placement-toggle") !== null
        ) {
          return;
        }
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setPointerDrag({
          pointerId: event.pointerId,
          originX: event.clientX,
          originY: event.clientY,
          currentX: event.clientX,
          currentY: event.clientY,
          moved: false,
        });
      }}
      onPointerMove={(event) => {
        if (
          pointerDrag === undefined ||
          pointerDrag.pointerId !== event.pointerId
        ) {
          return;
        }
        const deltaX = event.clientX - pointerDrag.originX;
        const deltaY = event.clientY - pointerDrag.originY;
        const moved =
          pointerDrag.moved || Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
        if (moved) {
          event.preventDefault();
        }
        setPointerDrag({
          ...pointerDrag,
          currentX: event.clientX,
          currentY: event.clientY,
          moved,
        });
      }}
      onPointerUp={(event) => {
        if (
          pointerDrag === undefined ||
          pointerDrag.pointerId !== event.pointerId
        ) {
          return;
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
        setPointerDrag(undefined);
        if (!pointerDrag.moved || !pointerReorderEnabled) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const previousPointerEvents = event.currentTarget.style.pointerEvents;
        event.currentTarget.style.pointerEvents = "none";
        const targetElement = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-decision-order-instance-id]");
        event.currentTarget.style.pointerEvents = previousPointerEvents;
        if (targetElement == null) {
          return;
        }
        const targetInstanceId =
          targetElement.dataset["decisionOrderInstanceId"];
        if (
          targetInstanceId === undefined ||
          targetInstanceId === String(card.instanceId)
        ) {
          return;
        }
        onMoveOrderedCard(
          card.instanceId,
          targetInstanceId as InstanceId,
          reorderPlacementFromPointer(
            targetElement.getBoundingClientRect(),
            event.clientX,
            event.clientY,
          ),
        );
      }}
      onPointerCancel={(event) => {
        if (pointerDrag?.pointerId === event.pointerId) {
          setPointerDrag(undefined);
        }
      }}
    >
      <span className="decision-order-badge">{index + 1}</span>
      {display.imageUrl === undefined ? (
        <span className="decision-card-placeholder">{display.name}</span>
      ) : (
        <img
          className="decision-card-face"
          src={display.imageUrl}
          alt={display.name}
        />
      )}
      {topOrBottomPlacement ? (
        <button
          className="decision-placement-toggle"
          type="button"
          disabled={disabled}
          onClick={() => {
            onToggleBottomPlacement(card.instanceId);
          }}
        >
          {isBottom ? "Bottom" : "Top"}
        </button>
      ) : null}
    </div>
  );
};

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
              const isBottom = model.bottomInstanceIds.includes(instanceId);
              return (
                <DecisionOrderCard
                  key={String(instanceId)}
                  card={card}
                  display={display}
                  index={index}
                  isBottom={isBottom}
                  disabled={disabled}
                  topOrBottomPlacement={model.placement?.type === "topOrBottom"}
                  onMoveOrderedCard={onMoveOrderedCard}
                  onToggleBottomPlacement={onToggleBottomPlacement}
                />
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
