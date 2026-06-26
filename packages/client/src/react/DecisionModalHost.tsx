import { Fragment } from "react";

import type { CardRef, InstanceId } from "@optcg/types";

import type { DecisionModalModel } from "../interactions/decision-modal.js";
import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";
import { ModalFrame } from "./ModalFrame.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import { useCardReorderPreview } from "./useCardReorderPreview.js";

export interface DecisionModalHostProps {
  model?: DecisionModalModel | undefined;
  disabled: boolean;
  cardDisplay?:
    | ((card: CardRef) => { name: string; imageUrl?: string })
    | undefined;
  cardModel?: ((card: CardRef) => ClientCardModel) | undefined;
  onToggleCard: (instanceId: InstanceId) => void;
  onChooseTrigger: (triggerId: string) => void;
  onQuantity: (quantity: number) => void;
  onOption: (option: string) => void;
  onActionOption: (actionIndex: number) => void;
  onSubmitQuantity?: ((quantity: number) => void) | undefined;
  onSubmitOption?: ((option: string) => void) | undefined;
  onSubmitActionOption?: ((actionIndex: number) => void) | undefined;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
  onMoveOrderedCard: (
    draggedId: InstanceId,
    targetId: InstanceId,
    placement: ReorderPlacement,
  ) => void;
  onPlacementDestination: (destination: "top" | "bottom") => void;
  onConfirm: () => void;
}

const fallbackDecisionClientCard = (
  card: CardRef,
  display: { name: string; imageUrl?: string },
): ClientCardModel => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  name: display.name,
  category: "unknown",
  ...(display.imageUrl === undefined ? {} : { imageUrl: display.imageUrl }),
  attachedDonCount: 0,
  attachedDonCards: [],
});

const decisionClientCard = (
  card: CardRef,
  display: { name: string; imageUrl?: string },
  cardModel: ((card: CardRef) => ClientCardModel) | undefined,
): ClientCardModel =>
  cardModel?.(card) ?? fallbackDecisionClientCard(card, display);

const cardDecisionModalKinds = new Set<DecisionModalModel["kind"]>([
  "selectCards",
  "orderCards",
  "orderTriggers",
]);

const actionChoiceModalKinds = new Set<DecisionModalModel["kind"]>([
  "actionOptions",
  "paymentOptions",
  "optionalActivation",
  "replacementOptions",
  "lifeTrigger",
  "rollbackConsent",
  "loopCount",
]);

const isActionChoiceModal = (
  model: DecisionModalModel,
): model is Extract<
  DecisionModalModel,
  {
    kind:
      | "actionOptions"
      | "paymentOptions"
      | "optionalActivation"
      | "replacementOptions"
      | "lifeTrigger"
      | "rollbackConsent"
      | "loopCount";
  }
> => actionChoiceModalKinds.has(model.kind);

const decisionModalFrameClass = (model: DecisionModalModel): string =>
  cardDecisionModalKinds.has(model.kind) ||
  (isActionChoiceModal(model) &&
    model.options.some((option) => option.cards !== undefined))
    ? "modal-frame-decision modal-frame-card-decision"
    : "modal-frame-decision";

const decisionCardGridClass = (
  cardCount: number,
  extraClassName = "",
): string =>
  `decision-card-grid${extraClassName} ${
    cardCount === 1 ? "is-single-card" : ""
  }`.trim();

const orderDeckInstruction =
  "Drag cards into deck order. 1 is highest in the deck; last is bottom-most.";

const decisionModalInstruction = (model: DecisionModalModel): string =>
  model.kind === "orderCards" && model.destination === "deck"
    ? orderDeckInstruction
    : model.instruction;

