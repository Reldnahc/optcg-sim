import type {
  CardInstance,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
} from "@optcg/types";

import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { deriveImplementedDslPermanentContinuousEffects } from "../runtime/continuous/continuous.js";

const supportedContinuousKeywordGrants = new Set<Keyword>([
  "blocker",
  "banish",
  "rush",
  "rushCharacter",
  "doubleAttack",
  "unblockable",
]);

export const isSupportedContinuousKeywordModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  effect.modifier.layer === "keywordAdd" &&
  (effect.modifier.target.type === "self" ||
    effect.modifier.target.type === "all" ||
    effect.modifier.target.type === "exactCard") &&
  effect.modifier.operation.type === "addKeyword" &&
  supportedContinuousKeywordGrants.has(effect.modifier.operation.keyword);

const toConditionQueueEntry = (
  effect: ContinuousEffectRecord,
): EffectQueueEntry => ({
  id: `continuous-condition:${effect.id}` as EffectQueueEntry["id"],
  state: "resolving",
  timingWindowId:
    `continuous-condition:${effect.id}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: effect.controller,
  source: effect.source,
  sourceSnapshot: effect.sourceSnapshot,
  effectBlockId:
    `continuous-condition:${effect.id}` as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: effect.createdAtStateSeq,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: effect.createdBy,
});

export const continuousEffectConditionPasses = (
  state: GameState,
  effect: ContinuousEffectRecord,
  checkedCondition = effect.condition,
): boolean => {
  const result = evaluateQueuedEffectCondition(
    state,
    toConditionQueueEntry(effect),
    checkedCondition,
  );
  return result.supported && result.passed;
};

export const recordConditionPasses = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => continuousEffectConditionPasses(state, effect, effect.condition);

export const isCardRefLive = (
  state: GameState,
  ref: {
    instanceId: InstanceId;
    cardId: CardInstance["cardId"];
    playerId: PlayerId;
  },
): boolean => {
  const player = state.players[ref.playerId];
  if (player === undefined) return false;
  if (
    player.leader.instanceId === ref.instanceId &&
    player.leader.cardId === ref.cardId
  ) {
    return true;
  }
  if (
    player.stage?.instanceId === ref.instanceId &&
    player.stage.cardId === ref.cardId
  ) {
    return true;
  }
  return player.characters.some(
    (character) =>
      character.instanceId === ref.instanceId &&
      character.cardId === ref.cardId,
  );
};

export const durationIsActive = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  switch (effect.duration.type) {
    case "permanent":
    case "thisTurn":
    case "untilEndOfTurn":
    case "untilEndOfNextTurn":
    case "untilStartOfNextTurn":
      return true;
    case "thisBattle":
      return state.battle !== undefined;
    case "whileSourceOnField":
      return isCardRefLive(state, effect.source);
    case "whileConditionTrue":
      return continuousEffectConditionPasses(
        state,
        effect,
        effect.duration.condition,
      );
    case "thisAction":
      return false;
  }
};

export const allContinuousEffects = (
  state: GameState,
): readonly ContinuousEffectRecord[] => [
  ...state.continuousEffects,
  ...deriveImplementedDslPermanentContinuousEffects(state),
];
