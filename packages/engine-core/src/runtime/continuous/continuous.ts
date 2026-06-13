import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Duration,
  EffectDefinition,
  Effect,
  EffectQueueEntry,
  GameState,
  PlayerId,
  SequencedEffect,
  TargetSpec,
} from "@optcg/types";

import { reifyCardRef } from "../../actions/state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../../effect-runtime-conditions.js";
import {
  isSupportedBasePowerDuration,
  isSupportedBasePowerSetFilter,
  isSupportedContinuousQueueEffect,
  isSupportedCostModifierEffect,
  isSupportedDerivedKeyword,
  isSupportedDuration,
  isSupportedTarget,
} from "./support.js";
import type { ContinuousQueueEffect } from "./types.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import {
  isSupportedFieldRemovalProtection,
  isSupportedRestProtection,
  malformedFieldRemovalProtectionMessage,
} from "../../replacement/field-removal-protection-shape.js";
import {
  isDonPhasePlacementEffect,
  isSupportedDonPhasePlacementEffect,
  toDonPhasePlacementModifier,
  toSupportedDonPhasePlacementModifier,
} from "./don-phase-placement-modifier.js";
import {
  isSupportedPermanentInvalidateEffects,
  toInvalidateEffectsModifier,
} from "./effect-invalidation-modifier.js";
import {
  resolveBasePowerValue,
  resolveDynamicNumberValue,
  resolvePowerValue,
  type ContinuousResolutionContext,
} from "./value-resolution.js";
import { durationForDerivedEffect } from "./derived-duration.js";
import { sourceSnapshotForContinuousCard } from "./source-snapshot.js";

export { isSupportedContinuousQueueEffect };

export const toExactCardTarget = (
  entry: EffectQueueEntry,
  card: CardRef,
  state: GameState,
  objectIndex: number,
): TargetSpec => ({
  type: "exactCard",
  card,
  binding: {
    family: "selectedTargets",
    saveResultAs: String(entry.effectBlockId),
    objectIndex,
  },
  createdAtStateSeq: state.seq,
});

const mapEffectToModifier = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: ContinuousQueueEffect,
  target: TargetSpec,
  context?: ContinuousResolutionContext,
): ContinuousEffectRecord["modifier"] | null => {
  if (effect.type === "modifyPower") {
    const value = resolvePowerValue(state, effect.value, context);
    if (value === null) {
      return null;
    }
    return {
      layer: "powerAdd",
      target,
      operation: { type: "addPower", value },
    };
  }
  if (effect.type === "giveKeyword") {
    return {
      layer: "keywordAdd",
      target,
      operation: { type: "addKeyword", keyword: effect.keyword },
    };
  }
  if (effect.type === "giveAttribute") {
    return {
      layer: "attributeAdd",
      target,
      operation: { type: "addAttribute", attribute: effect.attribute },
    };
  }
  if (effect.type === "modifyCost") {
    const value = resolveDynamicNumberValue(state, effect.value, context);
    if (value === null) {
      return null;
    }
    return {
      layer: "costAdd",
      target,
      operation: { type: "addCost", value },
    };
  }
  if (effect.type === "setBasePower") {
    const value = resolveBasePowerValue(state, entry, effect.value, context);
    if (value === null) {
      return null;
    }
    return {
      layer: "basePowerSet",
      target,
      operation: { type: "setBasePower", value },
    };
  }
  if (effect.type === "preventDraw") {
    return {
      layer: "restriction",
      target,
      operation: { type: "restriction", restriction: "cannotDrawByOwnEffects" },
    };
  }
  if (effect.type === "preventDonActivation") {
    return {
      layer: "restriction",
      target,
      operation: {
        type: "restriction",
        restriction: "cannotActivateDon",
        sourceCategories: effect.sourceCategories,
      },
    };
  }
  if (effect.type === "preventPlay") {
    return {
      layer: "restriction",
      target,
      operation: { type: "restriction", restriction: "cannotPlay" },
    };
  }
  if (effect.type === "redirectDonPhasePlacement") {
    return toDonPhasePlacementModifier(effect);
  }
  if (effect.type === "attackCost") {
    return {
      layer: "restriction",
      target,
      operation: { type: "attackCost", cost: effect.cost },
    };
  }
  if (effect.type === "invalidateEffects") {
    return {
      layer: "effectInvalidation",
      target,
      operation: { type: "invalidateEffects" },
    };
  }
  return {
    layer: "restriction",
    target,
    operation: { type: "restriction", restriction: effect.type },
  };
};

