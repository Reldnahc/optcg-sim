import type { DecisionId, PublicPendingDecision } from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

export const CHOOSE_CARD_COST_ACTION_INDEX = -5;

type CardCostPayment = Extract<
  NonNullable<ClientActionModel["decisionPayment"]>,
  { kind: "cardCost" }
>;
type OptionalCardCostOperation = CardCostPayment["operation"] | "attachDon";

export interface OptionalCardCostGroup {
  chooseActionIndex: number;
  operation: OptionalCardCostOperation;
  chooseLabel: string;
  requiredCount: number;
  source?: CardCostPayment["source"] | undefined;
  cardActions: Array<{
    instanceIds: string[];
    actionIndex: number;
    targetInstanceId?: string | undefined;
    selectedCards?: CardCostPayment["selectedCards"] | undefined;
  }>;
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
    {
      operation: OptionalCardCostOperation;
      chooseLabel: string;
      requiredCount: number;
      source?: CardCostPayment["source"] | undefined;
      cardActions: Array<{
        instanceIds: string[];
        actionIndex: number;
        targetInstanceId?: string | undefined;
        selectedCards?: CardCostPayment["selectedCards"] | undefined;
      }>;
    }
  >();
  for (const action of actions) {
    if (action.attachment !== undefined) {
      const groupKey = "attachDon:attachment";
      const current = groupedActions.get(groupKey) ?? {
        operation: "attachDon" as const,
        chooseLabel: "Choose DON!! to attach",
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
      ...(payment.selectedCards === undefined
        ? {}
        : { selectedCards: payment.selectedCards }),
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

export const optionalCardCostAttachmentTargetInstanceIds = (
  choice: OptionalCardCostGroup | undefined,
  selectedDonInstanceIds: readonly string[],
): string[] => {
  if (
    choice === undefined ||
    choice.operation !== "attachDon" ||
    selectedDonInstanceIds.length === 0
  ) {
    return [];
  }
  const selected = [...selectedDonInstanceIds].map(String).sort();
  return [
    ...new Set(
      choice.cardActions.flatMap((action) => {
        if (action.targetInstanceId === undefined) {
          return [];
        }
        const candidate = [...action.instanceIds].map(String).sort();
        return candidate.length === selected.length &&
          candidate.every((instanceId, index) => instanceId === selected[index])
          ? [action.targetInstanceId]
          : [];
      }),
    ),
  ];
};

export const cardCostGroupRequiresManualConfirm = (
  group: Pick<OptionalCardCostGroup, "operation" | "source">,
): boolean => group.operation === "moveCards" && group.source?.zone === "trash";

const donPaymentLabelPattern =
  /^(?:Pay(?: cost with)?|Rest) (?<count>[1-9]\d*) DON!!$/u;
const donPaymentResponseKeyPattern = /^payment:don:(?<count>[1-9]\d*)$/u;

const donPaymentCanonicalKey = (
  action: ClientActionModel,
): string | undefined => {
  const responseKeyMatch =
    action.responseKey === undefined
      ? null
      : donPaymentResponseKeyPattern.exec(action.responseKey);
  if (responseKeyMatch?.groups?.["count"] !== undefined) {
    return `don:${responseKeyMatch.groups["count"]}`;
  }
  const labelMatch = donPaymentLabelPattern.exec(action.label);
  return labelMatch?.groups?.["count"] === undefined
    ? undefined
    : `don:${labelMatch.groups["count"]}`;
};

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
      donPaymentCanonicalKey(action) !== undefined;
    if (!isDonPayment) {
      result.push(action);
      continue;
    }
    sawDonPayment = true;
    const canonicalKey = donPaymentCanonicalKey(action);
    if (canonicalKey === undefined) {
      result.push(action);
      continue;
    }
    if (canonicalByLabel.has(canonicalKey)) {
      collapsedDonPayment = true;
      continue;
    }
    canonicalByLabel.set(canonicalKey, action);
    result.push(action);
  }
  if (!sawDonPayment) {
    return undefined;
  }
  const nonDonPaymentAction = actions.some(
    (action) =>
      action.type === "respondToDecision" &&
      action.decisionPayment === undefined &&
      donPaymentCanonicalKey(action) === undefined,
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
      donPaymentCanonicalKey(action) === undefined
    ) {
      return undefined;
    }
    const canonicalKey = donPaymentCanonicalKey(action);
    if (canonicalKey !== undefined && !canonicalByLabel.has(canonicalKey)) {
      canonicalByLabel.set(canonicalKey, action);
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
    paymentAction.decisionPayment !== undefined
  ) {
    return undefined;
  }

  return paymentAction.index;
};

const quickPayRestSelfLabels = new Set(["Rest this card"]);
const quickPayTrashSelfLabels = new Set(["Trash this card"]);

const quickPayDonPaymentKey = (
  action: ClientActionModel,
): string | undefined =>
  donPaymentCanonicalKey(action) === "don:1" ? "don:1" : undefined;

const quickPayActivateMainPaymentKey = (
  action: ClientActionModel,
): string | undefined => {
  if (action.type !== "respondToDecision") {
    return undefined;
  }
  const donKey = quickPayDonPaymentKey(action);
  if (donKey !== undefined) {
    return donKey;
  }
  if (quickPayRestSelfLabels.has(action.label)) {
    return "rest:self";
  }
  if (quickPayTrashSelfLabels.has(action.label)) {
    return "trash:self";
  }
  return undefined;
};

export const quickPayActivateMainCostActionIndex = (
  decision: PublicPendingDecision | undefined,
  actions: readonly ClientActionModel[],
): number | undefined => {
  if (decision?.type !== "payCost") {
    return undefined;
  }
  const paymentActions = actions.filter(
    (action) => action.decisionPayment?.kind !== "paymentDeclined",
  );
  if (paymentActions.length === 0) {
    return undefined;
  }

  const canonicalByPaymentKey = new Map<string, ClientActionModel>();
  for (const action of paymentActions) {
    const paymentKey = quickPayActivateMainPaymentKey(action);
    if (paymentKey === undefined) {
      return undefined;
    }
    if (!canonicalByPaymentKey.has(paymentKey)) {
      canonicalByPaymentKey.set(paymentKey, action);
    }
  }
  return canonicalByPaymentKey.size === 1
    ? canonicalByPaymentKey.values().next().value?.index
    : undefined;
};

const countLabel = (count: number, singular: string, plural: string): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;

export const cardCostPaymentLabel = (
  group: Pick<
    OptionalCardCostGroup,
    "operation" | "requiredCount" | "source" | "chooseLabel"
  >,
): string => {
  const count = group.requiredCount;
  switch (group.operation) {
    case "trash":
      if (group.source?.zone === "hand") {
        return `Trash ${countLabel(count, "card", "cards")} from hand`;
      }
      if (group.source?.zone === "characterArea") {
        return `Trash ${countLabel(count, "Character", "Characters")}`;
      }
      return `Trash ${countLabel(count, "card", "cards")}`;
    case "moveCards":
      if (group.source?.zone === "trash") {
        return `Place ${countLabel(count, "card", "cards")} from trash at bottom`;
      }
      if (group.source?.zone === "life") {
        return `Add ${countLabel(count, "Life card", "Life cards")} to hand`;
      }
      return group.chooseLabel;
    case "returnDon":
      return `Return ${countLabel(count, "DON!!", "DON!!")}`;
    case "attachDon":
      return `Attach ${countLabel(count, "DON!!", "DON!!")}`;
    case "reveal":
      if (group.source?.zone === "hand") {
        return `Reveal ${countLabel(count, "card", "cards")} from hand`;
      }
      return `Reveal ${countLabel(count, "card", "cards")}`;
    case "returnToHand":
      return `Return ${countLabel(count, "card", "cards")} to hand`;
  }
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
    case "reveal":
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
