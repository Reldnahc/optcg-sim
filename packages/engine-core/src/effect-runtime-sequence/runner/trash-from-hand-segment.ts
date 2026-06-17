import type { EffectQueueEntry, EngineEvent, GameState } from "@optcg/types";

import { resolveDynamicNumberValue } from "../../runtime/continuous/value-resolution.js";
import { resolveTrashFromHandUntilCount } from "../../runtime/primitives/trash-from-hand-until.js";
import { pauseSequenceForPendingDecision } from "./pause.js";
import { emptySegmentResult } from "./results.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameRunResult,
  TrashFromHandEffect,
  TrashFromHandUntilCountEffect,
} from "./types.js";

type HandTrashPauseParams = {
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectPath: readonly string[];
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  state: GameState;
};

type TrashFromHandUntilCountSegmentResult =
  | { kind: "continue"; ledgers: SegmentLedgers }
  | { kind: "return"; result: SequenceFrameRunResult };

export const pauseForTrashFromHandSegment = (
  params: HandTrashPauseParams & { effect: TrashFromHandEffect },
): SequenceFrameRunResult => {
  const count = resolveDynamicNumberValue(params.state, params.effect.count, {
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    source: params.entry.source,
  });
  if (count === null || count <= 0) {
    return { ok: false };
  }
  const decisionResult = params.createTrashDecision(
    params.state,
    params.entry,
    { ...params.effect, count },
  );
  if (!decisionResult.ok) {
    return { ok: false };
  }
  return pauseSequenceForPendingDecision({
    decisionEvents: decisionResult.events,
    entry: params.entry,
    effectPath: [...params.effectPath],
    events: params.events,
    index: params.index,
    ledgers: params.ledgers,
    state: decisionResult.state,
  });
};

export const pauseForTrashFromHandUntilCountSegment = (
  params: HandTrashPauseParams & {
    effect: TrashFromHandUntilCountEffect;
    segmentResultKey: string;
  },
): TrashFromHandUntilCountSegmentResult => {
  const resolved = resolveTrashFromHandUntilCount(
    params.state,
    params.entry,
    params.effect,
  );
  if (resolved.kind === "unsupported") {
    return { kind: "return", result: { ok: false } };
  }
  if (resolved.kind === "noop") {
    return {
      kind: "continue",
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentResultKey]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
          },
        },
      },
    };
  }
  return {
    kind: "return",
    result: pauseForTrashFromHandSegment({
      ...params,
      effect: resolved.effect,
    }),
  };
};
