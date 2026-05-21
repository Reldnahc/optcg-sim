import type {
  CardFilter,
  CardInstance,
  ChooseQuantityDecision,
  ChooseOptionalActivationDecision,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  LegalAction,
  OptionalCost,
  OptionalPayCostDecision,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "./action-results.js";
import {
  getReturnDonEligibleCount,
  getReturnDonEligibleInstanceIds,
} from "./effect-runtime-return-don.js";
import { activeDonCount } from "./effect-runtime-sequence-segments.js";

const decisionCauseForEntry = (entry: EffectQueueEntry) =>
  ({
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  }) as const;

export const findSequenceFrameByDecisionId = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): EffectExecutionFrame | undefined =>
  state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decisionId,
  );

export const hasSequenceFrameForDecision = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): boolean => findSequenceFrameByDecisionId(state, decisionId) !== undefined;

export const frameForPausedSequenceDecision = (params: {
  decision: NonNullable<GameState["pendingDecision"]>;
  entry: EffectQueueEntry;
  index: number;
  segmentResults: EffectExecutionFrame["segmentResults"];
  savedReferences: EffectExecutionFrame["savedReferences"];
  state: GameState;
}): EffectExecutionFrame => ({
  queueEntryId: params.entry.id,
  effectBlockId: params.entry.effectBlockId,
  effectPath: ["effect", "sequence"],
  nextSegmentIndex: params.index + 1,
  segmentResults: params.segmentResults,
  savedReferences: params.savedReferences,
  transientSets: {},
  pendingDecision: {
    decisionId: params.decision.id,
    causedBy: params.decision.causedBy,
    createdAtStateSeq: params.state.seq,
    resumeAtSegmentIndex: params.index,
  },
});

export const stateWithPausedSequenceFrame = (
  state: GameState,
  entry: EffectQueueEntry,
  frame: EffectExecutionFrame,
): GameState => ({
  ...state,
  effectExecutionFrames: [
    ...state.effectExecutionFrames.filter(
      (candidate) => candidate.queueEntryId !== entry.id,
    ),
    frame,
  ],
});

