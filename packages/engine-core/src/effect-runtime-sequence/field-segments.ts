import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
  Target,
} from "@optcg/types";

import { createSequenceSelectTargetsPause } from "./target-decisions.js";
import {
  applyAllTargetKoSequenceSegment,
  applyAllTargetTrashSequenceSegment,
} from "./all-target-segments.js";
import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "./frame-decisions.js";
import {
  applySavedFieldObjectActivateSequenceSegment,
  applySavedFieldObjectKoSequenceSegment,
  applySavedFieldObjectRestSequenceSegment,
  applySavedFieldObjectRestrictionSequenceSegment,
  applySavedFieldObjectTrashSequenceSegment,
} from "./saved-field-object.js";
import {
  applyAttachSelectedDonSequenceSegment,
  applyBounceToOwnerHandSequenceSegment,
  applySelectedCardMoveSegment,
} from "./selected-segments.js";
import type { SegmentLedgers } from "./runner.js";
import { restChooseTargetRequest } from "./target-decisions.js";
import type { SupportedSequenceSegment } from "./support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type KoEffect = Extract<Effect, { type: "ko" }>;
type TrashEffect = Extract<Effect, { type: "trash" }>;
type AllTargetKoEffect = KoEffect & {
  target: Extract<Target, { type: "all" }>;
};
type AllTargetTrashEffect = TrashEffect & {
  target: Extract<Target, { type: "all" }>;
};
type SegmentHandlerResult =
  | {
      events: EngineEvent[];
      handled: true;
      kind: "continue";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      handled: true;
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { handled: true; ok: false }
  | { handled: false };

const isAllTargetKoEffect = (effect: KoEffect): effect is AllTargetKoEffect =>
  effect.target.type === "all";

const isAllTargetTrashEffect = (
  effect: TrashEffect,
): effect is AllTargetTrashEffect => effect.target.type === "all";

export const applyFieldMutationSequenceSegment = (params: {
  effectPath: readonly string[];
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  ledgers: SegmentLedgers;
  pausedLedgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): SegmentHandlerResult => {
  const {
    effectPath,
    emptySegmentResult,
    entry,
    events,
    index,
    ledgers,
    pausedLedgers,
    segment,
    segmentKey,
    state,
  } = params;

  if (segment.effect.type === "moveSelected") {
    const moved = applySelectedCardMoveSegment({
      effect: segment.effect,
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    if (!moved.ok) {
      return { handled: true, ok: false };
    }
    return {
      events: [...events, ...moved.events],
      handled: true,
      kind: "continue",
      ledgers: moved.ledgers,
      ok: true,
      state: moved.state,
    };
  }

  if (segment.effect.type === "bounce") {
    const bounced = applyBounceToOwnerHandSequenceSegment({
      effect: segment.effect,
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    if (!bounced.ok) {
      return { handled: true, ok: false };
    }
    const nextEvents = [...events, ...bounced.events];
    if (
      bounced.paused === true &&
      bounced.state.pendingDecision !== undefined
    ) {
      const frame = frameForPausedSequenceDecision({
        decision: bounced.state.pendingDecision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: bounced.ledgers.savedReferences,
        segmentResults: bounced.ledgers.segmentResults,
        state: bounced.state,
      });
      return {
        events: nextEvents,
        handled: true,
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(bounced.state, entry, frame),
      };
    }
    return {
      events: nextEvents,
      handled: true,
      kind: "continue",
      ledgers: bounced.ledgers,
      ok: true,
      state: bounced.state,
    };
  }

  if (segment.effect.type === "attachSelectedDon") {
    const attached = applyAttachSelectedDonSequenceSegment({
      effect: segment.effect,
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    if (!attached.ok) {
      return { handled: true, ok: false };
    }
    return {
      events: [...events, ...attached.events],
      handled: true,
      kind: "continue",
      ledgers: attached.ledgers,
      ok: true,
      state: attached.state,
    };
  }

  if (segment.effect.type === "ko") {
    const resolvedKo = isAllTargetKoEffect(segment.effect)
      ? applyAllTargetKoSequenceSegment({
          effect: segment.effect,
          emptySegmentResult,
          entry,
          index,
          ledgers,
          segment,
          segmentKey,
          state,
        })
      : applySavedFieldObjectKoSequenceSegment({
          emptySegmentResult,
          entry,
          index,
          ledgers,
          segment,
          segmentKey,
          state,
        });
    const nextEvents = [...events, ...resolvedKo.events];
    if (resolvedKo.state.pendingDecision !== undefined) {
      const frame = frameForPausedSequenceDecision({
        decision: resolvedKo.state.pendingDecision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: resolvedKo.ledgers.savedReferences,
        segmentResults: resolvedKo.ledgers.segmentResults,
        state: resolvedKo.state,
      });
      return {
        events: nextEvents,
        handled: true,
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(resolvedKo.state, entry, frame),
      };
    }
    return {
      events: nextEvents,
      handled: true,
      kind: "continue",
      ledgers: resolvedKo.ledgers,
      ok: true,
      state: resolvedKo.state,
    };
  }

  if (
    segment.effect.type === "trash" &&
    isAllTargetTrashEffect(segment.effect)
  ) {
    const trashed = applyAllTargetTrashSequenceSegment({
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      effect: segment.effect,
      state,
    });
    return {
      events: [...events, ...trashed.events],
      handled: true,
      kind: "continue",
      ledgers: trashed.ledgers,
      ok: true,
      state: trashed.state,
    };
  }

  if (segment.effect.type === "trash") {
    const trashed = applySavedFieldObjectTrashSequenceSegment({
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    return {
      events: [...events, ...trashed.events],
      handled: true,
      kind: "continue",
      ledgers: trashed.ledgers,
      ok: true,
      state: trashed.state,
    };
  }

  if (segment.effect.type === "rest") {
    const request = restChooseTargetRequest(segment.effect);
    if (request !== undefined) {
      const paused = createSequenceSelectTargetsPause({
        effectBlockId: entry.effectBlockId,
        effectPath,
        entry,
        events,
        index,
        ledgers: pausedLedgers,
        request,
        state,
      });
      if (!paused.ok) {
        return { handled: true, ok: false };
      }
      if (paused.kind !== "paused") {
        return { handled: true, ok: false };
      }
      return {
        events: paused.events,
        handled: true,
        kind: "paused",
        ok: true,
        state: paused.state,
      };
    }
    const rested = applySavedFieldObjectRestSequenceSegment({
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    return {
      events,
      handled: true,
      kind: "continue",
      ledgers: rested.ledgers,
      ok: true,
      state: rested.state,
    };
  }

  if (segment.effect.type === "activate") {
    const activated = applySavedFieldObjectActivateSequenceSegment({
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    return {
      events,
      handled: true,
      kind: "continue",
      ledgers: activated.ledgers,
      ok: true,
      state: activated.state,
    };
  }

  if (
    (segment.effect.type === "modifyPower" ||
      segment.effect.type === "cannotBecomeActive" ||
      segment.effect.type === "cannotAttack" ||
      segment.effect.type === "cannotBlock" ||
      segment.effect.type === "preventBlockerActivation" ||
      segment.effect.type === "invalidateEffects") &&
    segment.effect.target.type === "savedFieldObject"
  ) {
    const restricted = applySavedFieldObjectRestrictionSequenceSegment({
      emptySegmentResult,
      entry,
      index,
      ledgers,
      segment,
      segmentKey,
      state,
    });
    return {
      events,
      handled: true,
      kind: "continue",
      ledgers: restricted.ledgers,
      ok: true,
      state: restricted.state,
    };
  }

  return { handled: false };
};
