import type {
  CardFilter,
  CardInstance,
  ContinuousEffectRecord,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  deriveImplementedDslPermanentContinuousEffects,
  deriveImplementedDslPlayCostContinuousEffects,
} from "../effect-runtime-continuous.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { evaluateEffectBlockRuntimeSupport } from "../effect-runtime-admission.js";
import { resolveImplementedDslEffectDefinition } from "../effect-runtime.js";
import { hasUnsupportedSupportGateText } from "../battle-support.js";

export type SupportedPlayMetadata = {
  category: "character" | "stage" | "event";
  printedCost: number;
};

const numericFilterMatches = (
  value: number | undefined,
  filter: CardFilter["cost"] | CardFilter["power"],
): boolean => {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  if ("op" in filter) return value === filter.value;
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
};

const supportedHandCardFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "cost",
  "names",
  "typesAny",
]);

const cardMatchesHandFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  if (
    !Object.keys(filter).every((key) =>
      supportedHandCardFilterKeys.has(key as keyof CardFilter),
    )
  ) {
    return false;
  }
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) return false;
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(metadata.category)
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((type) => metadata.types.includes(type))
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !filter.names.some((name) => metadata.name === name)
  ) {
    return false;
  }
  return numericFilterMatches(metadata.cost, filter.cost);
};

const isCardRefLive = (
  state: GameState,
  ref: ContinuousEffectRecord["source"],
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

const costModifierDurationIsActive = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  if (effect.duration.type === "thisBattle") return state.battle !== undefined;
  if (effect.duration.type === "whileSourceOnField") {
    return isCardRefLive(state, effect.source);
  }
  if (effect.duration.type === "whileConditionTrue") {
    const result = evaluateQueuedEffectCondition(
      state,
      toConditionQueueEntry(effect),
      effect.duration.condition,
    );
    return result.supported && result.passed;
  }
  return true;
};

