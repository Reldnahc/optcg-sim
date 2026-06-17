import type {
  DecisionId,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  appendEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { chooseQuantityPromptForEffect } from "../effect-runtime-quantity-prompts.js";
import { resolvePlayerId } from "../runtime/primitives/execute.js";

export const createChooseOptionalActivationDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  options: EngineResultOptions = {},
): EngineResult => {
  const decisionId =
    `decision:chooseOptionalActivation:${String(entry.id)}` as DecisionId;
  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: decisionId,
    type: "chooseOptionalActivation",
    playerId: entry.controllerId,
    prompt: "Choose whether to activate this effect.",
    causedBy,
    visibility: { type: "private", playerId: entry.controllerId },
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
    { type: "private", playerId: entry.controllerId },
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    pendingDecision,
    eventJournal: [...state.eventJournal, ...events],
  };
  return toEngineResult(nextState, events, undefined, options);
};

export const createChooseQuantityDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  bounds: { min: number; max: number },
  options: EngineResultOptions = {},
): EngineResult => {
  const playerId =
    effect.type === "moveCards" && effect.chooser !== undefined
      ? resolvePlayerId(state, entry, effect.chooser)
      : entry.controllerId;
  if (playerId === undefined) {
    return toEngineResult(state, [], undefined, options);
  }
  const decisionId =
    `decision:chooseQuantity:${String(entry.id)}` as DecisionId;
  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: decisionId,
    type: "chooseQuantity",
    playerId,
    prompt: chooseQuantityPromptForEffect(effect),
    causedBy,
    visibility: { type: "private", playerId },
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
    pendingDecision.visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return toEngineResult(
    {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
    undefined,
    options,
  );
};
