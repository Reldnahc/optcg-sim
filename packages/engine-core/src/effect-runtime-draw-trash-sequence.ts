import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { executeNoChoiceEffectPrimitive } from "./effect-runtime-primitives.js";
import { createSupportedTrashFromHandChoiceDecision } from "./effect-runtime-trash-from-hand.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "./once-per-turn.js";

type DrawThenTrashSequenceEffect = Extract<Effect, { type: "sequence" }> & {
  effects: readonly [
    {
      connector: "always";
      effect: Extract<Effect, { type: "draw" }>;
      saveResultAs?: undefined;
    },
    {
      connector: "then";
      effect: Extract<Effect, { type: "trashFromHand" }>;
      saveResultAs?: undefined;
    },
  ];
};

type SupportedDrawThenTrashSequenceBlock =
  EffectDefinition["effects"][number] & {
    sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
    effect: DrawThenTrashSequenceEffect;
  };

export type DrawThenTrashSequenceDecisionResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | { ok: false }
  | undefined;

const isSupportedDrawThenTrashSequenceEffect = (
  effect: EffectDefinition["effects"][number],
): effect is SupportedDrawThenTrashSequenceBlock => {
  if (
    effect.category !== "auto" ||
    effect.optional === true ||
    effect.cost !== undefined ||
    effect.condition !== undefined ||
    effect.conditionTiming !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.effect.type !== "sequence" ||
    effect.effect.effects.length !== 2
  ) {
    return false;
  }

  const drawSegment = effect.effect.effects[0];
  const trashSegment = effect.effect.effects[1];
  if (
    drawSegment === undefined ||
    trashSegment === undefined ||
    drawSegment.connector !== "always" ||
    trashSegment.connector !== "then" ||
    drawSegment.saveResultAs !== undefined ||
    trashSegment.saveResultAs !== undefined ||
    drawSegment.effect.type !== "draw" ||
    trashSegment.effect.type !== "trashFromHand"
  ) {
    return false;
  }

  return (
    Number.isInteger(drawSegment.effect.count) &&
    drawSegment.effect.count >= 0 &&
    drawSegment.effect.player === "self" &&
    Number.isInteger(trashSegment.effect.count) &&
    trashSegment.effect.count > 0 &&
    trashSegment.effect.player === "self" &&
    trashSegment.effect.chooser === "self" &&
    trashSegment.effect.filter === undefined
  );
};

export const createSupportedDrawThenTrashSequenceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
): DrawThenTrashSequenceDecisionResult => {
  if (
    effectBlock === undefined ||
    effectBlock.sourcePresencePolicy !== entry.sourcePresencePolicy ||
    !isSupportedDrawThenTrashSequenceEffect(effectBlock)
  ) {
    return undefined;
  }

  const drawSegment = effectBlock.effect.effects[0];
  const trashSegment = effectBlock.effect.effects[1];
  let sequenceState = state;
  if (effectBlock.oncePerTurn === true) {
    const oncePerTurnKey = toOncePerTurnKey({
      cardInstanceId: entry.source.instanceId,
      effectId: entry.effectBlockId,
      turnNumber: sequenceState.turn.globalTurn,
    });
    if (isOncePerTurnUsed(sequenceState, oncePerTurnKey)) {
      return { ok: false };
    }
    sequenceState = consumeOncePerTurn(sequenceState, oncePerTurnKey);
  }

  const player = sequenceState.players[entry.controllerId];
  if (
    player === undefined ||
    player.hand.length +
      Math.min(drawSegment.effect.count, player.deck.length) <
      trashSegment.effect.count
  ) {
    return { ok: false };
  }

  const resolvingEntry: EffectQueueEntry = {
    ...entry,
    state: "resolving",
  };
  sequenceState = {
    ...sequenceState,
    effectQueue: sequenceState.effectQueue.map((candidate) =>
      candidate.id === entry.id ? resolvingEntry : candidate,
    ),
  };
  const drawResolution = executeNoChoiceEffectPrimitive(
    sequenceState,
    resolvingEntry,
    drawSegment.effect,
  );
  if (drawResolution.errors !== undefined) {
    return { ok: false };
  }

  const trashDecision = createSupportedTrashFromHandChoiceDecision(
    drawResolution.state,
    resolvingEntry,
    trashSegment.effect,
  );
  if (!trashDecision.ok) {
    return { ok: false };
  }

  return {
    events: [...drawResolution.events, ...trashDecision.events],
    ok: true,
    state: trashDecision.state,
  };
};
