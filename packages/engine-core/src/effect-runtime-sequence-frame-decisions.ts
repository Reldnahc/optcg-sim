import type {
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
import { getReturnDonEligibleInstanceIds } from "./effect-runtime-return-don.js";

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
  cost: Extract<
    OptionalCost,
    { type: "restDon" | "returnDon" | "trashFromHand" }
  >,
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
    paymentOptions: [{ id: cost.type, type: cost.type, count: cost.count }],
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
    !hasSequenceFrameForDecision(state, decision.id) ||
    (decision.cost.type !== "restDon" &&
      decision.cost.type !== "returnDon" &&
      decision.cost.type !== "trashFromHand")
  ) {
    return [];
  }
  if (decision.cost.type === "trashFromHand") {
    const selectableCardIds = player.hand.map((card) => card.instanceId);
    return [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "paymentDeclined" },
      },
      ...chooseCombos(selectableCardIds, decision.cost.count).map((combo) => ({
        type: "respondToDecision" as const,
        decisionId: decision.id,
        response: {
          type: "payment" as const,
          optionId: decision.cost.type,
          selectedCardInstanceIds: combo,
        },
      })),
    ];
  }
  const candidateDonIds = player.costArea
    .filter((card) =>
      decision.cost.type === "restDon" ? card.state === "active" : false,
    )
    .map((card) => card.instanceId);
  const returnDonIds =
    decision.cost.type === "returnDon"
      ? getReturnDonEligibleInstanceIds(player)
      : [];
  const selectableDonIds =
    decision.cost.type === "returnDon" ? returnDonIds : candidateDonIds;
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "paymentDeclined" },
    },
    ...chooseCombos(selectableDonIds, decision.cost.count).map((combo) => ({
      type: "respondToDecision" as const,
      decisionId: decision.id,
      response: {
        type: "payment" as const,
        optionId: decision.cost.type,
        selectedDonInstanceIds: combo,
      },
    })),
  ];
};