const costModifierTargetForEffect = (
  effect: Extract<Effect, { type: "modifyCost" }>,
): TargetSpec => {
  if (effect.target !== undefined) {
    return effect.target;
  }
  return {
    type: "allMatching",
    zone: effect.sourceZone ?? "hand",
    player: effect.player,
    ...(effect.filter === undefined ? {} : { filter: effect.filter }),
  };
};

export const createRecord = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: ContinuousQueueEffect,
  target: TargetSpec,
  index: number | string,
  context?: ContinuousResolutionContext,
): ContinuousEffectRecord | null => {
  const modifier = mapEffectToModifier(state, entry, effect, target, {
    ...context,
    controllerId: entry.controllerId,
    source: entry.source,
  });
  if (modifier === null) {
    return null;
  }
  return {
    id: `continuous:${String(entry.id)}:${String(index)}`,
    source: entry.source,
    sourceSnapshot: entry.sourceSnapshot,
    controller: entry.controllerId,
    modifier,
    duration: effect.duration,
    ...(effect.type === "modifyCost" && effect.usageLimit !== undefined
      ? { usageLimit: effect.usageLimit }
      : {}),
    createdBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    createdAtStateSeq: state.seq,
  };
};

const isPublicResolvableFieldObject = (
  state: GameState,
  card: CardRef,
): boolean => {
  const zone = card.zone?.zone;
  if (
    zone !== "leaderArea" &&
    zone !== "characterArea" &&
    zone !== "stageArea" &&
    zone !== "costArea"
  ) {
    return false;
  }
  const player = state.players[card.playerId];
  if (player === undefined) {
    return false;
  }
  if (zone === "leaderArea" || zone === "characterArea") {
    return reifyCardRef(state, card) !== null;
  }
  const candidate =
    zone === "stageArea"
      ? player.stage
      : player.costArea.find(
          (costCard) => costCard.instanceId === card.instanceId,
        );
  return (
    candidate !== undefined &&
    candidate.instanceId === card.instanceId &&
    candidate.cardId === card.cardId
  );
};

export const createContinuousRecordsForResolvedEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: ContinuousQueueEffect,
  chosenTargets?: readonly CardRef[],
  context?: ContinuousResolutionContext,
): ContinuousEffectRecord[] | null => {
  if (effect.type === "preventDraw") {
    const record = createRecord(
      state,
      entry,
      effect,
      { type: "player", player: effect.player },
      0,
      context,
    );
    return record === null ? null : [record];
  }
  if (effect.type === "preventDonActivation") {
    const record = createRecord(
      state,
      entry,
      effect,
      { type: "player", player: effect.player },
      0,
      context,
    );
    return record === null ? null : [record];
  }
  if (effect.type === "preventPlay") {
    const record = createRecord(
      state,
      entry,
      effect,
      {
        type: "allMatching",
        zone: "hand",
        player: effect.player,
        filter: effect.filter,
      },
      0,
      context,
    );
    return record === null ? null : [record];
  }
  if (effect.type === "modifyCost" && effect.target?.type !== "choose") {
    const record = createRecord(
      state,
      entry,
      effect,
      costModifierTargetForEffect(effect),
      0,
      context,
    );
    return record === null ? null : [record];
  }
  if (effect.type === "modifyCounter") {
    const record = createRecord(
      state,
      entry,
      effect,
      {
        type: "allMatching",
        zone: "hand",
        player: effect.player,
        ...(effect.filter === undefined ? {} : { filter: effect.filter }),
      },
      0,
      context,
    );
    return record === null ? null : [record];
  }
  const target = effect.target;
  if (target === undefined) {
    return null;
  }
  if (target.type === "choose" || target.type === "chooseFromZones") {
    if (chosenTargets === undefined) return null;
    if (chosenTargets.length === 0) {
      return target.request.min === 0 ? [] : null;
    }
    const records: ContinuousEffectRecord[] = [];
    for (const [index, chosen] of chosenTargets.entries()) {
      if (!isPublicResolvableFieldObject(state, chosen)) {
        return null;
      }
      const record = createRecord(
        state,
        entry,
        effect,
        toExactCardTarget(entry, chosen, state, index),
        index,
        context,
      );
      if (record === null) {
        return null;
      }
      records.push(record);
    }
    return records;
  }
  if (target.type === "myLeader") {
    const leader = state.players[entry.controllerId]?.leader;
    if (leader === undefined) {
      return null;
    }
    const record = createRecord(
      state,
      entry,
      effect,
      toExactCardTarget(
        entry,
        {
          instanceId: leader.instanceId,
          cardId: leader.cardId,
          playerId: entry.controllerId,
          zone: leader.zone,
        },
        state,
        0,
      ),
      0,
      context,
    );
    return record === null ? null : [record];
  }
  const record = createRecord(state, entry, effect, target, 0, context);
  return record === null ? null : [record];
};

const unsupportedDerivedMessage = (reason: string): string =>
  `Unsupported continuous effect materialization: ${reason}.`;

const hasReviewMetadata = (definition: EffectDefinition): boolean =>
  definition.metadata.reviewer !== undefined ||
  (definition.metadata.reviewedBy !== undefined &&
    definition.metadata.reviewedAt !== undefined);

const isPermanentBlock = (
  block: EffectDefinition["effects"][number],
): boolean =>
  block.category === "permanent" && block.trigger.type === "permanent";

const isSupportedPowerEffectValue = (
  value: Extract<Effect, { type: "modifyPower" }>["value"],
): boolean => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value);
  }
  if (value.type === "sumSelectedCardCosts") {
    return Number.isSafeInteger(value.multiplier) && value.multiplier > 0;
  }
  if (value.type === "countDistinctMatchingFieldNames") {
    return (
      value.player === "self" &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier > 0 &&
      value.filter.custom === "differentNames"
    );
  }
  if (value.type === "paidCostCardCount") {
    return (
      value.cost.length > 0 &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier > 0
    );
  }
  if (value.type === "countAttachedDon") {
    return (
      Number.isSafeInteger(value.per) &&
      value.per > 0 &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier !== 0 &&
      (value.target.type === "self" ||
        value.target.type === "myLeader" ||
        value.target.type === "opponentLeader" ||
        value.target.type === "savedFieldObject")
    );
  }
  return (
    value.player === "self" &&
    Number.isSafeInteger(value.per) &&
    value.per > 0 &&
    Number.isSafeInteger(value.multiplier) &&
    value.multiplier !== 0
  );
};

const isSupportedPermanentBasePowerTarget = (
  target: Extract<Effect, { type: "setBasePower" }>["target"],
): boolean =>
  target.type === "self" ||
  target.type === "myLeader" ||
  (target.type === "all" &&
    target.zone === "characterArea" &&
    target.player === "self" &&
    isSupportedBasePowerSetFilter(target.filter));

