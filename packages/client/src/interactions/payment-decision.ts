import type { DecisionId, PublicPendingDecision } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const CHOOSE_CARD_COST_ACTION_INDEX = -5;

type CardCostPayment = Extract<
  NonNullable<ClientActionModel["decisionPayment"]>,
  { kind: "cardCost" }
>;

export interface OptionalCardCostGroup {
  chooseActionIndex: number;
  operation: CardCostPayment["operation"];
  chooseLabel: string;
  requiredCount: number;
  source?: CardCostPayment["source"] | undefined;
  cardActions: Array<{ instanceIds: string[]; actionIndex: number }>;
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
      payment.selectedCardInstanceIds.length > 0 &&
      (payment.selectedCardInstanceIds.length === 1 ||
        payment.source !== undefined)
    );
  });
  if (invalidPaymentAction) {
    return undefined;
  }

  const groupedActions = new Map<
    string,
    {
      operation: CardCostPayment["operation"];
      chooseLabel: string;
      requiredCount: number;
      source?: CardCostPayment["source"] | undefined;
      cardActions: Array<{ instanceIds: string[]; actionIndex: number }>;
    }
  >();
  for (const action of actions) {
    const payment = action.decisionPayment;
    if (payment?.kind !== "cardCost") {
      continue;
    }
    const instanceIds = payment.selectedCardInstanceIds.map(String);
    if (instanceIds.length === 0) {
      continue;
    }
    const directVisibleCardCost = isDirectVisibleSingleCardCost(payment);
    const groupKey = cardCostGroupKey(payment);
    const current = groupedActions.get(groupKey) ?? {
      operation: payment.operation,
      chooseLabel: chooseLabelForCardCostOperation(
        payment.operation,
        payment.chooseLabel,
      ),
      requiredCount: instanceIds.length,
      ...(payment.source === undefined || directVisibleCardCost
        ? {}
        : { source: payment.source }),
      cardActions: [],
    };
    if (current.requiredCount !== instanceIds.length) {
      return undefined;
    }
    current.cardActions.push({
      instanceIds,
      actionIndex: action.index,
    });
    groupedActions.set(groupKey, current);
  }
  const groups = [...groupedActions.values()].map(
    (
      { operation, chooseLabel, requiredCount, source, cardActions },
      index,
    ) => ({
      chooseActionIndex: CHOOSE_CARD_COST_ACTION_INDEX - index,
      operation,
      chooseLabel,
      requiredCount,
      ...(source === undefined ? {} : { source }),
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

export const autoOptionalCardCostGroup = (
  choice: OptionalCardCostChoice | undefined,
): OptionalCardCostGroup | undefined =>
  choice?.groups.length === 1 ? choice.groups[0] : undefined;

export const optionalCardCostGroupForActionIndex = (
  choice: OptionalCardCostChoice | undefined,
  actionIndex: number,
): OptionalCardCostGroup | undefined =>
  choice?.groups.find((group) => group.chooseActionIndex === actionIndex);

export const optionalCardCostActionForInstance = (
  choice: OptionalCardCostGroup | undefined,
  instanceId: string,
): number | undefined =>
  choice?.requiredCount === 1
    ? optionalCardCostActionForSelection(choice, [instanceId])
    : undefined;

export const optionalCardCostActionForSelection = (
  choice: OptionalCardCostGroup | undefined,
  instanceIds: readonly string[],
): number | undefined => {
  if (choice === undefined || instanceIds.length !== choice.requiredCount) {
    return undefined;
  }
  const selected = [...instanceIds].map(String).sort();
  return choice.cardActions.find((action) => {
    const candidate = [...action.instanceIds].sort();
    return (
      candidate.length === selected.length &&
      candidate.every((instanceId, index) => instanceId === selected[index])
    );
  })?.actionIndex;
};

export const optionalCardCostInstanceIds = (
  choice: OptionalCardCostGroup | undefined,
): string[] =>
  choice === undefined
    ? []
    : [...new Set(choice.cardActions.flatMap((action) => action.instanceIds))];

export interface DirectReturnDonCostClickResult {
  selectedInstanceIds: string[];
  actionIndex?: number | undefined;
}

export const directReturnDonCostClick = (
  group: OptionalCardCostGroup,
  selectedInstanceIds: readonly string[],
  clickedInstanceId: string,
): DirectReturnDonCostClickResult | undefined => {
  if (
    group.operation !== "returnDon" ||
    !optionalCardCostInstanceIds(group).includes(clickedInstanceId)
  ) {
    return undefined;
  }
  if (selectedInstanceIds.includes(clickedInstanceId)) {
    return {
      selectedInstanceIds: selectedInstanceIds.filter(
        (instanceId) => instanceId !== clickedInstanceId,
      ),
    };
  }
  if (selectedInstanceIds.length >= group.requiredCount) {
    return { selectedInstanceIds: [...selectedInstanceIds] };
  }
  const nextSelection = [...selectedInstanceIds, clickedInstanceId];
  if (nextSelection.length < group.requiredCount) {
    return { selectedInstanceIds: nextSelection };
  }
  const actionIndex = optionalCardCostActionForSelection(group, nextSelection);
  return actionIndex === undefined
    ? { selectedInstanceIds: [...selectedInstanceIds] }
    : { selectedInstanceIds: nextSelection, actionIndex };
};

const donPaymentLabelPattern = /^Pay cost with (?<count>[1-9]\d*) DON!!$/u;

export const createCanonicalDonPaymentActions = (
  actions: readonly ClientActionModel[],
): ClientActionModel[] | undefined => {
  const canonicalByLabel = new Map<string, ClientActionModel>();
  let sawDonPayment = false;
  let collapsedDonPayment = false;
  const result: ClientActionModel[] = [];
  for (const action of actions) {
    const isDonPayment =
      action.type === "respondToDecision" &&
      action.decisionPayment === undefined &&
      donPaymentLabelPattern.exec(action.label) !== null;
    if (!isDonPayment) {
      result.push(action);
      continue;
    }
    sawDonPayment = true;
    if (canonicalByLabel.has(action.label)) {
      collapsedDonPayment = true;
      continue;
    }
    canonicalByLabel.set(action.label, action);
    result.push(action);
  }
  if (!sawDonPayment) {
    return undefined;
  }
  const nonDonPaymentAction = actions.some(
    (action) =>
      action.type === "respondToDecision" &&
      action.decisionPayment === undefined &&
      donPaymentLabelPattern.exec(action.label) === null,
  );
  if (nonDonPaymentAction) {
    return undefined;
  }
  return collapsedDonPayment ? result : undefined;
};

export const createCanonicalDonPaymentModalActions = (
  actions: readonly ClientActionModel[],
): ClientActionModel[] | undefined => {
  const canonicalByLabel = new Map<string, ClientActionModel>();
  for (const action of actions) {
    if (
      action.type !== "respondToDecision" ||
      action.decisionPayment !== undefined ||
      donPaymentLabelPattern.exec(action.label) === null
    ) {
      return undefined;
    }
    if (!canonicalByLabel.has(action.label)) {
      canonicalByLabel.set(action.label, action);
    }
  }
  return canonicalByLabel.size === 0
    ? undefined
    : [...canonicalByLabel.values()];
};

export const autoPayCostActionIndex = (
  decision: PublicPendingDecision | undefined,
  actions: readonly ClientActionModel[],
): number | undefined => {
  if (decision?.type !== "payCost") {
    return undefined;
  }

  const paymentActions = actions.filter(
    (action) => action.decisionPayment?.kind !== "paymentDeclined",
  );
  const hasDeclineAction = actions.some(
    (action) => action.decisionPayment?.kind === "paymentDeclined",
  );
  if (hasDeclineAction) {
    return undefined;
  }
  if (paymentActions.length !== 1) {
    return undefined;
  }

  const [paymentAction] = paymentActions;
  if (
    paymentAction === undefined ||
    paymentAction.type !== "respondToDecision" ||
    paymentAction.label !== "Pay cost" ||
    paymentAction.decisionPayment !== undefined
  ) {
    return undefined;
  }

  return paymentAction.index;
};

const chooseLabelForCardCostOperation = (
  operation: CardCostPayment["operation"],
  fallback: string,
): string => {
  switch (operation) {
    case "trash":
      return "Choose card to trash";
    case "moveCards":
      return fallback;
    case "returnDon":
      return fallback;
    case "returnToHand":
      return fallback;
  }
};

const cardCostGroupKey = (payment: CardCostPayment): string =>
  isDirectVisibleSingleCardCost(payment)
    ? [payment.operation, "direct-visible-card"].join(":")
    : [
        payment.operation,
        payment.source?.zone ?? "",
        payment.source?.playerId ?? "",
      ].join(":");

const isDirectVisibleSingleCardCost = (payment: CardCostPayment): boolean =>
  payment.selectedCardInstanceIds.length === 1 &&
  (payment.source === undefined ||
    payment.source.zone === "hand" ||
    payment.source.zone === "characterArea" ||
    payment.source.zone === "leaderArea" ||
    payment.source.zone === "stageArea");
