import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
  CardRef,
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
  applySavedFieldObjectBasePowerSwapSequenceSegment,
  applySavedFieldObjectChangeAttackTargetSequenceSegment,
  applySavedFieldObjectKoSequenceSegment,
  applySavedFieldObjectRestSequenceSegment,
  applySavedFieldObjectRestrictionSequenceSegment,
  applySavedFieldObjectTrashSequenceSegment,
  restFieldObjects,
  restProtectionAttemptFromEntry,
} from "./saved-field-object.js";
import {
  applyAttachSelectedDonSequenceSegment,
  applyBounceSequenceSegment,
  applySelectedCardMoveSegment,
} from "./selected-segments.js";
import type { SegmentLedgers } from "./runner.js";
import { restChooseTargetRequest } from "./target-decisions.js";
import type { SupportedSequenceSegment } from "./support.js";
import { getOpponentId } from "../actions/state.js";

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
    if (moved.paused === true) {
      const decision = moved.state.pendingDecision;
      if (decision === undefined) {
        return { handled: true, ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: moved.ledgers.savedReferences,
        segmentResults: moved.ledgers.segmentResults,
        state: moved.state,
      });
      return {
        events: [...events, ...moved.events],
        handled: true,
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(moved.state, entry, frame),
      };
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
    const bounced = applyBounceSequenceSegment({
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
        state: stateWithPausedSequenceFrame(bounced.state, entry, {
          ...frame,
          nextSegmentIndex: index,
        }),
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
    if (segment.effect.target.type === "opponentLeader") {
      const opponentId = getOpponentId(state, entry.controllerId);
      if (opponentId === null) {
        return { handled: true, ok: false };
      }
      const opponent = state.players[opponentId];
      if (opponent === undefined) {
        return { handled: true, ok: false };
      }
      const leaderRef: CardRef = {
        instanceId: opponent.leader.instanceId,
        cardId: opponent.leader.cardId,
        playerId: opponentId,
        zone: opponent.leader.zone,
      };
      const rested = restFieldObjects(
        state,
        [leaderRef],
        restProtectionAttemptFromEntry(entry),
        {
          events,
          sourceKind: "effect",
          sourceControllerId: entry.controllerId,
        },
      );
      return {
        events,
        handled: true,
        kind: "continue",
        ledgers: {
          ...ledgers,
          segmentResults: {
            ...ledgers.segmentResults,
            [segmentKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
              succeeded: true,
              changedState: rested.changed,
              selectedTargets: [leaderRef],
            },
          },
        },
        ok: true,
        state: rested.state,
      };
    }
    if (segment.effect.target.type === "self") {
      const selfRef = entry.source.zone
        ? {
            instanceId: entry.source.instanceId,
            cardId: entry.source.cardId,
            playerId: entry.source.playerId,
            zone: entry.source.zone,
          }
        : undefined;
      if (selfRef === undefined) {
        return {
          events,
          handled: true,
          kind: "continue",
          ledgers: {
            ...ledgers,
            segmentResults: {
              ...ledgers.segmentResults,
              [segmentKey(segment, index)]: {
                ...emptySegmentResult(),
                attempted: true,
              },
            },
          },
          ok: true,
          state,
        };
      }
      const rested = restFieldObjects(
        state,
        [selfRef],
        restProtectionAttemptFromEntry(entry),
        {
          events,
          sourceKind: "effect",
          sourceControllerId: entry.controllerId,
        },
      );
      return {
        events,
        handled: true,
        kind: "continue",
        ledgers: {
          ...ledgers,
          segmentResults: {
            ...ledgers.segmentResults,
            [segmentKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
              succeeded: true,
              changedState: rested.changed,
              selectedTargets: [selfRef],
            },
          },
        },
        ok: true,
        state: rested.state,
      };
    }
    const rested = applySavedFieldObjectRestSequenceSegment({
      emptySegmentResult,
      events,
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

  if (segment.effect.type === "changeAttackTarget") {
    const changedTarget =
      applySavedFieldObjectChangeAttackTargetSequenceSegment({
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
      ledgers: changedTarget.ledgers,
      ok: true,
      state: changedTarget.state,
    };
  }

  if (segment.effect.type === "swapBasePower") {
    const swapped = applySavedFieldObjectBasePowerSwapSequenceSegment({
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
      ledgers: swapped.ledgers,
      ok: true,
      state: swapped.state,
    };
  }

  if (
    (segment.effect.type === "modifyPower" ||
      segment.effect.type === "giveKeyword" ||
      segment.effect.type === "giveAttribute" ||
      segment.effect.type === "cannotBecomeActive" ||
      segment.effect.type === "cannotAttack" ||
      segment.effect.type === "attackCost" ||
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