const isSupportedDerivedEffectShape = (effect: Effect): boolean => {
  if (effect.type === "modifyPower") {
    return (
      isSupportedPowerEffectValue(effect.value) &&
      (effect.target.type === "self" ||
        effect.target.type === "myLeader" ||
        (effect.target.type === "all" && isSupportedTarget(effect.target))) &&
      isSupportedDuration(effect.duration)
    );
  }
  if (effect.type === "setBasePower") {
    return (
      typeof effect.value === "number" &&
      Number.isSafeInteger(effect.value) &&
      effect.value > 0 &&
      isSupportedBasePowerDuration(effect.duration) &&
      isSupportedPermanentBasePowerTarget(effect.target)
    );
  }
  if (effect.type === "modifyCost") {
    return isSupportedCostModifierEffect(effect);
  }
  if (isDonPhasePlacementEffect(effect)) {
    return isSupportedDonPhasePlacementEffect(effect, {
      supportsDuration: isSupportedDuration(effect.duration),
    });
  }
  if (effect.type === "invalidateEffects") {
    return isSupportedPermanentInvalidateEffects(effect);
  }
  try {
    return (
      effectToDerivedModifier(
        {
          players: {},
          turn: { turnPlayerId: "p1" as PlayerId, playerTurnCounts: {} },
          phase: "main",
          seq: 0,
          actionSeq: 0,
          eventSeq: 0,
          cardManifest: { cards: {} },
          continuousEffects: [],
          effectQueue: [],
          effectExecutionFrames: [],
          events: [],
          match: { status: "active" },
        } as unknown as GameState,
        {
          instanceId: "support-probe" as CardRef["instanceId"],
          cardId: "support-probe" as CardRef["cardId"],
          playerId: "p1" as PlayerId,
        },
        effect,
      ) !== null
    );
  } catch {
    return false;
  }
};

export const isSupportedPermanentContinuousEffectBlock = (
  block: EffectDefinition["effects"][number],
): boolean => {
  if (!isPermanentBlock(block)) return false;
  if (!isSupportedQueuedEffectConditionShape(block.condition)) return false;
  const effects =
    block.effect.type === "sequence"
      ? block.effect.effects
      : [{ connector: "always" as const, effect: block.effect }];
  for (const part of effects) {
    if (
      part.connector !== "always" ||
      part.optional === true ||
      part.saveResultAs !== undefined ||
      part.effect.type === "payCost"
    ) {
      return false;
    }
    if (!isSupportedDerivedEffectShape(part.effect)) {
      return false;
    }
  }
  return true;
};

export const hasCombatSafeImplementedDslDefinition = (
  state: GameState,
  effectDefinitionId: string,
): boolean => {
  const definition = state.cardManifest.effectDefinitions?.[effectDefinitionId];
  if (definition === undefined || definition.effects.length === 0) return false;
  const permanentBlocks = definition.effects.filter(isPermanentBlock);
  return (
    permanentBlocks.length > 0 &&
    permanentBlocks.every((block) =>
      isSupportedPermanentContinuousEffectBlock(block),
    )
  );
};

const createDerivedRecord = (
  state: GameState,
  source: CardRef,
  sourceSnapshot: EffectQueueEntry["sourceSnapshot"],
  condition: EffectDefinition["effects"][number]["condition"],
  duration: Duration,
  blockId: EffectDefinition["effects"][number]["id"],
  modifier: ContinuousEffectRecord["modifier"],
  sequenceIndex: number,
): ContinuousEffectRecord => ({
  id: `continuous:implemented-dsl:${String(source.instanceId)}:${String(blockId)}:${String(sequenceIndex)}`,
  source,
  sourceSnapshot,
  controller: source.playerId,
  modifier,
  ...(condition !== undefined ? { condition } : {}),
  duration,
  createdBy: {
    type: "ruleProcess",
    name: "implemented-dsl-permanent-continuous-materialization",
  },
  createdAtStateSeq: state.seq,
});

