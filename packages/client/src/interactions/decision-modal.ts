import type {
  CardRef,
  DecisionId,
  DecisionResponse,
  InstanceId,
  PublicChooseTriggerOrderDecision,
  PublicChooseQuantityDecision,
  PublicOrderCardsDecision,
  PublicPendingDecision,
  PublicSelectCardsDecision,
  PublicSelectTargetsDecision,
} from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";
import { clickSelectionIsComplete } from "./click-selection.js";

export type DecisionDraft =
  | {
      kind: "selectCards";
      decisionId: DecisionId;
      selectedInstanceIds: InstanceId[];
    }
  | {
      kind: "orderCards";
      decisionId: DecisionId;
      orderedInstanceIds: InstanceId[];
      placementDestination: "top" | "bottom";
    }
  | {
      kind: "orderTriggers";
      decisionId: DecisionId;
      orderedTriggerIds: string[];
    }
  | {
      kind: "chooseQuantity";
      decisionId: DecisionId;
      quantity: number;
    }
  | {
      kind: "chooseOption";
      decisionId: DecisionId;
      option: string;
    }
  | {
      kind: "actionOptions";
      decisionId: DecisionId;
      actionIndex: number;
    }
  | {
      kind: "generic";
      decisionId: DecisionId;
    };

export interface DecisionModalPresentationModel {
  title: string;
  instruction: string;
  prompt: string;
  source?: CardRef;
}

export type DecisionModalModel = DecisionModalPresentationModel &
  (
    | {
        kind: "selectCards";
        decisionId: DecisionId;
        min: number;
        max: number;
        canConfirm: boolean;
        selectedInstanceIds: InstanceId[];
        cards: Array<{ card: CardRef; selectable: boolean }>;
        confirmLabel: string;
      }
    | {
        kind: "orderCards";
        decisionId: DecisionId;
        destination: PublicOrderCardsDecision["destination"];
        placement?: PublicOrderCardsDecision["placement"];
        canConfirm: true;
        orderedInstanceIds: InstanceId[];
        placementDestination: "top" | "bottom";
        cards: PublicOrderCardsDecision["cards"];
      }
    | {
        kind: "orderTriggers";
        decisionId: DecisionId;
        canConfirm: boolean;
        orderedTriggerIds: string[];
        choices: Array<{
          triggerId: string;
          source?: CardRef;
          selected: boolean;
          orderIndex?: number;
        }>;
        confirmLabel: string;
      }
    | {
        kind: "chooseQuantity";
        decisionId: DecisionId;
        min: number;
        max: number;
        quantity: number;
        canConfirm: boolean;
      }
    | {
        kind: "binaryQuantity";
        decisionId: DecisionId;
        selectedQuantity: 0 | 1;
        options: Array<{ quantity: 0 | 1; label: string }>;
        canConfirm: boolean;
      }
    | {
        kind: "chooseOption";
        decisionId: DecisionId;
        options: Array<{ value: string; label: string }>;
        selectedOption: string;
        canConfirm: true;
      }
    | {
        kind: "actionOptions";
        decisionId: DecisionId;
        card?: CardRef;
        options: Array<{
          actionIndex: number;
          label: string;
          cards?: CardRef[];
        }>;
        selectedActionIndex: number;
        canConfirm: true;
      }
    | {
        kind: "chooseOne";
        decisionId: DecisionId;
        options: Array<{
          actionIndex: number;
          label: string;
        }>;
        declineActionIndex?: number;
        declineLabel?: string;
        canConfirm: true;
      }
    | {
        kind: "generic";
        decisionId: DecisionId;
        canConfirm: false;
        decisionType: string;
      }
  );

type CardDecision =
  | PublicSelectCardsDecision
  | PublicSelectTargetsDecision
  | PublicOrderCardsDecision
  | PublicChooseTriggerOrderDecision
  | PublicChooseQuantityDecision;

const suppressedDecisionIdPrefixes = ["decision:counterStep:pass:"] as const;

export type PendingDecisionInteractionMode = "modal" | "global" | "zoneClick";

export const isDecisionModalSuppressed = (
  decision: PublicPendingDecision,
): boolean =>
  suppressedDecisionIdPrefixes.some((prefix) =>
    String(decision.id).startsWith(prefix),
  );

