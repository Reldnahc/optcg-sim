import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Duration,
  DynamicNumberValue,
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
  isSupportedContinuousQueueEffect,
  isSupportedCostModifierEffect,
  isSupportedDuration,
  isSupportedTarget,
} from "./support.js";
import type { ContinuousQueueEffect } from "./types.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import {
  isDonPhasePlacementEffect,
  isSupportedDonPhasePlacementEffect,
  toDonPhasePlacementModifier,
} from "./don-phase-placement-modifier.js";
import { isSupportedPermanentBasePowerEffect } from "./permanent-base-power.js";
import { isSupportedPermanentInvalidateEffects } from "./effect-invalidation-modifier.js";
import {
  resolveBasePowerValue,
  resolveDynamicNumberValue,
  resolvePowerValue,
  type ContinuousResolutionContext,
} from "./value-resolution.js";
import { durationForDerivedEffect } from "./derived-duration.js";
import { sourceSnapshotForContinuousCard } from "./source-snapshot.js";
import {
  costModifierTargetForEffect,
  effectToDerivedModifier,
  unsupportedDerivedMessage,
} from "./derived-modifier.js";
import { cardMatchesAllTargetSpec } from "./target-matching.js";

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
  if (effect.type === "setPowerToZero") {
    return {
      layer: "powerSet",
      target,
      operation: { type: "setPower", value: 0 },
    };
  }
  if (effect.type === "allowAttackActiveCharacters") {
    return {
      layer: "attackPermission",
      target,
      operation: {
        type: "attackPermission",
        permission: "attackActiveCharacters",
      },
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
  if (effect.type === "preventLifeToHand") {
    return {
      layer: "restriction",
      target,
      operation: {
        type: "restriction",
        restriction: "cannotAddLifeToHandByOwnEffects",
      },
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
  if (effect.type === "enterRested") {
    return {
      layer: "playEntryState",
      target,
      operation: { type: "enterRested", filter: effect.filter },
    };
  }
  if (effect.type === "preventPlayByEffects") {
    return {
      layer: "restriction",
      target,
      operation: {
        type: "restriction",
        restriction: "cannotPlayByEffects",
      },
    };
  }
  if (effect.type === "redirectDonPhasePlacement") {
    return toDonPhasePlacementModifier(effect);
  }
  if (effect.type === "grantReplacement") {
    return {
      layer: "replacement",
      target,
      operation: {
        type: "replacement",
        replacement: effect.replacement,
      },
    };
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
  if (effect.type === "invalidateEffectEntryPoint") {
    return {
      layer: "effectInvalidation",
      target,
      operation: {
        type: "invalidateEffectEntryPoint",
        effectEntryPoint: effect.effectEntryPoint,
      },
    };
  }
  return {
    layer: "restriction",
    target,
    operation: { type: "restriction", restriction: effect.type },
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

const fieldCardRefs = (state: GameState): CardRef[] =>
  Object.values(state.players).flatMap((player) => [
    {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId: player.leader.controller,
      zone: player.leader.zone,
    },
    ...player.characters.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: card.controller,
      zone: card.zone,
    })),
    ...(player.stage === undefined
      ? []
      : [
          {
            instanceId: player.stage.instanceId,
            cardId: player.stage.cardId,
            playerId: player.stage.controller,
            zone: player.stage.zone,
          },
        ]),
    ...player.costArea.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: card.controller,
      zone: card.zone,
    })),
  ]);

const dynamicValueUsesAffectedCard = (
  value: number | DynamicNumberValue,
): boolean =>
  typeof value !== "number" &&
  value.type === "countAttachedDon" &&
  value.target.type === "affectedCard";

const effectValueUsesAffectedCard = (effect: ContinuousQueueEffect): boolean =>
  (effect.type === "modifyPower" || effect.type === "modifyCost") &&
  dynamicValueUsesAffectedCard(effect.value);