const toConditionQueueEntry = (
  effect: ContinuousEffectRecord,
): EffectQueueEntry => ({
  id: `play-cost-condition:${effect.id}` as EffectQueueEntry["id"],
  state: "resolving",
  timingWindowId:
    `play-cost-condition:${effect.id}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: effect.controller,
  source: effect.source,
  sourceSnapshot: effect.sourceSnapshot,
  effectBlockId:
    `play-cost-condition:${effect.id}` as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: effect.createdAtStateSeq,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: effect.createdBy,
});

const costModifierConditionPasses = (
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

const costModifierAppliesToCard = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  if (effect.modifier.layer !== "costAdd") return false;
  if (effect.modifier.operation.type !== "addCost") return false;
  if (!costModifierDurationIsActive(state, effect)) return false;
  if (!costModifierConditionPasses(state, effect)) return false;
  const target = effect.modifier.target;
  if (target.type === "self") {
    return (
      card.zone.zone === "hand" &&
      card.controller === playerId &&
      card.instanceId === effect.source.instanceId &&
      card.cardId === effect.source.cardId &&
      card.controller === effect.controller
    );
  }
  if (target.type !== "allMatching") return false;
  if (target.zone !== "hand") return false;
  if (card.zone.zone !== "hand") return false;
  if (target.player === "self" && card.controller !== effect.controller) {
    return false;
  }
  if (target.player === "opponent" && card.controller === effect.controller) {
    return false;
  }
  if (card.controller !== playerId) return false;
  return cardMatchesHandFilter(state, card, target.filter);
};

const playRestrictionAppliesToCard = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  if (effect.modifier.layer !== "restriction") return false;
  if (effect.modifier.operation.type !== "restriction") return false;
  if (effect.modifier.operation.restriction !== "cannotPlay") return false;
  if (!costModifierDurationIsActive(state, effect)) return false;
  if (!costModifierConditionPasses(state, effect)) return false;
  const target = effect.modifier.target;
  if (target.type !== "allMatching") return false;
  if (target.zone !== "hand") return false;
  if (card.zone.zone !== "hand") return false;
  if (target.player === "self" && card.controller !== effect.controller) {
    return false;
  }
  if (target.player === "opponent" && card.controller === effect.controller) {
    return false;
  }
  if (card.controller !== playerId) return false;
  return cardMatchesHandFilter(state, card, target.filter);
};

const hasOnlySupportedRelevantEffects = (
  effects: readonly EffectDefinition["effects"][number][],
  predicate: (effect: EffectDefinition["effects"][number]) => boolean,
  options: { requireAtLeastOne: boolean },
): boolean =>
  (!options.requireAtLeastOne || effects.length > 0) &&
  effects.every(predicate);

const isRuntimeAdmittedEffect = (
  effect: EffectDefinition["effects"][number],
): boolean => evaluateEffectBlockRuntimeSupport(effect).supported;

export const canResolveDestinationConflict = (
  player: GameState["players"][PlayerId],
  category: SupportedPlayMetadata["category"],
): boolean => {
  if (category === "character") {
    return player.characters.length <= 5;
  }
  if (category === "stage") {
    return player.stage === undefined || player.stage.attachedDon.length === 0;
  }
  return true;
};

export const getSupportedPlayMetadata = (
  state: GameState,
  card: CardInstance,
): SupportedPlayMetadata | null => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined) {
    return null;
  }
  if (resolved.support.status === "implemented-dsl") {
    if (resolved.cost === undefined) {
      return null;
    }
    const lookup = resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return null;
    }
    if (resolved.category === "character") {
      const onPlayEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "onPlay",
      );
      if (
        !hasOnlySupportedRelevantEffects(
          onPlayEffects,
          isRuntimeAdmittedEffect,
          { requireAtLeastOne: false },
        ) ||
        !lookup.definition.effects
          .filter((effect) => effect.trigger.type !== "onPlay")
          .every(isRuntimeAdmittedEffect)
      ) {
        return null;
      }
      return {
        category: "character",
        printedCost: Math.max(0, resolved.cost),
      };
    }
    if (resolved.category === "event") {
      const mainEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "main",
      );
      if (
        !hasOnlySupportedRelevantEffects(mainEffects, isRuntimeAdmittedEffect, {
          requireAtLeastOne: true,
        })
      ) {
        return null;
      }
      return {
        category: "event",
        printedCost: Math.max(0, resolved.cost),
      };
    }
    if (resolved.category === "stage") {
      if (!lookup.definition.effects.every(isRuntimeAdmittedEffect)) {
        return null;
      }
      return {
        category: "stage",
        printedCost: Math.max(0, resolved.cost),
      };
    }
    return null;
  }
  if (resolved.support.status !== "vanilla-confirmed") {
    return null;
  }
  if (resolved.category === "character" || resolved.category === "stage") {
    if (
      hasUnsupportedSupportGateText(resolved.effectText, resolved) ||
      hasUnsupportedSupportGateText(resolved.triggerText, resolved) ||
      resolved.cost === undefined
    ) {
      return null;
    }
    return {
      category: resolved.category,
      printedCost: Math.max(0, resolved.cost),
    };
  }
  if (resolved.category !== "event") {
    return null;
  }
  if (resolved.cost === undefined) {
    return null;
  }
  if ((resolved.effectText ?? "").trim() !== "[Main]") {
    return null;
  }
  if (hasUnsupportedSupportGateText(resolved.triggerText, resolved)) {
    return null;
  }
  return {
    category: "event",
    printedCost: Math.max(0, resolved.cost),
  };
};

export const getEffectivePlayCost = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  supported: SupportedPlayMetadata,
): number => {
  const costDelta = [
    ...state.continuousEffects,
    ...deriveImplementedDslPermanentContinuousEffects(state),
    ...deriveImplementedDslPlayCostContinuousEffects(state),
  ].reduce((total, effect) => {
    if (!costModifierAppliesToCard(state, playerId, card, effect)) {
      return total;
    }
    const operation = effect.modifier.operation;
    return operation.type === "addCost" ? total + operation.value : total;
  }, 0);
  return Math.max(0, supported.printedCost + costDelta);
};

export const isPlayBlockedByRestriction = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
): boolean =>
  [
    ...state.continuousEffects,
    ...deriveImplementedDslPermanentContinuousEffects(state),
    ...deriveImplementedDslPlayCostContinuousEffects(state),
  ].some((effect) =>
    playRestrictionAppliesToCard(state, playerId, card, effect),
  );

export const getPlayableHandCards = (
  state: GameState,
  playerId: PlayerId,
): CardInstance[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const activeDonCount = getActiveDonCount(player.costArea);
  return player.hand.filter((card) => {
    const supported = getSupportedPlayMetadata(state, card);
    if (supported === null) {
      return false;
    }
    if (
      activeDonCount < getEffectivePlayCost(state, playerId, card, supported)
    ) {
      return false;
    }
    if (isPlayBlockedByRestriction(state, playerId, card)) {
      return false;
    }
    return canResolveDestinationConflict(player, supported.category);
  });
};

export const getActiveDonCount = (costArea: readonly CardInstance[]): number =>
  costArea.filter((card) => card.state === "active").length;
