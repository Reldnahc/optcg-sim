import type {
  CardRef,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import type { ContinuousQueueEffect } from "./types.js";
import { createRecord, toExactCardTarget } from "./continuous.js";

export const createContinuousRecordForExactTarget = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: ContinuousQueueEffect,
  target: CardRef,
  objectIndex: number,
  idSuffix: number | string = objectIndex,
): ContinuousEffectRecord | null =>
  createRecord(
    state,
    entry,
    effect,
    toExactCardTarget(entry, target, state, objectIndex),
    idSuffix,
  );