const selectableDecisionCandidateIds = (
  decision: PublicPendingDecision,
): readonly InstanceId[] =>
  decision.type === "selectCards" || decision.type === "selectTargets"
    ? decision.candidates.map((candidate) => candidate.card.instanceId)
    : [];

export const getPendingDecisionInteractionMode = (
  decision: PublicPendingDecision,
  options: { visibleZoneClickInstanceIds?: readonly string[] } = {},
): PendingDecisionInteractionMode => {
  if (isDecisionModalSuppressed(decision)) {
    return "global";
  }
  if (decision.type !== "selectCards" && decision.type !== "selectTargets") {
    return "modal";
  }
  const candidateIds = selectableDecisionCandidateIds(decision);
  if (candidateIds.length === 0) {
    return decision.type === "selectTargets" && decision.min === 0
      ? "zoneClick"
      : "modal";
  }
  const visibleIds = new Set(options.visibleZoneClickInstanceIds ?? []);
  return candidateIds.every((id) => visibleIds.has(instanceKey(id)))
    ? "zoneClick"
    : "modal";
};

const instanceKey = (instanceId: InstanceId): string => String(instanceId);

const assertDraftForDecision = (
  decision: CardDecision,
  draft: DecisionDraft,
): void => {
  const kindMatches =
    draft.kind === decision.type ||
    (decision.type === "selectTargets" && draft.kind === "selectCards") ||
    (decision.type === "chooseTriggerOrder" && draft.kind === "orderTriggers");
  if (draft.decisionId !== decision.id || !kindMatches) {
    throw new Error("Decision draft does not match the active decision.");
  }
};

const selectCandidateIds = (
  decision: PublicSelectCardsDecision | PublicSelectTargetsDecision,
): ReadonlySet<string> =>
  new Set(
    decision.candidates.map((candidate) =>
      instanceKey(candidate.card.instanceId),
    ),
  );

const selectedDifferentNameGroups = (
  decision: PublicSelectCardsDecision,
  draft: Extract<DecisionDraft, { kind: "selectCards" }>,
): ReadonlySet<string> => {
  if (decision.selectionConstraint?.type !== "differentNames") {
    return new Set();
  }
  const groups = decision.selectionConstraint.groupKeysByInstanceId;
  return new Set(
    draft.selectedInstanceIds.flatMap((instanceId) => {
      const group = groups[instanceKey(instanceId)];
      return group === undefined ? [] : [group];
    }),
  );
};

const isSelectableSelectCardChoice = (
  decision: PublicSelectCardsDecision,
  draft: Extract<DecisionDraft, { kind: "selectCards" }>,
  instanceId: InstanceId,
): boolean => {
  const instance = instanceKey(instanceId);
  if (!selectCandidateIds(decision).has(instance)) {
    return false;
  }
  if (
    draft.selectedInstanceIds.some((selectedId) => selectedId === instanceId)
  ) {
    return true;
  }
  if (decision.selectionConstraint?.type !== "differentNames") {
    return true;
  }
  const group = decision.selectionConstraint.groupKeysByInstanceId[instance];
  return (
    group === undefined ||
    !selectedDifferentNameGroups(decision, draft).has(group)
  );
};

const orderCardIds = (
  decision: PublicOrderCardsDecision,
): ReadonlySet<string> =>
  new Set(decision.cards.map((card) => instanceKey(card.instanceId)));

const triggerChoiceIds = (
  decision: PublicChooseTriggerOrderDecision,
): ReadonlySet<string> =>
  new Set(decision.choices.map((choice) => choice.triggerId));

const isSelectConfirmable = (
  decision: PublicSelectCardsDecision | PublicSelectTargetsDecision,
  draft: Extract<DecisionDraft, { kind: "selectCards" }>,
): boolean =>
  draft.selectedInstanceIds.length >= decision.min &&
  draft.selectedInstanceIds.length <= decision.max;

