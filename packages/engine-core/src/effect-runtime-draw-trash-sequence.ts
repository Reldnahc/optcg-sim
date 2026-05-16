import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { createSupportedSequenceFrameDecision } from "./effect-runtime-sequence-frames.js";
import { createSupportedTrashFromHandChoiceDecision } from "./effect-runtime-trash-from-hand.js";

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

  return createSupportedSequenceFrameDecision(
    state,
    entry,
    effectBlock,
    createSupportedTrashFromHandChoiceDecision,
  );
};
