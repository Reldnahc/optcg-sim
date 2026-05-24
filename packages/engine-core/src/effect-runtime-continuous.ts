import type {
  CardFilter,
  CardRef,
  ContinuousEffectRecord,
  Duration,
  EffectDefinition,
  Effect,
  EffectQueueEntry,
  GameState,
  Keyword,
  Target,
  TargetSpec,
} from "@optcg/types";

import { reifyCardRef } from "./action-state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./effect-runtime-conditions.js";
import { isSupportedNoChoiceOnKODrawEffect } from "./effect-runtime-primitives.js";
import {
  isSupportedFieldRemovalProtection,
  malformedFieldRemovalProtectionMessage,
} from "./field-removal-protection-shape.js";

const supportedRestriction = new Set(["cannotAttack", "cannotBlock"]);
const supportedFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "cost",
  "power",
]);
const supportedBasePowerSetFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "typesAny",
]);

const isSupportedDuration = (duration: Duration): boolean => {
  if (
    duration.type === "thisBattle" ||
    duration.type === "thisTurn" ||
    duration.type === "whileSourceOnField" ||
    duration.type === "permanent"
  ) {
    return true;
  }
  if (duration.type === "untilEndOfTurn") {
    const whoseTurn = duration.whoseTurn ?? "current";
    return whoseTurn === "current" || whoseTurn === "sourceController";
  }
  if (duration.type !== "untilStartOfNextTurn") {
    return (
      duration.type === "whileConditionTrue" &&
      isSupportedQueuedEffectConditionShape(duration.condition)
    );
  }
  return (
    duration.player === "self" ||
    duration.player === "opponent" ||
    duration.player === "controller" ||
    duration.player === "owner"
  );
};

const hasSupportedNumericFilter = (
  filter: CardFilter["cost"] | CardFilter["power"],
): boolean => {
  if (filter === undefined) return true;
  if ("op" in filter) {
    return filter.op === "eq" && Number.isFinite(filter.value);
  }
  return (
    (filter.min === undefined || Number.isFinite(filter.min)) &&
    (filter.max === undefined || Number.isFinite(filter.max)) &&
    (filter.min === undefined ||
      filter.max === undefined ||
      filter.min <= filter.max)
  );
};

const isSupportedAllFilter = (filter: CardFilter | undefined): boolean =>
  filter === undefined ||
  (Object.keys(filter).every((key) =>
    supportedFilterKeys.has(key as keyof CardFilter),
  ) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.power));

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
  return isNonEmptyStringArray(filter.typesAny);
};

const isSupportedTarget = (target: Target): boolean => {
  if (target.type === "self") return true;
  if (target.type === "choose") return true;
  if (target.type !== "all") return false;
  return (
    isSupportedAllFilter(target.filter) &&
    (target.player === "self" || target.player === "opponent") &&
    (target.zone === "leaderArea" || target.zone === "characterArea")
  );
};

export const isSupportedContinuousQueueEffect = (
  effect: Effect,
): effect is
  | Extract<Effect, { type: "modifyPower" }>
  | Extract<Effect, { type: "cannotAttack" }>
  | Extract<Effect, { type: "cannotBlock" }> => {
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "cannotAttack" &&
    effect.type !== "cannotBlock"
  ) {
    return false;
  }
  if (!isSupportedDuration(effect.duration)) return false;
  if (
    effect.type === "modifyPower" &&
    effect.target.type !== "myLeader" &&
    !isSupportedTarget(effect.target)
  ) {
    return false;
  }
  if (effect.type !== "modifyPower" && !isSupportedTarget(effect.target)) {
    return false;
  }
  if (
    (effect.type === "cannotAttack" || effect.type === "cannotBlock") &&
    !supportedRestriction.has(effect.type)
  ) {
    return false;
  }
  return true;
};

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
  effect:
    | Extract<Effect, { type: "modifyPower" }>
    | Extract<Effect, { type: "cannotAttack" }>
    | Extract<Effect, { type: "cannotBlock" }>,
  target: TargetSpec,
): ContinuousEffectRecord["modifier"] => {
  if (effect.type === "modifyPower") {
    return {
      layer: "powerAdd",
      target,
      operation: { type: "addPower", value: effect.value },
    };
  }
  return {
    layer: "restriction",
    target,
    operation: { type: "restriction", restriction: effect.type },
  };
};