export const selectionDraftIsComplete = (
  decision: PublicSelectCardsDecision | PublicSelectTargetsDecision,
  draft: DecisionDraft,
): boolean => {
  assertDraftForDecision(decision, draft);
  if (draft.kind !== "selectCards") {
    return false;
  }
  return clickSelectionIsComplete({
    selectableInstanceIds: selectableDecisionCandidateIds(decision).map(String),
    selectedInstanceIds: draft.selectedInstanceIds.map(String),
    max: decision.max,
    isCompleteSelection: () => isSelectConfirmable(decision, draft),
  });
};

const isQuantityConfirmable = (
  decision: PublicChooseQuantityDecision,
  draft: Extract<DecisionDraft, { kind: "chooseQuantity" }>,
): boolean => draft.quantity >= decision.min && draft.quantity <= decision.max;

const optionLabel = (decisionType: string, option: string): string => {
  if (decisionType === "mulligan" && option === "keep") {
    return "Keep hand";
  }
  if (decisionType === "mulligan" && option === "mulligan") {
    return "Mulligan";
  }
  return option;
};

const simpleDecisionOptions = (
  decision: PublicPendingDecision,
): string[] | undefined => {
  if (decision.type === "mulligan") {
    return ["keep", "mulligan"];
  }
  return undefined;
};

const donPaymentResponseKeyPattern = /^payment:don:(?<count>[1-9]\d*)$/u;
const donPaymentLabelPattern =
  /^(?:Pay(?: cost with)?|Rest) (?<count>[1-9]\d*) DON!!$/u;

const donPaymentCount = (
  action: Pick<ClientActionModel, "label" | "responseKey">,
  presentationLabel: string | undefined,
): string | undefined => {
  const responseKeyMatch =
    action.responseKey === undefined
      ? null
      : donPaymentResponseKeyPattern.exec(action.responseKey);
  const responseKeyCount = responseKeyMatch?.groups?.["count"];
  if (responseKeyCount !== undefined) {
    return responseKeyCount;
  }
  return (
    donPaymentLabelPattern.exec(action.label)?.groups?.["count"] ??
    (presentationLabel === undefined
      ? undefined
      : donPaymentLabelPattern.exec(presentationLabel)?.groups?.["count"])
  );
};

const actionOptionModels = (
  decision: PublicPendingDecision,
  actions: readonly ClientActionModel[],
  options: { includePresentationCards?: boolean } = {},
): Array<{ actionIndex: number; label: string; cards?: CardRef[] }> => {
  const includePresentationCards = options.includePresentationCards ?? true;
  const presentationLabelsByResponseKey = new Map(
    (decision.presentation.choices ?? []).map((choice) => [
      choice.responseKey,
      choice.label,
    ]),
  );
  const presentationCardsByResponseKey = new Map(
    (decision.presentation.choices ?? []).flatMap((choice) =>
      choice.cards === undefined || !includePresentationCards
        ? []
        : [[choice.responseKey, choice.cards] as const],
    ),
  );
  const seenDonPaymentKeys = new Set<string>();
  const models: Array<{
    actionIndex: number;
    label: string;
    cards?: CardRef[];
  }> = [];
  for (const action of actions) {
    if (action.type !== "respondToDecision") {
      continue;
    }
    const presentationLabel =
      action.responseKey === undefined
        ? undefined
        : presentationLabelsByResponseKey.get(action.responseKey);
    const paymentDonCount = donPaymentCount(action, presentationLabel);
    const label =
      paymentDonCount !== undefined
        ? `Pay ${paymentDonCount} DON!!`
        : action.responseKey === undefined
          ? action.label
          : (presentationLabel ?? action.label);
    const donPaymentKey =
      paymentDonCount === undefined ? undefined : `don:${paymentDonCount}`;
    if (donPaymentKey !== undefined) {
      if (seenDonPaymentKeys.has(donPaymentKey)) {
        continue;
      }
      seenDonPaymentKeys.add(donPaymentKey);
    }
    const cards =
      action.responseKey === undefined
        ? undefined
        : presentationCardsByResponseKey.get(action.responseKey);
    models.push({
      actionIndex: action.index,
      label,
      ...(cards === undefined ? {} : { cards }),
    });
  }
  return models;
};