const createAffectedCardRecordsForAllTarget = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: ContinuousQueueEffect,
  target: Extract<TargetSpec, { type: "all" }>,
  context?: ContinuousResolutionContext,
): ContinuousEffectRecord[] | null => {
  const records: ContinuousEffectRecord[] = [];
  for (const cardRef of fieldCardRefs(state)) {
    const player = state.players[cardRef.playerId];
    const card =
      player?.leader.instanceId === cardRef.instanceId
        ? player.leader
        : (player?.characters.find(
            (candidate) => candidate.instanceId === cardRef.instanceId,
          ) ??
          (player?.stage?.instanceId === cardRef.instanceId
            ? player.stage
            : undefined) ??
          player?.costArea.find(
            (candidate) => candidate.instanceId === cardRef.instanceId,
          ));
    if (card === undefined) {
      return null;
    }
    if (!cardMatchesAllTargetSpec(state, card, entry.controllerId, target)) {
      continue;
    }
    if (!isPublicResolvableFieldObject(state, cardRef)) {
      return null;
    }
    const record = createRecord(
      state,
      entry,
      effect,
      toExactCardTarget(entry, cardRef, state, records.length),
      records.length,
      { ...context, affectedCard: cardRef },
    );
    if (record === null) {
      return null;
    }
    records.push(record);
  }
  return records;
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
  if (
    effect.type === "preventLifeToHand" ||
    effect.type === "preventDonActivation"
  ) {
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
  if (effect.type === "enterRested") {
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
  if (effect.type === "preventPlayByEffects") {
    const record = createRecord(
      state,
      entry,
      effect,
      effect.target,
      0,
      context,
    );
    return record === null ? null : [record];
  }
  if (effect.type === "invalidateEffectEntryPoint") {
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
  if (effect.type === "grantReplacement") {
    const record = createRecord(
      state,
      entry,
      effect,
      { type: "player", player: "self" },
      0,
      context,
    );
    return record === null ? null : [record];
  }
  const target = effect.target;
  if (target === undefined) {
    return null;
  }
  if (
    target.type === "choose" ||
    target.type === "chooseFromZones" ||
    target.type === "replacementTarget"
  ) {
    if (chosenTargets === undefined) return null;
    if (chosenTargets.length === 0) {
      return target.type !== "replacementTarget" && target.request.min === 0
        ? []
        : null;
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
  if (target.type === "attacker") {
    const attacker = state.battle?.attacker;
    if (attacker === undefined) {
      return null;
    }
    const attackerCard = reifyCardRef(state, attacker);
    if (attackerCard === null) {
      return null;
    }
    const attackerRef: CardRef = {
      instanceId: attackerCard.card.instanceId,
      cardId: attackerCard.card.cardId,
      playerId: attackerCard.playerId,
      zone: attackerCard.card.zone,
    };
    const record = createRecord(
      state,
      entry,
      effect,
      toExactCardTarget(entry, attackerRef, state, 0),
      0,
      context,
    );
    return record === null ? null : [record];
  }
  if (target.type === "all" && effectValueUsesAffectedCard(effect)) {
    return createAffectedCardRecordsForAllTarget(
      state,
      entry,
      effect,
      target,
      context,
    );
  }
  const record = createRecord(state, entry, effect, target, 0, context);
  return record === null ? null : [record];
};

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
        value.target.type === "affectedCard" ||
        value.target.type === "myLeader" ||
        value.target.type === "opponentLeader" ||
        value.target.type === "savedFieldObject")
    );
  }
  if (value.type === "savedNumber") {
    return false;
  }
  if (value.type === "countMatchingZoneCardsAcrossPlayers") {
    return (
      value.filter === undefined &&
      value.players.length > 0 &&
      value.players.every(
        (player) => player === "self" || player === "opponent",
      ) &&
      Number.isSafeInteger(value.per) &&
      value.per > 0 &&
      Number.isSafeInteger(value.multiplier) &&
      value.multiplier !== 0
    );
  }
  if (value.type !== "countMatchingZoneCards") {
    return false;
  }
  return (
    value.player === "self" &&
    Number.isSafeInteger(value.per) &&
    value.per > 0 &&
    Number.isSafeInteger(value.multiplier) &&
    value.multiplier !== 0
  );
};

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
    return isSupportedPermanentBasePowerEffect(effect);
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

export const deriveImplementedDslHandContinuousEffects = (
  state: GameState,
): ContinuousEffectRecord[] => {
  const handCards = Object.values(state.players).flatMap(
    (player) => player.hand,
  );
  return deriveImplementedDslContinuousEffectsForCards(state, handCards, {
    mode: "hand",
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

const isHandSelfPlayRestrictionPart = (part: SequencedEffect): boolean =>
  part.effect.type === "preventPlayByEffects" &&
  part.effect.target.type === "self";

const isSupportedHandDerivedPermanentPart = (part: SequencedEffect): boolean =>
  isHandSelfPlayCostModifierPart(part) || isHandSelfPlayRestrictionPart(part);

const hasHandDerivedPermanentPart = (effect: Effect): boolean =>
  effectPartsForPermanentBlock(effect).some(
    isSupportedHandDerivedPermanentPart,
  );

const deriveImplementedDslContinuousEffectsForCards = (
  state: GameState,
  cards: readonly CardInstance[],
  options: { mode: "field" | "hand" },
): ContinuousEffectRecord[] => {
  const derived: ContinuousEffectRecord[] = [];

  for (const card of cards) {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) continue;
    if (resolved.support.status !== "implemented-dsl") continue;
    const effectDefinitionId = resolved.support.effectDefinitionId;
    if (effectDefinitionId === undefined) {
      if (options.mode === "hand") {
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
      if (options.mode === "hand") {
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
      if (options.mode === "hand") {
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
      if (options.mode === "hand") {
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
        options.mode === "hand" &&
        !hasHandDerivedPermanentPart(block.effect)
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
          options.mode === "hand" &&
          !isSupportedHandDerivedPermanentPart(part)
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
          if (options.mode === "hand") {
            continue;
          }
          throw new TypeError(
            unsupportedDerivedMessage("unsupported permanent shape"),
          );
        }
        if (
          options.mode === "hand" &&
          modifier.layer !== "costAdd" &&
          !(
            modifier.layer === "restriction" &&
            modifier.operation.type === "restriction" &&
            modifier.operation.restriction === "cannotPlayByEffects"
          )
        ) {
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