export const DecisionModalHost = ({
  model,
  disabled,
  cardDisplay,
  cardModel,
  onToggleCard,
  onChooseTrigger,
  onQuantity,
  onOption,
  onActionOption,
  onSubmitQuantity,
  onSubmitOption,
  onSubmitActionOption,
  onPreviewCard,
  onMoveOrderedCard,
  onPlacementDestination,
  onConfirm,
}: DecisionModalHostProps): React.JSX.Element | null => {
  const orderedCards =
    model?.kind === "orderCards"
      ? model.orderedInstanceIds.flatMap((instanceId) => {
          const card = model.cards.find(
            (candidate) => candidate.instanceId === instanceId,
          );
          if (card === undefined) {
            return [];
          }
          const display = cardDisplay?.(card) ?? {
            name: String(card.cardId),
          };
          return [decisionClientCard(card, display, cardModel)];
        })
      : [];
  const orderReorder = useCardReorderPreview(
    orderedCards,
    model?.kind === "orderCards" && !disabled
      ? (draggedInstanceId, targetInstanceId, placement) => {
          onMoveOrderedCard(
            draggedInstanceId as InstanceId,
            targetInstanceId as InstanceId,
            placement,
          );
        }
      : undefined,
  );

  if (model === undefined) {
    return null;
  }
  const actionOptionCardCount =
    model.kind === "actionOptions"
      ? model.options.reduce(
          (count, option) => count + (option.cards?.length ?? 0),
          0,
        )
      : 0;
  const renderConfirm =
    model.kind !== "binaryQuantity" &&
    model.kind !== "chooseOption" &&
    !isActionChoiceModal(model) &&
    model.kind !== "chooseOne";
  return (
    <ModalFrame title={model.title} className={decisionModalFrameClass(model)}>
      <div className="decision-modal-context">
        <p className="decision-modal-instruction">
          {decisionModalInstruction(model)}
        </p>
      </div>
      {model.kind === "selectCards" ? (
        <div className={decisionCardGridClass(model.cards.length)}>
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
                onPointerEnter={() => {
                  onPreviewCard?.(
                    decisionClientCard(choice.card, display, cardModel),
                  );
                }}
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
          {model.placement?.type === "topOrBottom" ? (
            <div className="decision-placement-choice" role="group">
              <button
                className={`decision-placement-choice-button ${
                  model.placementDestination === "top" ? "is-selected" : ""
                }`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onPlacementDestination("top");
                }}
              >
                Top
              </button>
              <button
                className={`decision-placement-choice-button ${
                  model.placementDestination === "bottom" ? "is-selected" : ""
                }`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onPlacementDestination("bottom");
                }}
              >
                Bottom
              </button>
            </div>
          ) : null}
          <div className="hand-cards decision-order-card-grid">
            {orderedCards.map((card, index) => {
              const instanceId = String(card.instanceId);
              return (
                <Fragment key={instanceId}>
                  {orderReorder.placeholderBefore(instanceId) ? (
                    <div className="hand-drag-placeholder" aria-hidden="true" />
                  ) : null}
                  <CardTile
                    card={card}
                    selectionOrderLabel={String(index + 1)}
                    disabled={disabled}
                    reorderable={!disabled}
                    onPreviewMoveNear={orderReorder.onPreviewMoveNear}
                    onMoveNear={orderReorder.onMoveNear}
                    onReorderCancel={orderReorder.onReorderCancel}
                    reorderDragStrategy="absolute"
                    onHover={onPreviewCard}
                  />
                  {orderReorder.placeholderAfter(instanceId) ? (
                    <div className="hand-drag-placeholder" aria-hidden="true" />
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        </>
      ) : null}
      {model.kind === "orderTriggers" ? (
        <div className={decisionCardGridClass(model.choices.length)}>
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
                onPointerEnter={() => {
                  if (choice.source === undefined) {
                    return;
                  }
                  onPreviewCard?.(
                    decisionClientCard(choice.source, display, cardModel),
                  );
                }}
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
      {model.kind === "binaryQuantity" ? (
        <div className="decision-option-list">
          {model.options.map((option) => (
            <button
              key={option.quantity}
              className="decision-choice"
              type="button"
              disabled={disabled}
              onClick={() => {
                (onSubmitQuantity ?? onQuantity)(option.quantity);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {model.kind === "chooseOption" ? (
        <div className="decision-option-list">
          {model.options.map((option) => (
            <button
              key={option.value}
              className="decision-choice"
              type="button"
              disabled={disabled}
              onClick={() => {
                (onSubmitOption ?? onOption)(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {model.kind === "chooseOne" ? (
        <div className="decision-choose-one-list">
          {model.options.map((option) => (
            <button
              key={option.actionIndex}
              className="decision-choose-one-option"
              type="button"
              disabled={disabled}
              onClick={() => {
                (onSubmitActionOption ?? onActionOption)(option.actionIndex);
              }}
            >
              {option.label}
            </button>
          ))}
          {(() => {
            const declineActionIndex = model.declineActionIndex;
            if (declineActionIndex === undefined) {
              return null;
            }
            return (
              <button
                className="decision-choose-one-option is-decline"
                type="button"
                disabled={disabled}
                onClick={() => {
                  (onSubmitActionOption ?? onActionOption)(declineActionIndex);
                }}
              >
                {model.declineLabel ?? "Do nothing"}
              </button>
            );
          })()}
        </div>
      ) : null}
      {isActionChoiceModal(model) ? (
        <>
          {(() => {
            const previewCard = "card" in model ? model.card : undefined;
            if (previewCard === undefined) {
              return null;
            }
            const display = cardDisplay?.(previewCard) ?? {
              name: String(previewCard.cardId),
            };
            return (
              <div
                className={decisionCardGridClass(
                  1,
                  " decision-card-preview-grid",
                )}
              >
                <button
                  className="decision-choice decision-card-choice"
                  type="button"
                  disabled={disabled}
                  onPointerEnter={() => {
                    onPreviewCard?.(
                      decisionClientCard(previewCard, display, cardModel),
                    );
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
              </div>
            );
          })()}
          {model.options.some((option) => option.cards !== undefined) ? (
            <div className={decisionCardGridClass(actionOptionCardCount)}>
              {model.options.flatMap((option) =>
                (option.cards ?? []).map((card) => {
                  const display = cardDisplay?.(card) ?? {
                    name: String(card.cardId),
                  };
                  return (
                    <button
                      key={`${String(option.actionIndex)}:${String(card.instanceId)}`}
                      className="decision-choice decision-card-choice"
                      type="button"
                      disabled={disabled}
                      onPointerEnter={() => {
                        onPreviewCard?.(
                          decisionClientCard(card, display, cardModel),
                        );
                      }}
                      onClick={() => {
                        (onSubmitActionOption ?? onActionOption)(
                          option.actionIndex,
                        );
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
                }),
              )}
            </div>
          ) : null}
          <div className="decision-option-list">
            {model.options
              .filter((option) => option.cards === undefined)
              .map((option) => (
                <button
                  key={option.actionIndex}
                  className="decision-choice"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    (onSubmitActionOption ?? onActionOption)(
                      option.actionIndex,
                    );
                  }}
                >
                  {option.label}
                </button>
              ))}
          </div>
        </>
      ) : null}
      {model.kind === "generic" ? (
        <p className="muted">This decision needs a dedicated control.</p>
      ) : null}
      {renderConfirm ? (
        <button
          className="action-button primary-action modal-submit-button"
          type="button"
          disabled={disabled || !model.canConfirm}
          onClick={onConfirm}
        >
          {"confirmLabel" in model ? model.confirmLabel : "Confirm"}
        </button>
      ) : null}
    </ModalFrame>
  );
};