const chooseOneOptionModels = (
  decision: PublicPendingDecision,
  actions: readonly ClientActionModel[],
): {
  options: Array<{ actionIndex: number; label: string }>;
  declineActionIndex?: number;
  declineLabel?: string;
} => {
  const responseActionsByKey = new Map<string, ClientActionModel>();
  for (const action of actions) {
    if (
      action.type !== "respondToDecision" ||
      action.responseKey === undefined
    ) {
      continue;
    }
    responseActionsByKey.set(action.responseKey, action);
  }
  const choices = decision.presentation.choices ?? [];
  const optionModels = choices.flatMap((choice) => {
    if (choice.responseKey === "decline") {
      return [];
    }
    const action = responseActionsByKey.get(choice.responseKey);
    if (action === undefined) {
      return [];
    }
    return [
      {
        actionIndex: action.index,
        label: choice.label,
      },
    ];
  });
  const declineAction = responseActionsByKey.get("decline");
  const declineChoice = choices.find(
    (choice) => choice.responseKey === "decline",
  );
  return {
    options: optionModels,
    ...(declineAction === undefined
      ? {}
      : {
          declineActionIndex: declineAction.index,
          declineLabel: declineChoice?.label ?? "Do nothing",
        }),
  };
};

const modalPresentation = (
  decision: PublicPendingDecision,
): DecisionModalPresentationModel => ({
  title: decision.presentation.title,
  instruction: decision.presentation.instruction,
  prompt: decision.prompt,
  ...(decision.presentation.source === undefined
    ? {}
    : { source: decision.presentation.source }),
});

const chooseCardsTitle = (max: number): string =>
  `Choose ${String(max)} ${max === 1 ? "card" : "cards"}`;

export const createDecisionDraft = (
  decision: PublicPendingDecision,
  responseActions: readonly ClientActionModel[] = [],
): DecisionDraft => {
  if (decision.type === "selectCards") {
    return {
      kind: "selectCards",
      decisionId: decision.id,
      selectedInstanceIds: [],
    };
  }
  if (decision.type === "selectTargets") {
    return {
      kind: "selectCards",
      decisionId: decision.id,
      selectedInstanceIds: [],
    };
  }
  if (decision.type === "orderCards") {
    return {
      kind: "orderCards",
      decisionId: decision.id,
      orderedInstanceIds: decision.cards.map((card) => card.instanceId),
      placementDestination: "top",
    };
  }
  if (decision.type === "chooseTriggerOrder") {
    return {
      kind: "orderTriggers",
      decisionId: decision.id,
      orderedTriggerIds: [],
    };
  }
  if (decision.type === "chooseQuantity") {
    return {
      kind: "chooseQuantity",
      decisionId: decision.id,
      quantity: decision.max,
    };
  }
  const options = simpleDecisionOptions(decision);
  if (options !== undefined) {
    return {
      kind: "chooseOption",
      decisionId: decision.id,
      option: options[0] ?? "",
    };
  }
  const actionOptions = actionOptionModels(decision, responseActions, {
    includePresentationCards: decision.type !== "confirmLifeTrigger",
  });
  const firstAction = actionOptions[0];
  if (firstAction !== undefined) {
    return {
      kind: "actionOptions",
      decisionId: decision.id,
      actionIndex: firstAction.actionIndex,
    };
  }
  return { kind: "generic", decisionId: decision.id };
};

export const setDecisionOption = (
  decision: PublicPendingDecision,
  draft: DecisionDraft,
  option: string,
): DecisionDraft => {
  if (draft.kind !== "chooseOption") {
    throw new Error("Decision draft is not a chooseOption draft.");
  }
  const options = simpleDecisionOptions(decision);
  if (options === undefined || !options.includes(option)) {
    return draft;
  }
  return { ...draft, option };
};

export const setDecisionActionOption = (
  draft: DecisionDraft,
  actionIndex: number,
): DecisionDraft => {
  if (draft.kind !== "actionOptions") {
    throw new Error("Decision draft is not an actionOptions draft.");
  }
  return { ...draft, actionIndex };
};

