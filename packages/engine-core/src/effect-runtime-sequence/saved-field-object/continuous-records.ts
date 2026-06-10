import type {
  CardRef,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import type { SupportedSequenceSegment } from "../support.js";

const exactTargetForSavedObject = (
  entry: EffectQueueEntry,
  card: CardRef,
  state: GameState,
  objectIndex: number,
): ContinuousEffectRecord["modifier"]["target"] => ({
  type: "exactCard",
  card,
  binding: {
    family: "selectedTargets",
    saveResultAs: String(entry.effectBlockId),
    objectIndex,
  },
  createdAtStateSeq: state.seq,
});

export const continuousRecordForSavedObject = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment,
  target: CardRef,
  objectIndex: number,
): ContinuousEffectRecord | undefined => {
  if (
    segment.effect.type !== "modifyPower" &&
    segment.effect.type !== "giveKeyword" &&
    segment.effect.type !== "cannotBecomeActive" &&
    segment.effect.type !== "cannotAttack" &&
    segment.effect.type !== "attackCost" &&
    segment.effect.type !== "cannotBlock" &&
    segment.effect.type !== "preventBlockerActivation" &&
    segment.effect.type !== "invalidateEffects"
  ) {
    return undefined;
  }
  if (segment.effect.type === "invalidateEffects") {
    return {
      id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
      source: entry.source,
      sourceSnapshot: entry.sourceSnapshot,
      controller: entry.controllerId,
      modifier: {
        layer: "effectInvalidation",
        target: exactTargetForSavedObject(entry, target, state, objectIndex),
        operation: { type: "invalidateEffects" },
      },
      duration: segment.effect.duration,
      createdBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    };
  }
  if (segment.effect.type === "modifyPower") {
    if (typeof segment.effect.value !== "number") {
      return undefined;
    }
    return {
      id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
      source: entry.source,
      sourceSnapshot: entry.sourceSnapshot,
      controller: entry.controllerId,
      modifier: {
        layer: "powerAdd",
        target: exactTargetForSavedObject(entry, target, state, objectIndex),
        operation: { type: "addPower", value: segment.effect.value },
      },
      duration: segment.effect.duration,
      createdBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    };
  }
  if (segment.effect.type === "giveKeyword") {
    return {
      id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
      source: entry.source,
      sourceSnapshot: entry.sourceSnapshot,
      controller: entry.controllerId,
      modifier: {
        layer: "keywordAdd",
        target: exactTargetForSavedObject(entry, target, state, objectIndex),
        operation: { type: "addKeyword", keyword: segment.effect.keyword },
      },
      duration: segment.effect.duration,
      createdBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    };
  }
  return {
    id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
    source: entry.source,
    sourceSnapshot: entry.sourceSnapshot,
    controller: entry.controllerId,
    modifier: {
      layer: "restriction",
      target: exactTargetForSavedObject(entry, target, state, objectIndex),
      operation: {
        ...(segment.effect.type === "attackCost"
          ? { type: "attackCost" as const, cost: segment.effect.cost }
          : {
              type: "restriction" as const,
              restriction: segment.effect.type,
            }),
      },
    },
    duration: segment.effect.duration,
    createdBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    createdAtStateSeq: state.seq,
  };
};
