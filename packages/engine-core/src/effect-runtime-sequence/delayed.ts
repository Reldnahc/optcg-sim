import type {
  DelayedEffectRecord,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { toStateSeq } from "../action-results.js";
import type { SegmentLedgers } from "./runner/types.js";

type DelayedEffect = Extract<Effect, { type: "delayed" }>;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;

export const delayedEffectBlockId = (
  entry: EffectQueueEntry,
  segmentKey: string,
): EffectQueueEntry["effectBlockId"] =>
  `${String(entry.effectBlockId)}:delayed:${segmentKey}` as EffectQueueEntry["effectBlockId"];

export const delayedEffectRecordId = (
  entry: EffectQueueEntry,
  segmentKey: string,
): string => `delayed-effect:${String(entry.id)}:${segmentKey}`;

export const toDelayedEffectBlock = (
  entry: EffectQueueEntry,
  segmentKey: string,
  effect: DelayedEffect,
): EffectDefinition["effects"][number] => ({
  id: delayedEffectBlockId(entry, segmentKey),
  category: "auto",
  trigger:
    effect.timing.type === "event"
      ? effect.timing.trigger
      : { type: "endOfYourTurn" },
  sourcePresencePolicy: "noSourceRequired",
  effect: effect.effect,
});

export const scheduleDelayedEffectSequenceSegment = (params: {
  effect: DelayedEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: string;
  state: GameState;
}): { ledgers: SegmentLedgers; state: GameState } => {
  const record: DelayedEffectRecord = {
    id: delayedEffectRecordId(params.entry, params.segmentKey),
    timing: params.effect.timing,
    controllerId: params.entry.controllerId,
    source: params.entry.source,
    sourceSnapshot: params.entry.sourceSnapshot,
    effectBlock: toDelayedEffectBlock(
      params.entry,
      params.segmentKey,
      params.effect,
    ),
    createdBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    createdAtStateSeq: params.state.seq,
  };
  return {
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: true,
        },
      },
    },
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      delayedEffects: [...(params.state.delayedEffects ?? []), record],
    },
  };
};
