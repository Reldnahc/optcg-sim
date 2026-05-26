import type {
  DecisionId,
  DecisionResponse,
  InstanceId,
  PublicChooseQuantityDecision,
  PublicOrderCardsDecision,
  PublicPendingDecision,
  PublicSelectCardsDecision,
} from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";

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

export type DecisionModalModel =
  | {
      kind: "selectCards";
      decisionId: DecisionId;
      prompt: string;
      min: number;
      max: number;
      canConfirm: boolean;
      selectedInstanceIds: InstanceId[];
      cards: PublicSelectCardsDecision["choices"];
      confirmLabel: string;
    }
  | {
      kind: "orderCards";
      decisionId: DecisionId;
      prompt: string;
      destination: PublicOrderCardsDecision["destination"];
      canConfirm: true;
      orderedInstanceIds: InstanceId[];
      cards: PublicOrderCardsDecision["cards"];
    }
  | {
      kind: "chooseQuantity";
      decisionId: DecisionId;
      prompt: string;
      min: number;
      max: number;
      quantity: number;
      canConfirm: boolean;
    }
  | {
      kind: "chooseOption";
      decisionId: DecisionId;
      prompt: string;
      options: Array<{ value: string; label: string }>;
      selectedOption: string;
      canConfirm: true;
    }
  | {
      kind: "actionOptions";
      decisionId: DecisionId;
      prompt: string;
      options: Array<{ actionIndex: number; label: string }>;
      selectedActionIndex: number;
      canConfirm: true;
    }
  | {
      kind: "generic";
      decisionId: DecisionId;
      prompt: string;
      canConfirm: false;
      decisionType: string;
    };

type CardDecision =
  | PublicSelectCardsDecision
  | PublicOrderCardsDecision
  | PublicChooseQuantityDecision;

const suppressedDecisionIdPrefixes = ["decision:counterStep:pass:"] as const;

export const isDecisionModalSuppressed = (
  decision: PublicPendingDecision,
): boolean =>
  suppressedDecisionIdPrefixes.some((prefix) =>
    String(decision.id).startsWith(prefix),
  );

const instanceKey = (instanceId: InstanceId): string => String(instanceId);

const assertDraftForDecision = (
  decision: CardDecision,
  draft: DecisionDraft,
): void => {
  if (draft.decisionId !== decision.id || draft.kind !== decision.type) {
    throw new Error("Decision draft does not match the active decision.");
  }
};

const selectCandidateIds = (
  decision: PublicSelectCardsDecision,
): ReadonlySet<string> =>
  new Set(
    decision.candidates.map((candidate) =>
      instanceKey(candidate.card.instanceId),
    ),
  );

const orderCardIds = (
  decision: PublicOrderCardsDecision,
): ReadonlySet<string> =>
  new Set(decision.cards.map((card) => instanceKey(card.instanceId)));

const isSelectConfirmable = (
  decision: PublicSelectCardsDecision,
  draft: Extract<DecisionDraft, { kind: "selectCards" }>,
): boolean =>
  draft.selectedInstanceIds.length >= decision.min &&
  draft.selectedInstanceIds.length <= decision.max;

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

const actionOptionModels = (
  actions: readonly ClientActionModel[],
): Array<{ actionIndex: number; label: string }> =>
  actions
    .filter((action) => action.type === "respondToDecision")
    .map((action) => ({ actionIndex: action.index, label: action.label }));

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
  if (decision.type === "orderCards") {
    return {
      kind: "orderCards",
      decisionId: decision.id,
      orderedInstanceIds: decision.cards.map((card) => card.instanceId),
    };
  }
  if (decision.type === "chooseQuantity") {
    return {
      kind: "chooseQuantity",
      decisionId: decision.id,
      quantity: decision.min,
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
  const actionOptions = actionOptionModels(responseActions);
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
  decision: PublicSelectCardsDecision,
  draft: DecisionDraft,
  instanceId: InstanceId,
): DecisionDraft => {
  assertDraftForDecision(decision, draft);
  if (draft.kind !== "selectCards") {
    throw new Error("Decision draft is not a selectCards draft.");
  }
  if (!selectCandidateIds(decision).has(instanceKey(instanceId))) {
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
      kind: "selectCards",
      decisionId: decision.id,
      prompt: decision.prompt,
      min: decision.min,
      max: decision.max,
      canConfirm,
      selectedInstanceIds: draft.selectedInstanceIds,
      cards: decision.choices,
      confirmLabel:
        decision.min === 0 && draft.selectedInstanceIds.length === 0
          ? "Take none"
          : "Confirm",
    };
  }
  if (decision.type === "orderCards") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "orderCards") {
      throw new Error("Decision draft is not an orderCards draft.");
    }
    return {
      kind: "orderCards",
      decisionId: decision.id,
      prompt: decision.prompt,
      destination: decision.destination,
      canConfirm: true,
      orderedInstanceIds: draft.orderedInstanceIds,
      cards: decision.cards,
    };
  }
  if (decision.type === "chooseQuantity") {
    assertDraftForDecision(decision, draft);
    if (draft.kind !== "chooseQuantity") {
      throw new Error("Decision draft is not a chooseQuantity draft.");
    }
    return {
      kind: "chooseQuantity",
      decisionId: decision.id,
      prompt: decision.prompt,
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
      kind: "chooseOption",
      decisionId: decision.id,
      prompt: decision.prompt,
      options: simpleOptions.map((option) => ({
        value: option,
        label: optionLabel(decision.type, option),
      })),
      selectedOption: draft.option,
      canConfirm: true,
    };
  }
  const actionOptions = actionOptionModels(responseActions);
  if (actionOptions.length > 0) {
    if (draft.decisionId !== decision.id || draft.kind !== "actionOptions") {
      throw new Error("Decision draft is not an actionOptions draft.");
    }
    return {
      kind: "actionOptions",
      decisionId: decision.id,
      prompt: decision.prompt,
      options: actionOptions,
      selectedActionIndex: draft.actionIndex,
      canConfirm: true,
    };
  }
  return {
    kind: "generic",
    decisionId: decision.id,
    prompt: decision.prompt,
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
  if (decision.type === "orderCards") {
    if (!model.canConfirm) {
      throw new Error("Decision draft is not confirmable.");
    }
    if (draft.kind !== "orderCards") {
      throw new Error("Decision draft is not an orderCards draft.");
    }
    return { type: "orderedIds", ids: draft.orderedInstanceIds.map(String) };
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
