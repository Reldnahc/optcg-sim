import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  applyRevealFromZoneSequenceSegment,
  applyRevealTopSequenceSegment,
} from "../segments.js";
import { type SupportedSequenceSegment } from "../support.js";
import { createChooseQuantityDecisionForSequenceSegment } from "../quantity-decisions.js";
import { pauseSequenceForPendingDecision } from "./pause.js";
import type {
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
} from "./types.js";

type RevealSegmentRunResult =
  | { readonly ok: false }
  | {
      readonly events: EngineEvent[];
      readonly kind: "continued";
      readonly ledgers: SegmentLedgers;
      readonly ok: true;
      readonly state: GameState;
    }
  | (SequenceFrameRunResult & { readonly kind: "paused" });

export const applyRevealNoDecisionSegment = (input: {
  readonly effectPath: readonly string[];
  readonly emptySegmentResult: () => SequenceSegmentResult;
  readonly entry: EffectQueueEntry;
  readonly events: readonly EngineEvent[];
  readonly index: number;
  readonly ledgers: SegmentLedgers;
  readonly segment: SequenceEffect["effects"][number];
  readonly segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  readonly state: GameState;
}):
  | { readonly handled: false }
  | { readonly handled: true; readonly result: RevealSegmentRunResult } => {
  const { segment } = input;
  if (segment.effect.type === "revealTop") {
    return { handled: true, result: applyRevealTopSegment(input) };
  }
  if (segment.effect.type === "revealFromZone") {
    return { handled: true, result: applyRevealFromZoneSegment(input) };
  }
  return { handled: false };
};

const applyRevealTopSegment = (input: {
  readonly effectPath: readonly string[];
  readonly emptySegmentResult: () => SequenceSegmentResult;
  readonly entry: EffectQueueEntry;
  readonly events: readonly EngineEvent[];
  readonly index: number;
  readonly ledgers: SegmentLedgers;
  readonly segment: SequenceEffect["effects"][number];
  readonly segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  readonly state: GameState;
}): RevealSegmentRunResult => {
  const { entry, index, segment, state } = input;
  if (segment.effect.type !== "revealTop") {
    return { ok: false };
  }
  if (
    segment.effect.min !== undefined &&
    segment.effect.min < segment.effect.count
  ) {
    const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
      state,
      entry,
      index,
      segment.effect,
      segment.effect.count,
    );
    return {
      ...pauseSequenceForPendingDecision({
        decisionEvents: quantityDecision.events,
        entry,
        effectPath: [...input.effectPath],
        events: [...input.events],
        index,
        ledgers: input.ledgers,
        state: quantityDecision.state,
      }),
      kind: "paused",
    };
  }
  const revealed = applyRevealTopSequenceSegment(
    state,
    entry,
    segment as SupportedSequenceSegment & {
      effect: Extract<Effect, { type: "revealTop" }>;
    },
    index,
    input.ledgers,
    input.emptySegmentResult,
    input.segmentKey,
  );
  if (!revealed.ok) {
    return { ok: false };
  }
  return {
    ...revealed,
    kind: "continued",
  };
};

const applyRevealFromZoneSegment = (input: {
  readonly emptySegmentResult: () => SequenceSegmentResult;
  readonly entry: EffectQueueEntry;
  readonly index: number;
  readonly ledgers: SegmentLedgers;
  readonly segment: SequenceEffect["effects"][number];
  readonly segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  readonly state: GameState;
}): RevealSegmentRunResult => {
  const { entry, index, segment, state } = input;
  if (segment.effect.type !== "revealFromZone") {
    return { ok: false };
  }
  const revealed = applyRevealFromZoneSequenceSegment(
    state,
    entry,
    segment as SupportedSequenceSegment & {
      effect: Extract<Effect, { type: "revealFromZone" }>;
    },
    index,
    input.ledgers,
    input.emptySegmentResult,
    input.segmentKey,
  );
  if (!revealed.ok) {
    return { ok: false };
  }
  return {
    ...revealed,
    kind: "continued",
  };
};
