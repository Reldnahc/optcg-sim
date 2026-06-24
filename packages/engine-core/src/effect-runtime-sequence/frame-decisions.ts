import type {
  ChooseEffectOptionDecision,
  ChooseOptionalActivationDecision,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  OptionalCost,
  OptionalPayCostDecision,
  PayCostDecision,
  PlayerId,
  ActiveEffectTextPresentation,
} from "@optcg/types";

import {
  appendEvent,
  appendPendingSpotlightEntryCreatedEvents,
  toDecisionId,
  toStateSeq,
} from "../action-results.js";
import { resolvePlayerId } from "../runtime/primitives/execute.js";
import { costDecisionPlayerId } from "./cost-decision-player.js";
import {
  activeSpanIdsForChoice,
  activeSpanIdsForCost,
} from "../runtime/effect-presentation.js";

const decisionCauseForEntry = (entry: EffectQueueEntry) =>
  ({
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  }) as const;

const activeEffectTextForEntry = (
  entry: EffectQueueEntry,
  activeSpanIds:
    | ActiveEffectTextPresentation["activeSpanIds"]
    | undefined = entry.presentation?.activeSpanIds,
): ActiveEffectTextPresentation | undefined =>
  entry.presentation === undefined ||
  activeSpanIds === undefined ||
  activeSpanIds.length === 0
    ? undefined
    : {
        ...entry.presentation,
        activeSpanIds,
      };

export {
  getSequenceOptionalPayCostOptions,
  getSequencePayCostLegalActions,
} from "./frame-decisions/pay-cost-options.js";

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
  effectPath?: string[];
  index: number;
  resumePendingDecision?: NonNullable<GameState["pendingDecision"]>;
  segmentResults: EffectExecutionFrame["segmentResults"];
  savedReferences: EffectExecutionFrame["savedReferences"];
  state: GameState;
}): EffectExecutionFrame => {
  const frame: EffectExecutionFrame = {
    queueEntryId: params.entry.id,
    effectBlockId: params.entry.effectBlockId,
    effectPath: params.effectPath ?? ["effect", "sequence"],
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
  };
  return params.resumePendingDecision === undefined
    ? frame
    : { ...frame, resumePendingDecision: params.resumePendingDecision };
};

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
  const anchored = appendPendingSpotlightEntryCreatedEvents({
    state,
    events,
    pendingDecision,
    decisionCreatedEvent: created,
    recipientPlayerId: pendingDecision.playerId,
    activeEffectText: activeEffectTextForEntry(entry),
    visibility,
  });
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision: anchored.pendingDecision,
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
  const playerId = costDecisionPlayerId(state, entry, cost);
  const visibility = { type: "private", playerId } as const;
  const pendingDecision: OptionalPayCostDecision = {
    id: toDecisionId(
      `decision:payCost:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "payCost",
    playerId,
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
  const anchored = appendPendingSpotlightEntryCreatedEvents({
    state,
    events,
    pendingDecision,
    decisionCreatedEvent: created,
    recipientPlayerId: pendingDecision.playerId,
    activeEffectText: activeEffectTextForEntry(
      entry,
      activeSpanIdsForCost(entry.presentation?.activeSpanIds ?? []),
    ),
    visibility,
  });
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision: anchored.pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createReturnDonDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  count: number,
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const visibility = { type: "private", playerId } as const;
  const pendingDecision: PayCostDecision = {
    id: toDecisionId(
      `decision:returnDon:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "payCost",
    playerId,
    prompt: "Choose DON!! cards to return.",
    causedBy,
    visibility,
    cost: { type: "returnDon", count },
    paymentOptions: [{ id: "returnDon", type: "returnDon", count }],
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
  const anchored = appendPendingSpotlightEntryCreatedEvents({
    state,
    events,
    pendingDecision,
    decisionCreatedEvent: created,
    recipientPlayerId: pendingDecision.playerId,
    activeEffectText: activeEffectTextForEntry(
      entry,
      activeSpanIdsForCost(entry.presentation?.activeSpanIds ?? []),
    ),
    visibility,
  });
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision: anchored.pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const createChooseEffectOptionDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "choice" }>,
  index: number,
): { events: EngineEvent[]; ok: true; state: GameState } => {
  const causedBy = decisionCauseForEntry(entry);
  const playerId = resolvePlayerId(state, entry, effect.chooser);
  const decisionPlayerId = playerId ?? entry.controllerId;
  const visibility = { type: "private", playerId: decisionPlayerId } as const;
  const pendingDecision: ChooseEffectOptionDecision = {
    id: toDecisionId(
      `decision:chooseEffectOption:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "chooseEffectOption",
    playerId: decisionPlayerId,
    prompt: "Choose one effect.",
    causedBy,
    visibility,
    min: effect.min,
    max: effect.max,
    options: effect.options,
    ...(effect.min === 0
      ? { defaultResponse: { type: "effectOptionDeclined" as const } }
      : {}),
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
  const anchored = appendPendingSpotlightEntryCreatedEvents({
    state,
    events,
    pendingDecision,
    decisionCreatedEvent: created,
    recipientPlayerId: pendingDecision.playerId,
    activeEffectText: activeEffectTextForEntry(
      entry,
      activeSpanIdsForChoice(entry.presentation?.activeSpanIds ?? []),
    ),
    visibility,
  });
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision: anchored.pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};
