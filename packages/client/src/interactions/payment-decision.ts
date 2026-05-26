import type { DecisionId, PublicPendingDecision } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const CHOOSE_TRASH_COST_CARD_ACTION_INDEX = -5;

export interface OptionalTrashCardCostChoice {
  decisionId: DecisionId;
  declineActionIndex: number;
  cardActions: Array<{ instanceId: string; actionIndex: number }>;
}

export const createOptionalTrashCardCostChoice = (
  decision: PublicPendingDecision,
  actions: readonly ClientActionModel[],
): OptionalTrashCardCostChoice | undefined => {
  if (decision.type !== "payCost") {
    return undefined;
  }
  const declineAction = actions.find(
    (action) => action.decisionPayment?.kind === "paymentDeclined",
  );
  if (declineAction === undefined) {
    return undefined;
  }
  const invalidPaymentAction = actions.some((action) => {
    const payment = action.decisionPayment;
    if (payment?.kind === "paymentDeclined") {
      return false;
    }
    return !(
      payment?.kind === "trashCardCost" &&
      payment.selectedCardInstanceIds.length === 1
    );
  });
  if (invalidPaymentAction) {
    return undefined;
  }
  const cardActions = actions.flatMap((action) => {
    const payment = action.decisionPayment;
    if (
      payment?.kind !== "trashCardCost" ||
      payment.selectedCardInstanceIds.length !== 1
    ) {
      return [];
    }
    const instanceId = payment.selectedCardInstanceIds[0];
    return instanceId === undefined
      ? []
      : [{ instanceId: String(instanceId), actionIndex: action.index }];
  });
  if (cardActions.length === 0) {
    return undefined;
  }
  return {
    decisionId: decision.id,
    declineActionIndex: declineAction.index,
    cardActions,
  };
};

export const createOptionalTrashCardCostModalActions = (
  choice: OptionalTrashCardCostChoice | undefined,
): ClientActionModel[] =>
  choice === undefined
    ? []
    : [
        {
          index: choice.declineActionIndex,
          type: "respondToDecision",
          label: "Decline cost",
        },
        {
          index: CHOOSE_TRASH_COST_CARD_ACTION_INDEX,
          type: "respondToDecision",
          label: "Choose card to trash",
        },
      ];

export const optionalTrashCardCostActionForInstance = (
  choice: OptionalTrashCardCostChoice | undefined,
  instanceId: string,
): number | undefined =>
  choice?.cardActions.find((action) => action.instanceId === instanceId)
    ?.actionIndex;

export const optionalTrashCardCostInstanceIds = (
  choice: OptionalTrashCardCostChoice | undefined,
): string[] => choice?.cardActions.map((action) => action.instanceId) ?? [];
