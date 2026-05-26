import type { DecisionId, PublicPendingDecision } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const CHOOSE_CARD_COST_ACTION_INDEX = -5;

export interface OptionalCardCostChoice {
  decisionId: DecisionId;
  declineActionIndex: number;
  chooseLabel: string;
  cardActions: Array<{ instanceId: string; actionIndex: number }>;
}

export const createOptionalCardCostChoice = (
  decision: PublicPendingDecision,
  actions: readonly ClientActionModel[],
): OptionalCardCostChoice | undefined => {
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
      payment?.kind === "cardCost" &&
      payment.selectedCardInstanceIds.length === 1
    );
  });
  if (invalidPaymentAction) {
    return undefined;
  }

  const chooseLabels = new Set(
    actions.flatMap((action) =>
      action.decisionPayment?.kind === "cardCost"
        ? [action.decisionPayment.chooseLabel]
        : [],
    ),
  );
  if (chooseLabels.size !== 1) {
    return undefined;
  }
  const chooseLabel = [...chooseLabels][0];
  if (chooseLabel === undefined) {
    return undefined;
  }

  const cardActions = actions.flatMap((action) => {
    const payment = action.decisionPayment;
    if (
      payment?.kind !== "cardCost" ||
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
    chooseLabel,
    cardActions,
  };
};

export const createOptionalCardCostModalActions = (
  choice: OptionalCardCostChoice | undefined,
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
          index: CHOOSE_CARD_COST_ACTION_INDEX,
          type: "respondToDecision",
          label: choice.chooseLabel,
        },
      ];

export const optionalCardCostActionForInstance = (
  choice: OptionalCardCostChoice | undefined,
  instanceId: string,
): number | undefined =>
  choice?.cardActions.find((action) => action.instanceId === instanceId)
    ?.actionIndex;

export const optionalCardCostInstanceIds = (
  choice: OptionalCardCostChoice | undefined,
): string[] => choice?.cardActions.map((action) => action.instanceId) ?? [];
