import type {
  CardFilter,
  CardRef,
  ContinuousEffectRecord,
  Duration,
  Effect,
  EffectQueueEntry,
  GameState,
  Target,
  TargetSpec,
} from "@optcg/types";

import { reifyCardRef } from "./action-state.js";

const supportedRestriction = new Set(["cannotAttack", "cannotBlock"]);
const supportedFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "cost",
  "power",
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
    return false;
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
  if (!isSupportedTarget(effect.target)) return false;
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
    if (chosenTargets === undefined || chosenTargets.length === 0) return null;
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
  return [createRecord(state, entry, effect, effect.target, 0)];
};
