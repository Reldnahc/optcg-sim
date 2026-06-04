import type {
  CardFilter,
  CardInstance,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
} from "@optcg/types";

import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../effect-runtime-conditions.js";
import { deriveImplementedDslPermanentContinuousEffects } from "../runtime/continuous/continuous.js";
import { isSupportedEffectInvalidationModifier } from "../effect-invalidation.js";
import {
  isFieldRemovalProtectionModifier,
  isSupportedProtectionModifier,
  malformedFieldRemovalProtectionMessage,
} from "../replacement/field-removal-protection.js";

const supportedContinuousKeywordGrants = new Set<Keyword>([
  "blocker",
  "banish",
  "rush",
  "rushCharacter",
  "doubleAttack",
  "unblockable",
]);

const supportedBasePowerSetFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "names",
  "typesAny",
]);

const isImplementedDslPermanentMaterialization = (
  effect: ContinuousEffectRecord,
): boolean =>
  effect.createdBy.type === "ruleProcess" &&
  effect.createdBy.name ===
    "implemented-dsl-permanent-continuous-materialization";

const isSupportedContinuousPowerModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  (effect.condition === undefined ||
    (isImplementedDslPermanentMaterialization(effect) &&
      isSupportedQueuedEffectConditionShape(effect.condition))) &&
  isSupportedDuration(effect.duration) &&
  ((effect.modifier.layer === "powerAdd" &&
    (effect.modifier.target.type === "self" ||
      (effect.modifier.target.type === "myLeader" &&
        isImplementedDslPermanentMaterialization(effect)) ||
      effect.modifier.target.type === "all" ||
      effect.modifier.target.type === "exactCard") &&
    effect.modifier.operation.type === "addPower" &&
    (effect.duration.type !== "permanent" ||
      effect.modifier.operation.value === 1000)) ||
    (effect.modifier.layer === "restriction" &&
      (effect.modifier.target.type === "self" ||
        effect.modifier.target.type === "all" ||
        effect.modifier.target.type === "exactCard") &&
      effect.modifier.operation.type === "restriction" &&
      (effect.modifier.operation.restriction === "cannotAttack" ||
        effect.modifier.operation.restriction === "cannotBlock" ||
        effect.modifier.operation.restriction === "preventBlockerActivation" ||
        effect.modifier.operation.restriction === "cannotBecomeActive")));

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => typeof entry === "string");

const isSupportedBasePowerSetFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return false;
  if (
    !Object.keys(filter).every((key) =>
      supportedBasePowerSetFilterKeys.has(key as keyof CardFilter),
    )
  ) {
    return false;
  }
  if (filter.categories !== undefined) {
    if (
      filter.categories.length === 0 ||
      !filter.categories.every((category) => category === "character")
    ) {
      return false;
    }
  }
  return (
    isNonEmptyStringArray(filter.typesAny) ||
    isNonEmptyStringArray(filter.names)
  );
};

const isSupportedContinuousBasePowerSetModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  (effect.duration.type === "permanent" ||
    effect.duration.type === "whileSourceOnField" ||
    (effect.duration.type === "whileConditionTrue" &&
      isSupportedQueuedEffectConditionShape(effect.duration.condition))) &&
  effect.modifier.layer === "basePowerSet" &&
  effect.modifier.operation.type === "setBasePower" &&
  Number.isSafeInteger(effect.modifier.operation.value) &&
  effect.modifier.operation.value > 0 &&
  (effect.modifier.target.type === "self" ||
    (effect.modifier.target.type === "all" &&
      effect.modifier.target.zone === "characterArea" &&
      effect.modifier.target.player === "self" &&
      isSupportedBasePowerSetFilter(effect.modifier.target.filter)));

const isSupportedContinuousCostModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isSupportedDuration(effect.duration) &&
  effect.modifier.layer === "costAdd" &&
  effect.modifier.operation.type === "addCost" &&
  Number.isSafeInteger(effect.modifier.operation.value) &&
  (effect.modifier.target.type === "self" ||
    effect.modifier.target.type === "exactCard" ||
    (effect.modifier.target.type === "allMatching" &&
      effect.modifier.target.zone === "hand" &&
      (effect.modifier.target.player === "self" ||
        effect.modifier.target.player === "opponent")));

export const isSupportedContinuousKeywordModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isSupportedDuration(effect.duration) &&
  effect.modifier.layer === "keywordAdd" &&
  (effect.modifier.target.type === "self" ||
    effect.modifier.target.type === "all" ||
    effect.modifier.target.type === "exactCard") &&
  effect.modifier.operation.type === "addKeyword" &&
  supportedContinuousKeywordGrants.has(effect.modifier.operation.keyword);

const isSupportedPlayerDrawRestriction = (
  effect: ContinuousEffectRecord,
): boolean =>
  isSupportedDuration(effect.duration) &&
  effect.modifier.layer === "restriction" &&
  effect.modifier.target.type === "player" &&
  effect.modifier.operation.type === "restriction" &&
  effect.modifier.operation.restriction === "cannotDrawByOwnEffects";

const isSupportedPlayerDonActivationRestriction = (
  effect: ContinuousEffectRecord,
): boolean =>
  isSupportedDuration(effect.duration) &&
  effect.modifier.layer === "restriction" &&
  effect.modifier.target.type === "player" &&
  effect.modifier.operation.type === "restriction" &&
  effect.modifier.operation.restriction === "cannotActivateDon" &&
  (effect.modifier.operation.sourceCategories === undefined ||
    effect.modifier.operation.sourceCategories.length > 0);

const isSupportedPlayRestriction = (effect: ContinuousEffectRecord): boolean =>
  isSupportedDuration(effect.duration) &&
  effect.modifier.layer === "restriction" &&
  effect.modifier.target.type === "allMatching" &&
  effect.modifier.target.zone === "hand" &&
  (effect.modifier.target.player === "self" ||
    effect.modifier.target.player === "opponent") &&
  effect.modifier.operation.type === "restriction" &&
  effect.modifier.operation.restriction === "cannotPlay";

const isSupportedDuration = (
  duration: ContinuousEffectRecord["duration"],
): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "untilEndOfTurn" ||
  duration.type === "untilEndOfNextTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent" ||
  (duration.type === "whileConditionTrue" &&
    isSupportedQueuedEffectConditionShape(duration.condition));

const unsupportedContinuousEffectMessage = (
  effect: ContinuousEffectRecord,
): string =>
  `Unsupported continuous effect ${effect.id}: only unconditional self +1000 powerAdd modifiers with permanent or whileSourceOnField duration are supported by computeView.`;

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
  if (!result.supported) {
    throw new TypeError(unsupportedContinuousEffectMessage(effect));
  }
  return result.passed;
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
  if (effect.duration.type === "thisBattle") {
    return state.battle !== undefined;
  }
  if (effect.duration.type === "whileSourceOnField") {
    return isCardRefLive(state, effect.source);
  }
  if (effect.duration.type === "whileConditionTrue") {
    return continuousEffectConditionPasses(
      state,
      effect,
      effect.duration.condition,
    );
  }
  return true;
};

export const allContinuousEffects = (
  state: GameState,
): readonly ContinuousEffectRecord[] => [
  ...state.continuousEffects,
  ...deriveImplementedDslPermanentContinuousEffects(state),
];

export const assertSupportedContinuousEffects = (state: GameState): void => {
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (isSupportedContinuousBasePowerSetModifier(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (isSupportedContinuousPowerModifier(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (isSupportedProtectionModifier(effect)) continue;
    if (isFieldRemovalProtectionModifier(effect)) {
      throw new TypeError(malformedFieldRemovalProtectionMessage(effect));
    }
    if (isSupportedContinuousCostModifier(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (isSupportedPlayerDrawRestriction(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (isSupportedPlayerDonActivationRestriction(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (isSupportedPlayRestriction(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (isSupportedEffectInvalidationModifier(effect)) {
      if (!durationIsActive(state, effect)) continue;
      recordConditionPasses(state, effect);
      continue;
    }
    if (!isSupportedContinuousKeywordModifier(effect)) {
      throw new TypeError(unsupportedContinuousEffectMessage(effect));
    }
    if (!durationIsActive(state, effect)) continue;
    continuousEffectConditionPasses(state, effect);
  }
};
