import type {
  ChooseQuantityDecision,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";
import { chooseQuantityPromptForEffect } from "../effect-runtime-quantity-prompts.js";

type SequenceDecisionResult = {
  events: EngineEvent[];
  ok: true;
  state: GameState;
};

const createSequenceChooseQuantityDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  index: number,
  effect: Effect,
  bounds: { min: number; max: number },
): SequenceDecisionResult => {
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
    prompt: chooseQuantityPromptForEffect(effect),
    causedBy,
    visibility,
    mode: "upTo",
    min: bounds.min,
    max: bounds.max,
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
  effect: Effect,
  max: number,
): SequenceDecisionResult =>
  createSequenceChooseQuantityDecision(state, entry, index, effect, {
    min: 0,
    max,
  });

export const createChooseNumberDecisionForSequenceSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  index: number,
  effect: Extract<Effect, { type: "chooseNumber" }>,
): SequenceDecisionResult =>
  createSequenceChooseQuantityDecision(state, entry, index, effect, {
    min: effect.min,
    max: effect.max,
  });
