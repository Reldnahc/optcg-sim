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
  applyAllTargetRestSequenceSegment,
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
import { isSupportedSavedTargetContinuousSegment } from "./support/continuous.js";
import { getOpponentId } from "../actions/state.js";
import { findCardInstance } from "../effect-runtime-trigger-source-lookup.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type KoEffect = Extract<Effect, { type: "ko" }>;
type TrashEffect = Extract<Effect, { type: "trash" }>;
type AllTargetKoEffect = KoEffect & {
  target: Extract<Target, { type: "all" }>;
};
type SelfKoEffect = KoEffect & {
  target: Extract<Target, { type: "self" }>;
};
type AllTargetTrashEffect = TrashEffect & {
  target: Extract<Target, { type: "all" }>;
};
type RestEffect = Extract<Effect, { type: "rest" }>;
type AllTargetRestEffect = RestEffect & {
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

const isSelfKoEffect = (effect: KoEffect): effect is SelfKoEffect =>
  effect.target.type === "self";

const isAllTargetTrashEffect = (
  effect: TrashEffect,
): effect is AllTargetTrashEffect => effect.target.type === "all";

const isAllTargetRestEffect = (
  effect: RestEffect,
): effect is AllTargetRestEffect => effect.target.type === "all";

const applySelfKoSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): {
  events: EngineEvent[];
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  const source = findCardInstance(
    params.state,
    params.entry.source.playerId,
    params.entry.source.instanceId,
  );
  if (
    source === undefined ||
    source.cardId !== params.entry.source.cardId ||
    source.zone.zone !== "characterArea"
  ) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  const selectedTarget: CardRef = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: params.entry.source.playerId,
    zone: source.zone,
  };
  const resolvedKo = executeSelectedTargetEffectPrimitive(
    params.state,
    params.entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zone: "characterArea",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    [selectedTarget],
  );
  if (resolvedKo.errors !== undefined) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  if (resolvedKo.state.pendingDecision?.type === "chooseReplacement") {
    return {
      events: resolvedKo.events,
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: resolvedKo.state,
    };
  }
  return {
    events: resolvedKo.events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          changedState: resolvedKo.events.length > 0,
          selectedTargets: [selectedTarget],
          succeeded: true,
        },
      },
    },
    state: resolvedKo.state,
  };
};

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
      : isSelfKoEffect(segment.effect)
        ? applySelfKoSequenceSegment({
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
    if (isAllTargetRestEffect(segment.effect)) {
      const rested = applyAllTargetRestSequenceSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers,
        segment,
        segmentKey,
        state,
      });
      const nextEvents = [...events, ...rested.events];
      if (rested.state.pendingDecision?.type === "chooseReplacement") {
        const frame = frameForPausedSequenceDecision({
          decision: rested.state.pendingDecision,
          entry,
          effectPath: [...effectPath],
          index,
          savedReferences: rested.ledgers.savedReferences,
          segmentResults: rested.ledgers.segmentResults,
          state: rested.state,
        });
        return {
          events: nextEvents,
          handled: true,
          kind: "paused",
          ok: true,
          state: stateWithPausedSequenceFrame(rested.state, entry, frame),
        };
      }
      return {
        events: nextEvents,
        handled: true,
        kind: "continue",
        ledgers: rested.ledgers,
        ok: true,
        state: rested.state,
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
          sourceCardId: entry.source.cardId,
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
          sourceCardId: entry.source.cardId,
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

  if (isSupportedSavedTargetContinuousSegment(segment.effect)) {
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