export const createOptionalActivationDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: ChooseOptionalActivationDecision = {
    id: toDecisionId(
      `decision:chooseOptionalActivation:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "chooseOptionalActivation",
    playerId: entry.controllerId,
    prompt: "Choose whether to resolve this optional effect.",
    causedBy,
    visibility,
    effectId: entry.effectBlockId,
    source: entry.source,
    options: ["activate", "decline"],
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createPayCostDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  cost: OptionalCost,
  paymentOptions: OptionalPayCostDecision["paymentOptions"],
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: OptionalPayCostDecision = {
    id: toDecisionId(
      `decision:payCost:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "payCost",
    playerId: entry.controllerId,
    prompt: "Choose whether to pay this optional cost.",
    causedBy,
    visibility,
    defaultResponse: { type: "paymentDeclined" },
    cost,
    paymentOptions,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createChooseQuantityDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  index: number,
  max: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = { type: "private", playerId: entry.controllerId } as const;
  const pendingDecision: ChooseQuantityDecision = {
    id: toDecisionId(
      `decision:chooseQuantity:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "chooseQuantity",
    playerId: entry.controllerId,
    prompt: "Choose quantity.",
    causedBy,
    visibility,
    mode: "upTo",
    min: 0,
    max,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

const chooseCombos = <T>(values: readonly T[], count: number): T[][] => {
  if (count === 0) {
    return [[]];
  }
  if (count < 0 || values.length < count) {
    return [];
  }
  const results: T[][] = [];
  const visit = (start: number, current: T[]): void => {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (value === undefined) {
        continue;
      }
      current.push(value);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return results;
};

const supportsScopedFieldTrashFilter = (
  filter: CardFilter | undefined,
): filter is { categories: ["character"]; typesAny: [string, ...string[]] } =>
  filter !== undefined &&
  Array.isArray(filter.categories) &&
  filter.categories.length === 1 &&
  filter.categories[0] === "character" &&
  Array.isArray(filter.typesAny) &&
  filter.typesAny.length > 0 &&
  filter.typesAny.every((value) => typeof value === "string");

const fieldCardMatchesFilter = (
  state: GameState,
  cardId: CardInstance["cardId"],
  filter: { categories: ["character"]; typesAny: [string, ...string[]] },
): boolean => {
  const metadata = state.cardManifest.cards[cardId];
  if (metadata === undefined || metadata.category !== "character") {
    return false;
  }
  return filter.typesAny.some((cardType) => metadata.types.includes(cardType));
};

export const getSequencePayCostLegalActions = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  const player = state.players[playerId];
  if (
    decision === undefined ||
    decision.type !== "payCost" ||
    decision.playerId !== playerId ||
    player === undefined ||
    !hasSequenceFrameForDecision(state, decision.id)
  ) {
    return [];
  }

  const legalPayments: LegalAction[] = [];
  for (const option of decision.paymentOptions) {
    if (option.type === "trashFromHand") {
      const selectableCardIds = player.hand.map((card) => card.instanceId);
      legalPayments.push(
        ...chooseCombos(selectableCardIds, option.count).map((combo) => ({
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
            selectedCardInstanceIds: combo,
          },
        })),
      );
      continue;
    }
    if (option.type === "trashFromField") {
      if (!supportsScopedFieldTrashFilter(option.filter)) {
        continue;
      }
      const fieldFilter = option.filter;
      const selectableCardIds = player.characters
        .filter((card) =>
          fieldCardMatchesFilter(state, card.cardId, fieldFilter),
        )
        .map((card) => card.instanceId);
      legalPayments.push(
        ...chooseCombos(selectableCardIds, option.count).map((combo) => ({
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
            selectedCardInstanceIds: combo,
          },
        })),
      );
      continue;
    }
    if (option.type === "restDon" || option.type === "returnDon") {
      const selectableDonIds =
        option.type === "returnDon"
          ? getReturnDonEligibleInstanceIds(player)
          : player.costArea
              .filter((card) => card.state === "active")
              .map((card) => card.instanceId);
      legalPayments.push(
        ...chooseCombos(selectableDonIds, option.count).map((combo) => ({
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "payment" as const,
            optionId: option.id,
            selectedDonInstanceIds: combo,
          },
        })),
      );
    }
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "paymentDeclined" },
    },
    ...legalPayments,
  ];
};

export const getSequenceOptionalPayCostOptions = (
  state: GameState,
  entry: EffectQueueEntry,
  cost: OptionalCost,
): Array<
  Extract<
    OptionalPayCostDecision["paymentOptions"][number],
    { type: "restDon" | "returnDon" | "trashFromHand" | "trashFromField" }
  >
> => {
  const paymentOptions: Array<
    Extract<
      OptionalPayCostDecision["paymentOptions"][number],
      { type: "restDon" | "returnDon" | "trashFromHand" | "trashFromField" }
    >
  > = [];
  const currentPlayer = state.players[entry.controllerId];
  const returnDonEligibleCount =
    currentPlayer === undefined ? 0 : getReturnDonEligibleCount(currentPlayer);
  const handEligibleCount = currentPlayer?.hand.length ?? 0;

  if (cost.type === "restDon") {
    if (activeDonCount(state, entry.controllerId) >= cost.count) {
      paymentOptions.push({
        id: "restDon",
        type: "restDon",
        count: cost.count,
      });
    }
    return paymentOptions;
  }
  if (cost.type === "returnDon") {
    if (returnDonEligibleCount >= cost.count) {
      paymentOptions.push({
        id: "returnDon",
        type: "returnDon",
        count: cost.count,
      });
    }
    return paymentOptions;
  }
  if (cost.type === "trashFromHand") {
    if (handEligibleCount >= cost.count) {
      paymentOptions.push({
        id: "trashFromHand",
        type: "trashFromHand",
        count: cost.count,
      });
    }
    return paymentOptions;
  }
  if (cost.type !== "chooseOne") {
    return paymentOptions;
  }

  for (const option of cost.options) {
    if (option.type === "trashFromHand") {
      if (handEligibleCount < option.count) {
        continue;
      }
      paymentOptions.push({
        id: "trashFromHand",
        type: "trashFromHand",
        count: option.count,
      });
      continue;
    }
    if (!supportsScopedFieldTrashFilter(option.filter)) {
      continue;
    }
    const fieldFilter = option.filter;
    const fieldMatchCount =
      currentPlayer?.characters.filter((card) =>
        fieldCardMatchesFilter(state, card.cardId, fieldFilter),
      ).length ?? 0;
    if (fieldMatchCount < option.count) {
      continue;
    }
    paymentOptions.push({
      id: "trashFromField",
      type: "trashFromField",
      count: option.count,
      filter: fieldFilter,
    });
  }
  return paymentOptions;
};