const createRecord = (
  state: GameState,
  entry: EffectQueueEntry,
  effect:
    | Extract<Effect, { type: "modifyPower" }>
    | Extract<Effect, { type: "cannotAttack" }>
    | Extract<Effect, { type: "cannotBlock" }>,
  target: TargetSpec,
  index: number,
): ContinuousEffectRecord => ({
  id: `continuous:${String(entry.id)}:${String(index)}`,
  source: entry.source,
  sourceSnapshot: entry.sourceSnapshot,
  controller: entry.controllerId,
  modifier: mapEffectToModifier(effect, target),
  duration: effect.duration,
  createdBy: {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  },
  createdAtStateSeq: state.seq,
});

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
  effect:
    | Extract<Effect, { type: "modifyPower" }>
    | Extract<Effect, { type: "cannotAttack" }>
    | Extract<Effect, { type: "cannotBlock" }>,
  chosenTargets?: readonly CardRef[],
): ContinuousEffectRecord[] | null => {
  if (effect.target.type === "choose") {
    if (chosenTargets === undefined) return null;
    if (chosenTargets.length === 0) {
      return effect.target.request.min === 0 ? [] : null;
    }
    const records: ContinuousEffectRecord[] = [];
    for (const [index, chosen] of chosenTargets.entries()) {
      if (!isPublicResolvableFieldObject(state, chosen)) {
        return null;
      }
      records.push(
        createRecord(
          state,
          entry,
          effect,
          toExactCardTarget(entry, chosen, state, index),
          index,
        ),
      );
    }
    return records;
  }
  if (effect.target.type === "myLeader") {
    const leader = state.players[entry.controllerId]?.leader;
    if (leader === undefined) {
      return null;
    }
    return [
      createRecord(
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
      ),
    ];
  }
  return [createRecord(state, entry, effect, effect.target, 0)];
};

const supportedDerivedKeywords = new Set<Keyword>([
  "blocker",
  "banish",
  "rush",
  "rushCharacter",
  "doubleAttack",
]);

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

const isSupportedPermanentContinuousShape = (
  block: EffectDefinition["effects"][number],
): boolean => {
  if (!isPermanentBlock(block)) return false;
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

const isSupportedNonPermanentCombatSafeBlock = (
  block: EffectDefinition["effects"][number],
): boolean =>
  isSupportedNoChoiceOnKODrawEffect(block, { allowOncePerTurn: true });

export const hasCombatSafeImplementedDslDefinition = (
  state: GameState,
  effectDefinitionId: string,
): boolean => {
  const definition = state.cardManifest.effectDefinitions?.[effectDefinitionId];
  if (definition === undefined || definition.effects.length === 0) return false;
  const hasPermanentBlock = definition.effects.some(isPermanentBlock);
  if (!hasPermanentBlock) return false;
  return definition.effects.every(
    (block) =>
      isSupportedPermanentContinuousShape(block) ||
      isSupportedNonPermanentCombatSafeBlock(block),
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
      throw new TypeError(
        unsupportedDerivedMessage("unsupported keyword target"),
      );
    }
    if (effect.duration.type !== "permanent") {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported keyword duration"),
      );
    }
    if (!supportedDerivedKeywords.has(effect.keyword)) {
      throw new TypeError(unsupportedDerivedMessage("unsupported keyword"));
    }
    return {
      layer: "keywordAdd",
      target: { type: "self" },
      operation: { type: "addKeyword", keyword: effect.keyword },
    };
  }
  if (effect.type === "setBasePower") {
    if (
      effect.target.type !== "all" ||
      effect.target.zone !== "characterArea" ||
      effect.target.player !== "self" ||
      !isSupportedBasePowerSetFilter(effect.target.filter)
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported base-power target"),
      );
    }
    if (effect.duration.type !== "permanent") {
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
  if (effect.type !== "giveProtection") {
    return null;
  }
  if (effect.target.type !== "self" || effect.duration.type !== "permanent") {
    throw new TypeError(
      unsupportedDerivedMessage("unsupported protection shape"),
    );
  }
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
};

export const deriveImplementedDslPermanentContinuousEffects = (
  state: GameState,
): ContinuousEffectRecord[] => {
  const derived: ContinuousEffectRecord[] = [];
  const liveCards = Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
  ]);

  for (const card of liveCards) {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) continue;
    if (resolved.support.status !== "implemented-dsl") continue;
    const effectDefinitionId = resolved.support.effectDefinitionId;
    if (effectDefinitionId === undefined) {
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
      throw new TypeError(
        unsupportedDerivedMessage("missing effect definition"),
      );
    }
    const permanentBlocks = definition.effects.filter(isPermanentBlock);
    if (permanentBlocks.length === 0) continue;
    const hasUnsupportedNonPermanentBlock = definition.effects.some(
      (block) =>
        !isPermanentBlock(block) &&
        !isSupportedNonPermanentCombatSafeBlock(block),
    );
    if (hasUnsupportedNonPermanentBlock) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported permanent shape"),
      );
    }
    if (
      !resolved.support.tested ||
      resolved.support.cardDataVersion !== state.cardManifest.cardDataVersion
    ) {
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
    const sourceSnapshot: EffectQueueEntry["sourceSnapshot"] = {
      instanceId: card.instanceId,
      cardId: card.cardId,
      ownerId: card.owner,
      controllerId: card.controller,
      zone: card.zone,
      category: card.zone.zone === "leaderArea" ? "leader" : "character",
      colors: [],
      keywords: [],
    };

    for (const block of permanentBlocks) {
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
      const effects =
        block.effect.type === "sequence"
          ? block.effect.effects
          : [{ connector: "always" as const, effect: block.effect }];
      for (const [index, part] of effects.entries()) {
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
          throw new TypeError(
            unsupportedDerivedMessage("unsupported permanent shape"),
          );
        }
        derived.push(
          createDerivedRecord(
            state,
            source,
            sourceSnapshot,
            block.condition,
            part.effect.type === "modifyPower"
              ? part.effect.duration
              : { type: "whileSourceOnField" },
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
