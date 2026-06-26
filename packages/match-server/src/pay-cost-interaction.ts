import type { PayCostInteraction, PayCostInteractionGroup } from "@optcg/types";

import type { DevVisibleAction } from "./dev-snapshot-types.js";

export const CHOOSE_PAY_COST_GROUP_ACTION_INDEX = -5;

type CardCostPayment = Extract<
  NonNullable<DevVisibleAction["decisionPayment"]>,
  { kind: "cardCost" }
>;

const sourceCardCostGroupKey = (payment: CardCostPayment): string =>
  [
    payment.operation,
    payment.source?.zone ?? "",
    payment.source?.playerId ?? "",
  ].join(":");

export const createPayCostInteraction = ({
  actions,
  decisionId,
}: {
  actions: readonly DevVisibleAction[];
  decisionId: PayCostInteraction["decisionId"];
}): PayCostInteraction | undefined => {
  const decisionActions = actions.filter(
    (action) => action.type === "respondToDecision",
  );
  const declineAction = decisionActions.find(
    (action) => action.decisionPayment?.kind === "paymentDeclined",
  );
  if (declineAction === undefined) {
    return undefined;
  }
  const invalidPaymentAction = decisionActions.some((action) => {
    const payment = action.decisionPayment;
    if (payment?.kind === "paymentDeclined") {
      return false;
    }
    return !(
      (payment?.kind === "cardCost" &&
        payment.selectedCardInstanceIds.length > 0 &&
        (payment.selectedCardInstanceIds.length === 1 ||
          payment.source !== undefined)) ||
      action.attachment !== undefined
    );
  });
  if (invalidPaymentAction) {
    return undefined;
  }

  const groupedActions = new Map<
    string,
    Omit<PayCostInteractionGroup, "chooseActionIndex"> & {
      minCount: number;
    }
  >();
  for (const action of decisionActions) {
    if (action.attachment !== undefined) {
      const groupKey = "attachDon:attachment";
      const current = groupedActions.get(groupKey) ?? {
        operation: "attachDon" as const,
        chooseLabel: "Choose DON!! to attach",
        minCount: 1,
        requiredCount: 1,
        source: { zone: "costArea" as const },
        cardActions: [],
      };
      current.cardActions.push({
        instanceIds: [String(action.attachment.donInstanceId)],
        actionIndex: action.index,
        targetInstanceId: String(action.attachment.targetInstanceId),
      });
      groupedActions.set(groupKey, current);
      continue;
    }
    const payment = action.decisionPayment;
    if (payment?.kind !== "cardCost") {
      continue;
    }
    const instanceIds = payment.selectedCardInstanceIds.map(String);
    const groupKey = sourceCardCostGroupKey(payment);
    const current = groupedActions.get(groupKey) ?? {
      operation: payment.operation,
      chooseLabel: payment.chooseLabel,
      minCount: instanceIds.length,
      requiredCount: instanceIds.length,
      ...(payment.source === undefined ? {} : { source: payment.source }),
      cardActions: [],
    };
    current.minCount = Math.min(current.minCount, instanceIds.length);
    current.requiredCount = Math.max(current.requiredCount, instanceIds.length);
    current.cardActions.push({
      instanceIds,
      actionIndex: action.index,
      ...(payment.selectedCards === undefined
        ? {}
        : { selectedCards: payment.selectedCards }),
    });
    groupedActions.set(groupKey, current);
  }

  const groups = [...groupedActions.values()].map(
    ({ minCount, ...group }, index): PayCostInteractionGroup => ({
      chooseActionIndex: CHOOSE_PAY_COST_GROUP_ACTION_INDEX - index,
      ...group,
      ...(minCount === group.requiredCount ? {} : { minCount }),
    }),
  );
  return groups.length === 0
    ? undefined
    : {
        decisionId,
        declineActionIndex: declineAction.index,
        groups,
      };
};
