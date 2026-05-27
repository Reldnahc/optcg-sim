import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

const isEffectInvalidationModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  effect.modifier.layer === "effectInvalidation" &&
  effect.modifier.operation.type === "invalidateEffects";

const isSupportedInvalidationDuration = (
  duration: ContinuousEffectRecord["duration"],
): boolean =>
  duration.type === "thisTurn" ||
  duration.type === "untilEndOfTurn" ||
  duration.type === "untilEndOfNextTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "whileSourceOnField";

export const isSupportedEffectInvalidationModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isEffectInvalidationModifier(effect) &&
  isSupportedInvalidationDuration(effect.duration) &&
  (effect.modifier.target.type === "exactCard" ||
    effect.modifier.target.type === "self" ||
    effect.modifier.target.type === "all");

const toConditionQueueEntry = (
  effect: ContinuousEffectRecord,
): EffectQueueEntry => ({
  id: `effect-invalidation-condition:${effect.id}` as EffectQueueEntry["id"],
  state: "resolving",
  timingWindowId:
    `effect-invalidation-condition:${effect.id}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: effect.controller,
  source: effect.source,
  sourceSnapshot: effect.sourceSnapshot,
  effectBlockId:
    `effect-invalidation-condition:${effect.id}` as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: effect.createdAtStateSeq,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: effect.createdBy,
});

const conditionPasses = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  const result = evaluateQueuedEffectCondition(
    state,
    toConditionQueueEntry(effect),
    effect.condition,
  );
  return result.supported && result.passed;
};

const isLiveSource = (state: GameState, source: CardRef): boolean => {
  const player = state.players[source.playerId];
  if (player === undefined) return false;
  if (
    player.leader.instanceId === source.instanceId &&
    player.leader.cardId === source.cardId
  ) {
    return true;
  }
  if (
    player.stage?.instanceId === source.instanceId &&
    player.stage.cardId === source.cardId
  ) {
    return true;
  }
  return player.characters.some(
    (card) =>
      card.instanceId === source.instanceId && card.cardId === source.cardId,
  );
};

const durationActive = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  if (effect.duration.type === "whileSourceOnField") {
    return isLiveSource(state, effect.source);
  }
  return true;
};

const cardMatchesRef = (card: CardInstance, ref: CardRef): boolean =>
  card.instanceId === ref.instanceId &&
  card.cardId === ref.cardId &&
  card.controller === ref.playerId;

const cardMatchesInvalidationTarget = (
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  const target = effect.modifier.target;
  if (target.type === "self") {
    return cardMatchesRef(card, effect.source);
  }
  if (target.type === "exactCard") {
    return (
      target.binding.family === "selectedTargets" &&
      target.card.zone?.zone === card.zone.zone &&
      cardMatchesRef(card, target.card)
    );
  }
  if (target.type !== "all") {
    return false;
  }
  if (target.zone !== card.zone.zone) {
    return false;
  }
  if (target.player === "self") {
    return card.controller === effect.controller;
  }
  if (target.player === "opponent") {
    return card.controller !== effect.controller;
  }
  return false;
};

export const isCardEffectInvalidated = (
  state: GameState,
  card: CardInstance,
): boolean =>
  state.continuousEffects.some(
    (effect) =>
      isSupportedEffectInvalidationModifier(effect) &&
      durationActive(state, effect) &&
      conditionPasses(state, effect) &&
      cardMatchesInvalidationTarget(card, effect),
  );