export const toggleDecisionSelectedCard = (
  decision: PublicSelectCardsDecision | PublicSelectTargetsDecision,
  draft: DecisionDraft,
  instanceId: InstanceId,
): DecisionDraft => {
  assertDraftForDecision(decision, draft);
  if (draft.kind !== "selectCards") {
    throw new Error("Decision draft is not a selectCards draft.");
  }
  if (
    decision.type === "selectCards" &&
    !isSelectableSelectCardChoice(decision, draft, instanceId)
  ) {
    return draft;
  }
  if (
    decision.type === "selectTargets" &&
    !selectCandidateIds(decision).has(instanceKey(instanceId))
  ) {
    return draft;
  }
  if (
    draft.selectedInstanceIds.some((selectedId) => selectedId === instanceId)
  ) {
    return {
      ...draft,
      selectedInstanceIds: draft.selectedInstanceIds.filter(
        (selectedId) => selectedId !== instanceId,
      ),
    };
  }
  if (decision.max === 1 && draft.selectedInstanceIds.length === 1) {
    return {
      ...draft,
      selectedInstanceIds: [instanceId],
    };
  }
  if (draft.selectedInstanceIds.length >= decision.max) {
    return draft;
  }
  return {
    ...draft,
    selectedInstanceIds: [...draft.selectedInstanceIds, instanceId],
  };
};

export const moveOrderedCardNear = (
  decision: PublicOrderCardsDecision,
  draft: DecisionDraft,
  draggedId: InstanceId,
  targetId: InstanceId,
  placement: "before" | "after",
): DecisionDraft => {
  assertDraftForDecision(decision, draft);
  if (draft.kind !== "orderCards") {
    throw new Error("Decision draft is not an orderCards draft.");
  }
  const legalIds = orderCardIds(decision);
  if (
    !legalIds.has(instanceKey(draggedId)) ||
    !legalIds.has(instanceKey(targetId))
  ) {
    return draft;
  }
  const withoutDragged = draft.orderedInstanceIds.filter(
    (candidateId) => candidateId !== draggedId,
  );
  const targetIndex = withoutDragged.findIndex(
    (candidateId) => candidateId === targetId,
  );
  if (targetIndex === -1) {
    return draft;
  }
  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  return {
    ...draft,
    orderedInstanceIds: [
      ...withoutDragged.slice(0, insertIndex),
      draggedId,
      ...withoutDragged.slice(insertIndex),
    ],
  };
};

export const setOrderedCardsPlacementDestination = (
  decision: PublicOrderCardsDecision,
  draft: DecisionDraft,
  destination: "top" | "bottom",
): DecisionDraft => {
  assertDraftForDecision(decision, draft);
  if (draft.kind !== "orderCards") {
    throw new Error("Decision draft is not an orderCards draft.");
  }
  if (decision.placement?.type !== "topOrBottom") {
    return draft;
  }
  return { ...draft, placementDestination: destination };
};

export const chooseDecisionTrigger = (
  decision: PublicChooseTriggerOrderDecision,
  draft: DecisionDraft,
  triggerId: string,
): DecisionDraft => {
  assertDraftForDecision(decision, draft);
  if (draft.kind !== "orderTriggers") {
    throw new Error("Decision draft is not an orderTriggers draft.");
  }
  if (!triggerChoiceIds(decision).has(triggerId)) {
    return draft;
  }
  if (draft.orderedTriggerIds.includes(triggerId)) {
    return {
      ...draft,
      orderedTriggerIds: [],
    };
  }
  return {
    ...draft,
    orderedTriggerIds: [triggerId],
  };
};

export const setDecisionQuantity = (
  draft: DecisionDraft,
  quantity: number,
): DecisionDraft => {
  if (draft.kind !== "chooseQuantity") {
    throw new Error("Decision draft is not a chooseQuantity draft.");
  }
  return { ...draft, quantity };
};