const effectToDerivedModifier = (
  state: GameState,
  source: CardRef,
  effect: Effect,
): ContinuousEffectRecord["modifier"] | null => {
  if (effect.type === "modifyPower") {
    const value = resolvePowerValue(state, effect.value, {
      controllerId: source.playerId,
      source,
    });
    if (value === null) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported dynamic power value"),
      );
    }
    if (
      effect.target.type !== "self" &&
      effect.target.type !== "myLeader" &&
      !(effect.target.type === "all" && isSupportedTarget(effect.target))
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported power target"),
      );
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported power duration"),
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(unsupportedDerivedMessage("unsupported power value"));
    }
    return {
      layer: "powerAdd",
      target: effect.target,
      operation: { type: "addPower", value },
    };
  }
  if (effect.type === "giveKeyword") {
    if (effect.target.type !== "self" && effect.target.type !== "myLeader") {
      if (!(effect.target.type === "all" && isSupportedTarget(effect.target))) {
        throw new TypeError(
          unsupportedDerivedMessage("unsupported keyword target"),
        );
      }
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported keyword duration"),
      );
    }
    if (!isSupportedDerivedKeyword(effect.keyword)) {
      throw new TypeError(unsupportedDerivedMessage("unsupported keyword"));
    }
    return {
      layer: "keywordAdd",
      target: effect.target,
      operation: { type: "addKeyword", keyword: effect.keyword },
    };
  }
  if (effect.type === "giveAttribute") {
    if (effect.target.type !== "self" && effect.target.type !== "myLeader") {
      if (!(effect.target.type === "all" && isSupportedTarget(effect.target))) {
        throw new TypeError(
          unsupportedDerivedMessage("unsupported attribute target"),
        );
      }
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported attribute duration"),
      );
    }
    return {
      layer: "attributeAdd",
      target: effect.target,
      operation: { type: "addAttribute", attribute: effect.attribute },
    };
  }
  if (effect.type === "setBasePower") {
    if (!isSupportedPermanentBasePowerTarget(effect.target)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported base-power target"),
      );
    }
    if (!isSupportedBasePowerDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported base-power duration"),
      );
    }
    if (
      typeof effect.value !== "number" ||
      !Number.isSafeInteger(effect.value) ||
      effect.value <= 0
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported base-power value"),
      );
    }
    return {
      layer: "basePowerSet",
      target: effect.target,
      operation: { type: "setBasePower", value: effect.value },
    };
  }
  if (effect.type === "modifyCost") {
    if (!isSupportedCostModifierEffect(effect)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported cost modifier shape"),
      );
    }
    const value = resolveDynamicNumberValue(state, effect.value, {
      controllerId: source.playerId,
      source,
    });
    if (value === null) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported dynamic cost value"),
      );
    }
    return {
      layer: "costAdd",
      target: costModifierTargetForEffect(effect),
      operation: { type: "addCost", value },
    };
  }
  if (effect.type === "modifyCounter") {
    if (
      effect.player !== "self" ||
      effect.sourceZone !== "hand" ||
      !Number.isSafeInteger(effect.value) ||
      effect.value < 0
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported counter modifier shape"),
      );
    }
    return {
      layer: "counterSet",
      target: {
        type: "allMatching",
        zone: "hand",
        player: effect.player,
        ...(effect.filter === undefined ? {} : { filter: effect.filter }),
      },
      operation: { type: "setCounter", value: effect.value },
    };
  }
  if (isDonPhasePlacementEffect(effect)) {
    return toSupportedDonPhasePlacementModifier(effect, {
      supportsDuration: isSupportedDuration(effect.duration),
    });
  }
  if (effect.type === "invalidateEffects") {
    return toInvalidateEffectsModifier(effect);
  }
  if (effect.type === "protectFromKO") {
    if (
      !isSupportedTarget(effect.target) ||
      !isSupportedDuration(effect.duration)
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported ko protection shape"),
      );
    }
    return {
      layer: "protection",
      target: effect.target,
      operation: {
        type: "protection",
        protection: {
          process: "ko",
          ...(effect.sourceKind === undefined
            ? {}
            : { sourceKind: effect.sourceKind }),
          ...(effect.sourceControllerRelation === undefined
            ? {}
            : { sourceControllerRelation: effect.sourceControllerRelation }),
          ...(effect.sourceCardCategories === undefined
            ? {}
            : { sourceCardCategories: effect.sourceCardCategories }),
        },
      },
    };
  }
  if (
    effect.type === "cannotAttack" ||
    effect.type === "attackCost" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "cannotBecomeActive"
  ) {
    if (
      !isSupportedTarget(effect.target) ||
      !isSupportedDuration(effect.duration)
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported restriction shape"),
      );
    }
    return {
      layer: "restriction",
      target: effect.target,
      operation:
        effect.type === "attackCost"
          ? { type: "attackCost", cost: effect.cost }
          : { type: "restriction", restriction: effect.type },
    };
  }
  if (effect.type !== "giveProtection") {
    return null;
  }
  if (
    !isSupportedTarget(effect.target) ||
    !isSupportedDuration(effect.duration)
  ) {
    throw new TypeError(
      unsupportedDerivedMessage("unsupported protection shape"),
    );
  }
  if (effect.protection.process === "fieldRemoval") {
    if (!isSupportedFieldRemovalProtection(effect.protection)) {
      throw new TypeError(
        malformedFieldRemovalProtectionMessage({
          id: "implemented-dsl:malformed-protection",
        } as ContinuousEffectRecord),
      );
    }
    return {
      layer: "protection",
      target: effect.target,
      operation: { type: "protection", protection: effect.protection },
    };
  }
  if (!isSupportedRestProtection(effect.protection)) {
    throw new TypeError(
      unsupportedDerivedMessage("unsupported protection shape"),
    );
  }
  return {
    layer: "protection",
    target: effect.target,
    operation: { type: "protection", protection: effect.protection },
  };
};

