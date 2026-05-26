import type { DecisionId, PublicPendingDecision } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const CHOOSE_CARD_COST_ACTION_INDEX = -5;

export interface OptionalCardCostGroup {
  chooseActionIndex: number;
  operation: "trash" | "returnToHand";
  chooseLabel: string;
  cardActions: Array<{ instanceId: string; actionIndex: number }>;
}

export interface OptionalCardCostChoice {
  decisionId: DecisionId;
  declineActionIndex: number;
  groups: OptionalCardCostGroup[];
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

  const groupedActions = new Map<
    "trash" | "returnToHand",
    {
      chooseLabel: string;
      cardActions: Array<{ instanceId: string; actionIndex: number }>;
    }
  >();
  for (const action of actions) {
    const payment = action.decisionPayment;
    if (
      payment?.kind !== "cardCost" ||
      payment.selectedCardInstanceIds.length !== 1
    ) {
      continue;
    }
    const instanceId = payment.selectedCardInstanceIds[0];
    if (instanceId === undefined) {
      continue;
    }
    const current = groupedActions.get(payment.operation) ?? {
      chooseLabel: chooseLabelForCardCostOperation(
        payment.operation,
        payment.chooseLabel,
      ),
      cardActions: [],
    };
    current.cardActions.push({
      instanceId: String(instanceId),
      actionIndex: action.index,
    });
    groupedActions.set(payment.operation, current);
  }
  const groups = [...groupedActions.entries()].map(
    ([operation, { chooseLabel, cardActions }], index) => ({
      chooseActionIndex: CHOOSE_CARD_COST_ACTION_INDEX - index,
      operation,
      chooseLabel,
      cardActions,
    }),
  );
  if (groups.length === 0) {
    return undefined;
  }
  return {
    decisionId: decision.id,
    declineActionIndex: declineAction.index,
    groups,
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
        ...choice.groups.map((group) => ({
          index: group.chooseActionIndex,
          type: "respondToDecision" as const,
          label: group.chooseLabel,
        })),
      ];

export const optionalCardCostGroupForActionIndex = (
  choice: OptionalCardCostChoice | undefined,
  actionIndex: number,
): OptionalCardCostGroup | undefined =>
  choice?.groups.find((group) => group.chooseActionIndex === actionIndex);

export const optionalCardCostActionForInstance = (
  choice: OptionalCardCostGroup | undefined,
  instanceId: string,
): number | undefined =>
  choice?.cardActions.find((action) => action.instanceId === instanceId)
    ?.actionIndex;

export const optionalCardCostInstanceIds = (
  choice: OptionalCardCostGroup | undefined,
): string[] => choice?.cardActions.map((action) => action.instanceId) ?? [];

const chooseLabelForCardCostOperation = (
  operation: "trash" | "returnToHand",
  fallback: string,
): string => {
  switch (operation) {
    case "trash":
      return "Choose card to trash";
    case "returnToHand":
      return fallback;
  }
};