export const createDecisionModalModel = (
  decision: PublicPendingDecision,
  draft: DecisionDraft = createDecisionDraft(decision),
  responseActions: readonly ClientActionModel[] = [],
): DecisionModalModel => {
  if (decision.type === "selectCards") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "selectCards") {
      throw new Error("Decision draft is not a selectCards draft.");
    }
    const canConfirm = isSelectConfirmable(decision, draft);
    return {
      ...modalPresentation(decision),
      title: chooseCardsTitle(decision.max),
      kind: "selectCards",
      decisionId: decision.id,
      min: decision.min,
      max: decision.max,
      canConfirm,
      selectedInstanceIds: draft.selectedInstanceIds,
      cards: decision.choices.map((choice) => ({
        ...choice,
        selectable:
          choice.selectable &&
          isSelectableSelectCardChoice(decision, draft, choice.card.instanceId),
      })),
      confirmLabel:
        decision.min === 0 && draft.selectedInstanceIds.length === 0
          ? "Take none"
          : "Confirm",
    };
  }
  if (decision.type === "selectTargets") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "selectCards") {
      throw new Error("Decision draft is not a selectCards draft.");
    }
    const canConfirm = isSelectConfirmable(decision, draft);
    return {
      ...modalPresentation(decision),
      kind: "selectCards",
      decisionId: decision.id,
      min: decision.min,
      max: decision.max,
      canConfirm,
      selectedInstanceIds: draft.selectedInstanceIds,
      cards: decision.candidates.map((candidate) => ({
        card: candidate.card,
        selectable: true,
      })),
      confirmLabel:
        decision.min === 0 && draft.selectedInstanceIds.length === 0
          ? "Choose no target"
          : "Confirm",
    };
  }
  if (decision.type === "orderCards") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "orderCards") {
      throw new Error("Decision draft is not an orderCards draft.");
    }
    return {
      ...modalPresentation(decision),
      kind: "orderCards",
      decisionId: decision.id,
      destination: decision.destination,
      ...(decision.placement === undefined
        ? {}
        : { placement: decision.placement }),
      canConfirm: true,
      orderedInstanceIds: draft.orderedInstanceIds,
      placementDestination: draft.placementDestination,
      cards: decision.cards,
    };
  }
  if (decision.type === "chooseTriggerOrder") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "orderTriggers") {
      throw new Error("Decision draft is not an orderTriggers draft.");
    }
    const orderedIndexes = new Map(
      draft.orderedTriggerIds.map((triggerId, index) => [triggerId, index]),
    );
    return {
      ...modalPresentation(decision),
      kind: "orderTriggers",
      decisionId: decision.id,
      canConfirm: draft.orderedTriggerIds.length === 1,
      orderedTriggerIds: draft.orderedTriggerIds,
      choices: decision.choices.map((choice) => {
        const triggerId = choice.triggerId;
        const orderIndex = orderedIndexes.get(triggerId);
        return {
          triggerId,
          ...(choice.source === undefined ? {} : { source: choice.source }),
          selected: orderIndex !== undefined,
          ...(orderIndex === undefined ? {} : { orderIndex }),
        };
      }),
      confirmLabel: "Confirm",
    };
  }
  if (decision.type === "chooseQuantity") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "chooseQuantity") {
      throw new Error("Decision draft is not a chooseQuantity draft.");
    }
    if (decision.min === 0 && decision.max === 1) {
      const selectedQuantity = draft.quantity === 0 ? 0 : 1;
      return {
        ...modalPresentation(decision),
        kind: "binaryQuantity",
        decisionId: decision.id,
        selectedQuantity,
        options: [
          { quantity: 0, label: "No" },
          { quantity: 1, label: "Yes" },
        ],
        canConfirm: isQuantityConfirmable(decision, draft),
      };
    }
    return {
      ...modalPresentation(decision),
      kind: "chooseQuantity",
      decisionId: decision.id,
      min: decision.min,
      max: decision.max,
      quantity: draft.quantity,
      canConfirm: isQuantityConfirmable(decision, draft),
    };
  }
  const simpleOptions = simpleDecisionOptions(decision);
  if (simpleOptions !== undefined) {
    if (draft.decisionId !== decision.id || draft.kind !== "chooseOption") {
      throw new Error("Decision draft is not a chooseOption draft.");
    }
    return {
      ...modalPresentation(decision),
      kind: "chooseOption",
      decisionId: decision.id,
      options: simpleOptions.map((option) => ({
        value: option,
        label: optionLabel(decision.type, option),
      })),
      selectedOption: draft.option,
      canConfirm: true,
    };
  }
  if (decision.type === "chooseEffectOption") {
    const chooseOneOptions = chooseOneOptionModels(decision, responseActions);
    if (chooseOneOptions.options.length > 0) {
      if (draft.decisionId !== decision.id || draft.kind !== "actionOptions") {
        throw new Error("Decision draft is not an actionOptions draft.");
      }
      return {
        ...modalPresentation(decision),
        kind: "chooseOne",
        decisionId: decision.id,
        options: chooseOneOptions.options,
        ...(chooseOneOptions.declineActionIndex === undefined
          ? {}
          : {
              declineActionIndex: chooseOneOptions.declineActionIndex,
              declineLabel: chooseOneOptions.declineLabel,
            }),
        canConfirm: true,
      };
    }
  }
  const actionOptions = actionOptionModels(decision, responseActions, {
    includePresentationCards: decision.type !== "confirmLifeTrigger",
  });
  if (actionOptions.length > 0) {
    if (draft.decisionId !== decision.id || draft.kind !== "actionOptions") {
      throw new Error("Decision draft is not an actionOptions draft.");
    }
    return {
      ...modalPresentation(decision),
      kind: "actionOptions",
      decisionId: decision.id,
      ...(decision.type === "confirmLifeTrigger"
        ? { card: decision.card }
        : {}),
      options: actionOptions,
      selectedActionIndex: draft.actionIndex,
      canConfirm: true,
    };
  }
  return {
    ...modalPresentation(decision),
    kind: "generic",
    decisionId: decision.id,
    canConfirm: false,
    decisionType: decision.type,
  };
};