export const deriveImplementedDslPermanentContinuousEffects = (
  state: GameState,
): ContinuousEffectRecord[] => {
  const liveCards = Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ]);
  return deriveImplementedDslContinuousEffectsForCards(state, liveCards, {
    mode: "field",
  });
};

export const deriveImplementedDslPlayCostContinuousEffects = (
  state: GameState,
): ContinuousEffectRecord[] => {
  const handCards = Object.values(state.players).flatMap(
    (player) => player.hand,
  );
  return deriveImplementedDslContinuousEffectsForCards(state, handCards, {
    mode: "playCostHand",
  });
};

const effectPartsForPermanentBlock = (
  effect: Effect,
): readonly SequencedEffect[] =>
  effect.type === "sequence"
    ? effect.effects
    : [{ connector: "always", effect }];

const isHandSelfPlayCostModifierPart = (part: SequencedEffect): boolean =>
  part.effect.type === "modifyCost" &&
  part.effect.sourceZone === "hand" &&
  part.effect.target?.type === "self";

const hasHandSelfPlayCostModifierPart = (effect: Effect): boolean =>
  effectPartsForPermanentBlock(effect).some(isHandSelfPlayCostModifierPart);

const deriveImplementedDslContinuousEffectsForCards = (
  state: GameState,
  cards: readonly CardInstance[],
  options: { mode: "field" | "playCostHand" },
): ContinuousEffectRecord[] => {
  const derived: ContinuousEffectRecord[] = [];

  for (const card of cards) {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) continue;
    if (resolved.support.status !== "implemented-dsl") continue;
    const effectDefinitionId = resolved.support.effectDefinitionId;
    if (effectDefinitionId === undefined) {
      if (options.mode === "playCostHand") {
        continue;
      }
      if (
        (resolved.effectText ?? "").trim().length > 0 ||
        (resolved.triggerText ?? "").trim().length > 0
      ) {
        throw new TypeError(
          unsupportedDerivedMessage("stale or missing support"),
        );
      }
      continue;
    }
    const definition =
      state.cardManifest.effectDefinitions?.[effectDefinitionId];
    if (definition === undefined) {
      if (options.mode === "playCostHand") {
        continue;
      }
      throw new TypeError(
        unsupportedDerivedMessage("missing effect definition"),
      );
    }
    const permanentBlocks = definition.effects.filter(isPermanentBlock);
    if (permanentBlocks.length === 0) continue;
    if (
      !resolved.support.tested ||
      resolved.support.cardDataVersion !== state.cardManifest.cardDataVersion
    ) {
      if (options.mode === "playCostHand") {
        continue;
      }
      throw new TypeError(
        unsupportedDerivedMessage("stale or missing support"),
      );
    }
    if (
      definition.cardId !== card.cardId ||
      definition.implementationStatus !== "implemented-dsl" ||
      !definition.metadata.tested ||
      definition.metadata.sourceTextHash !== resolved.support.sourceTextHash ||
      definition.metadata.rulesVersion !== resolved.support.rulesVersion ||
      definition.metadata.effectDefinitionsVersion !==
        state.cardManifest.effectDefinitionsVersion ||
      !hasReviewMetadata(definition)
    ) {
      if (options.mode === "playCostHand") {
        continue;
      }
      throw new TypeError(
        unsupportedDerivedMessage("stale or unreviewed definition"),
      );
    }

    const source: CardRef = {
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: card.controller,
      zone: card.zone,
    };
    if (options.mode === "field" && isCardEffectInvalidated(state, card)) {
      continue;
    }
    const sourceSnapshot = sourceSnapshotForContinuousCard(card, resolved);

    for (const block of permanentBlocks) {
      if (
        options.mode === "playCostHand" &&
        !hasHandSelfPlayCostModifierPart(block.effect)
      ) {
        continue;
      }
      const conditionResult = evaluateQueuedEffectCondition(
        state,
        {
          id: `continuous-derive:${String(card.instanceId)}` as EffectQueueEntry["id"],
          state: "resolving",
          timingWindowId:
            `continuous-derive:${String(card.instanceId)}` as EffectQueueEntry["timingWindowId"],
          generation: 0,
          controllerId: card.controller,
          source,
          sourceSnapshot,
          effectBlockId: block.id,
          orderingGroup: "turnPlayer",
          createdAtEventSeq: 0,
          queuedAtStateSeq: state.seq,
          sourcePresencePolicy: "mustRemainInSameZone",
          causedBy: { type: "ruleProcess", name: "continuous-derive" },
        },
        block.condition,
      );
      if (!conditionResult.supported) {
        throw new TypeError(unsupportedDerivedMessage("unsupported condition"));
      }
      const effects = effectPartsForPermanentBlock(block.effect);
      for (const [index, part] of effects.entries()) {
        if (options.mode === "field" && isHandSelfPlayCostModifierPart(part)) {
          continue;
        }
        if (
          options.mode === "playCostHand" &&
          !isHandSelfPlayCostModifierPart(part)
        ) {
          continue;
        }
        if (
          part.connector !== "always" ||
          part.optional === true ||
          part.saveResultAs !== undefined ||
          part.effect.type === "payCost"
        ) {
          throw new TypeError(
            unsupportedDerivedMessage("unsupported permanent shape"),
          );
        }
        const modifier = effectToDerivedModifier(state, source, part.effect);
        if (modifier === null) {
          if (options.mode === "playCostHand") {
            continue;
          }
          throw new TypeError(
            unsupportedDerivedMessage("unsupported permanent shape"),
          );
        }
        if (options.mode === "playCostHand" && modifier.layer !== "costAdd") {
          continue;
        }
        derived.push(
          createDerivedRecord(
            state,
            source,
            sourceSnapshot,
            block.condition,
            durationForDerivedEffect(part.effect),
            block.id,
            modifier,
            index,
          ),
        );
      }
    }
  }
  return derived;
};
