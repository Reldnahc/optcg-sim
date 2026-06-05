import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Duration,
  EffectDefinition,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
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

type ContinuousResolutionContext = {
  savedReferences?: EffectExecutionFrame["savedReferences"];
};
const resolvePowerValue = (
  state: GameState,
  value: Extract<Effect, { type: "modifyPower" }>["value"],
  context: ContinuousResolutionContext | undefined,
): number | null => {
  if (typeof value === "number") {
    return value;
  }
  const reference = context?.savedReferences?.[value.selection];
  if (reference?.kind !== "selectedCards") {
    return null;
  }
  let totalCost = 0;
  for (const card of reference.cards) {
    const cost = state.cardManifest.cards[card.cardId]?.cost;
    if (cost === undefined || !Number.isSafeInteger(cost)) {
      return null;
    }
    totalCost += cost;
  }
  return totalCost * value.multiplier;
};
export { isSupportedContinuousQueueEffect };

const toExactCardTarget = (
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
  if (effect.type === "modifyCost") {
    return {
      layer: "costAdd",
      target,
      operation: { type: "addCost", value: effect.value },
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
  if (effect.target?.type === "self") {
    return { type: "self" };
  }
  return {
    type: "allMatching",
    zone: effect.sourceZone ?? "hand",
    player: effect.player,
    ...(effect.filter === undefined ? {} : { filter: effect.filter }),
  };
};

const createRecord = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: ContinuousQueueEffect,
  target: TargetSpec,
  index: number,
  context?: ContinuousResolutionContext,
): ContinuousEffectRecord | null => {
  const modifier = mapEffectToModifier(state, effect, target, context);
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
  if (card.zone?.zone !== "leaderArea" && card.zone?.zone !== "characterArea") {
    return false;
  }
  return reifyCardRef(state, card) !== null;
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
    try {
      if (effectToDerivedModifier(part.effect) === null) {
        return false;
      }
    } catch {
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
  effect: Effect,
): ContinuousEffectRecord["modifier"] | null => {
  if (effect.type === "modifyPower") {
    if (typeof effect.value !== "number") {
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
    if (!Number.isSafeInteger(effect.value)) {
      throw new TypeError(unsupportedDerivedMessage("unsupported power value"));
    }
    return {
      layer: "powerAdd",
      target: effect.target,
      operation: { type: "addPower", value: effect.value },
    };
  }
  if (effect.type === "giveKeyword") {
    if (effect.target.type !== "self") {
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
  if (effect.type === "setBasePower") {
    if (
      effect.target.type !== "self" &&
      !(
        effect.target.type === "all" &&
        effect.target.zone === "characterArea" &&
        effect.target.player === "self" &&
        isSupportedBasePowerSetFilter(effect.target.filter)
      )
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported base-power target"),
      );
    }
    if (!isSupportedBasePowerDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported base-power duration"),
      );
    }
    if (!Number.isSafeInteger(effect.value) || effect.value <= 0) {
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
    return {
      layer: "costAdd",
      target: costModifierTargetForEffect(effect),
      operation: { type: "addCost", value: effect.value },
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
  if (effect.type === "protectFromKO") {
    if (
      effect.target.type !== "self" ||
      !isSupportedDuration(effect.duration)
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported ko protection shape"),
      );
    }
    return {
      layer: "protection",
      target: { type: "self" },
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
        },
      },
    };
  }
  if (
    effect.type === "cannotAttack" ||
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
      operation: { type: "restriction", restriction: effect.type },
    };
  }
  if (effect.type !== "giveProtection") {
    return null;
  }
  if (effect.target.type !== "self" || !isSupportedDuration(effect.duration)) {
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
      target: { type: "self" },
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
    target: { type: "self" },
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

const hasSelfPlayCostModifierPart = (effect: Effect): boolean =>
  effectPartsForPermanentBlock(effect).some(
    (part) =>
      part.effect.type === "modifyCost" && part.effect.target?.type === "self",
  );

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
    const sourceSnapshot: EffectQueueEntry["sourceSnapshot"] = {
      instanceId: card.instanceId,
      cardId: card.cardId,
      ownerId: card.owner,
      controllerId: card.controller,
      zone: card.zone,
      category:
        card.zone.zone === "leaderArea" || card.zone.zone === "stageArea"
          ? card.zone.zone === "leaderArea"
            ? "leader"
            : "stage"
          : resolved.category,
      colors: [],
      keywords: [],
    };

    for (const block of permanentBlocks) {
      if (
        options.mode === "playCostHand" &&
        !hasSelfPlayCostModifierPart(block.effect)
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
        if (
          options.mode === "playCostHand" &&
          (part.effect.type !== "modifyCost" ||
            part.effect.target?.type !== "self")
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
        const modifier = effectToDerivedModifier(part.effect);
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

const durationForDerivedEffect = (effect: Effect): Duration => {
  if (
    effect.type === "modifyPower" ||
    effect.type === "giveKeyword" ||
    effect.type === "setBasePower" ||
    effect.type === "modifyCost" ||
    effect.type === "protectFromKO" ||
    effect.type === "cannotAttack" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "cannotBecomeActive" ||
    effect.type === "giveProtection"
  ) {
    return effect.duration;
  }

  return { type: "whileSourceOnField" };
};