export const buildDecisionResponse = (
  decision: PublicPendingDecision,
  draft: DecisionDraft,
): DecisionResponse => {
  const model = createDecisionModalModel(decision, draft);
  if (decision.type === "selectCards") {
    if (!model.canConfirm) {
      throw new Error("Decision draft is not confirmable.");
    }
    if (draft.kind !== "selectCards") {
      throw new Error("Decision draft is not a selectCards draft.");
    }
    return {
      type: "cards",
      cards: decision.candidates
        .filter((candidate) =>
          draft.selectedInstanceIds.some(
            (selectedId) => selectedId === candidate.card.instanceId,
          ),
        )
        .map((candidate) => candidate.card),
    };
  }
  if (decision.type === "selectTargets") {
    if (!model.canConfirm) {
      throw new Error("Decision draft is not confirmable.");
    }
    if (draft.kind !== "selectCards") {
      throw new Error("Decision draft is not a selectCards draft.");
    }
    return {
      type: "targets",
      targets: decision.candidates
        .filter((candidate) =>
          draft.selectedInstanceIds.some(
            (selectedId) => selectedId === candidate.card.instanceId,
          ),
        )
        .map((candidate) => candidate.card),
    };
  }
  if (decision.type === "orderCards") {
    if (!model.canConfirm) {
      throw new Error("Decision draft is not confirmable.");
    }
    if (draft.kind !== "orderCards") {
      throw new Error("Decision draft is not an orderCards draft.");
    }
    if (decision.placement?.type === "topOrBottom") {
      const orderedIds = draft.orderedInstanceIds.map(String);
      return {
        type: "topBottomPlacement",
        topIds: draft.placementDestination === "top" ? orderedIds : [],
        bottomIds: draft.placementDestination === "bottom" ? orderedIds : [],
      };
    }
    return { type: "orderedIds", ids: draft.orderedInstanceIds.map(String) };
  }
  if (decision.type === "chooseTriggerOrder") {
    if (!model.canConfirm) {
      throw new Error("Decision draft is not confirmable.");
    }
    if (draft.kind !== "orderTriggers") {
      throw new Error("Decision draft is not an orderTriggers draft.");
    }
    return { type: "orderedIds", ids: draft.orderedTriggerIds };
  }
  if (decision.type === "chooseQuantity") {
    if (!model.canConfirm) {
      throw new Error("Decision draft is not confirmable.");
    }
    if (draft.kind !== "chooseQuantity") {
      throw new Error("Decision draft is not a chooseQuantity draft.");
    }
    return { type: "chooseQuantity", quantity: draft.quantity };
  }
  if (decision.type === "mulligan") {
    if (draft.kind !== "chooseOption") {
      throw new Error("Decision draft is not a chooseOption draft.");
    }
    return { type: "mulligan", keep: draft.option === "keep" };
  }
  throw new Error("Unsupported decision modal response.");
};
