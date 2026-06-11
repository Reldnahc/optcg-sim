import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  continuousChooseTargetRequest,
  createSequenceSelectTargetsPause,
  hasSavedFieldObjectContinuousTarget,
  isContinuousResolvedEffect,
} from "../target-decisions.js";
import { createSupportedHandSelectionChoiceDecision } from "../../effect-runtime-hand-selection.js";
import { applyFieldMutationSequenceSegment } from "../field-segments.js";
import {
  createChooseQuantityDecisionForSequenceSegment,
  createChooseEffectOptionDecisionForSequenceSegment,
  createPayCostDecisionForSequenceSegment,
  createReturnDonDecisionForSequenceSegment,
  getSequenceOptionalPayCostOptions,
} from "../frame-decisions.js";
import { applyPlaySelectedSequenceSegment } from "../../runtime/primitives/play-selected.js";
import { applyActivateSelectedEventSequenceSegment } from "../../runtime/primitives/activate-selected-event.js";
import { evaluateQueuedEffectCondition } from "../../effect-runtime-conditions.js";
import { createContinuousRecordsForResolvedEffect } from "../../runtime/continuous/continuous.js";
import { applySelectTargetsSequenceSegment } from "../select-targets.js";
import { createTopDeckPlacementDecision } from "../../effect-runtime-top-deck-placement.js";
import {
  applyDrawSegment,
  applyMoveCardsSegment,
  applyNoOpReturnDonSegment,
  applyRevealTopSequenceSegment,
  previousSegmentCompleted,
  shouldAttemptSegment,
} from "../segments.js";
import { type SupportedSequenceSegment } from "../support.js";
import { applyRuntimePlaySource } from "../../play-card/core.js";
import { executeDamagePrimitive } from "../../runtime/primitives/execute.js";
import { createSelectFromSetDecision } from "../selected-segments.js";
import { applyRevealSelectedSequenceSegment } from "../selected-reveal.js";
import { applyPlaceSetRemainderSequenceSegment } from "../remainder.js";
import { scheduleDelayedEffectSequenceSegment } from "../delayed.js";
import {
  conditionalThenSequencePath,
  conditionalThenSingleEffectPath,
  nestedSequencePath,
  rootSequencePath,
  segmentKey,
  segmentKeyForPath,
  toSingleEffectSequence,
} from "../paths.js";
import { sequenceSegmentResultsChanged } from "./composition-results.js";
import { continuousRecordsCurrentlyApply } from "./continuous-application.js";
import { emptySegmentResult } from "./results.js";
import { getOpponentId } from "../../actions/state.js";
import { getReturnDonEligibleCount } from "../../runtime/primitives/return-don.js";
import { pauseSequenceForPendingDecision } from "./pause.js";
import { applyLifeStateNoDecisionSegment } from "./life-state-segments.js";
import { pauseForOptionalSequenceSegment } from "./optional-segment.js";
import { applyForEachSavedTargetSegment } from "./for-each-saved-target.js";
import { applySelectAllTargetsSegment } from "./select-all-targets-segment.js";
import type {
  CreateTrashFromHandSequenceDecision,
  DrawEffect,
  MoveCardsEffect,
  PayCostEffect,
  ReturnDonEffect,
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
  SequenceSegmentEffect,
  TrashFromHandEffect,
} from "./types.js";

export const continueNoDecisionSegments = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SequenceEffect | undefined,
  startIndex: number,
  ledgers: SegmentLedgers,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  incrementStateSeqForDraw: boolean,
  effectPath: readonly string[] = rootSequencePath(),
): SequenceFrameRunResult => {
  if (effect === undefined) {
    return { ok: false };
  }
  const ledgerKey = (
    segment: SequenceEffect["effects"][number],
    index: number,
  ): string => segmentKeyForPath(effectPath, segment, index);
  let nextState = state;
  let nextLedgers = ledgers;
  const events: EngineEvent[] = [];
  for (let index = startIndex; index < effect.effects.length; index += 1) {
    const segment = effect.effects[index];
    if (segment === undefined) {
      return { ok: false };
    }
    if (
      !shouldAttemptSegment(
        nextLedgers.segmentResults,
        effect,
        index,
        ledgerKey,
      )
    ) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]:
            segment.connector !== "then" &&
            previousSegmentCompleted(
              nextLedgers.segmentResults,
              effect,
              index,
              ledgerKey,
            )
              ? {
                  ...emptySegmentResult(),
                  attempted: true,
                  succeeded: true,
                }
              : emptySegmentResult(),
        },
      };
      continue;
    }
    if (segment.optional === true) {
      return pauseForOptionalSequenceSegment({
        effectPath,
        emptySegmentResult,
        entry,
        events,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
    }
    if (segment.effect.type === "delayed") {
      const delayed = scheduleDelayedEffectSequenceSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey(segment, index),
        state: nextState,
      });
      nextState = delayed.state;
      nextLedgers = delayed.ledgers;
      continue;
    }
    if (segment.effect.type === "draw") {
      const drawn = applyDrawSegment(
        nextState,
        entry,
        segment as SupportedSequenceSegment & { effect: DrawEffect },
        index,
        nextLedgers,
        { incrementStateSeq: incrementStateSeqForDraw },
        emptySegmentResult,
        ledgerKey,
      );
      if (!drawn.ok) {
        return { ok: false };
      }
      nextState = drawn.state;
      nextLedgers = drawn.ledgers;
      events.push(...drawn.events);
      continue;
    }
    if (segment.effect.type === "damage") {
      const damaged = executeDamagePrimitive(nextState, entry, segment.effect);
      if (damaged.errors !== undefined) {
        return { ok: false };
      }
      nextState = damaged.state;
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: damaged.events.length > 0,
          },
        },
      };
      if (nextState.pendingDecision !== undefined) {
        return pauseSequenceForPendingDecision({
          decisionEvents: damaged.events,
          entry,
          effectPath: [...effectPath],
          events,
          index,
          ledgers: nextLedgers,
          state: nextState,
        });
      }
      events.push(...damaged.events);
      continue;
    }
    if (segment.effect.type === "moveCards") {
      if (
        segment.effect.min !== undefined &&
        segment.effect.min < segment.effect.count
      ) {
        const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
          nextState,
          entry,
          index,
          segment.effect,
          segment.effect.count,
        );
        return pauseSequenceForPendingDecision({
          decisionEvents: quantityDecision.events,
          entry,
          effectPath: [...effectPath],
          events,
          index,
          ledgers: nextLedgers,
          state: quantityDecision.state,
        });
      }
      const moved = applyMoveCardsSegment(
        nextState,
        entry,
        segment as SupportedSequenceSegment & { effect: MoveCardsEffect },
        index,
        nextLedgers,
        emptySegmentResult,
        ledgerKey,
      );
      if (!moved.ok) {
        return { ok: false };
      }
      nextState = moved.state;
      nextLedgers = moved.ledgers;
      events.push(...moved.events);
      continue;
    }
    if (segment.effect.type === "returnDon") {
      const playerId =
        segment.effect.player === "self"
          ? entry.controllerId
          : getOpponentId(nextState, entry.controllerId);
      if (playerId === null || segment.effect.count <= 0) {
        return { ok: false };
      }
      const player = nextState.players[playerId];
      if (player === undefined) {
        return { ok: false };
      }
      const returnCount = Math.min(
        segment.effect.count,
        getReturnDonEligibleCount(player),
      );
      if (returnCount === 0) {
        const returned = applyNoOpReturnDonSegment(
          nextState,
          segment as SupportedSequenceSegment & { effect: ReturnDonEffect },
          index,
          nextLedgers,
          emptySegmentResult,
          ledgerKey,
        );
        if (!returned.ok) {
          return { ok: false };
        }
        nextState = returned.state;
        nextLedgers = returned.ledgers;
        events.push(...returned.events);
        continue;
      }
      const decisionResult = createReturnDonDecisionForSequenceSegment(
        nextState,
        entry,
        playerId,
        returnCount,
        index,
      );
      return pauseSequenceForPendingDecision({
        decisionEvents: decisionResult.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: nextLedgers,
        state: decisionResult.state,
      });
    }
    if (segment.effect.type === "drawUpTo") {
      const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
        nextState,
        entry,
        index,
        segment.effect,
        segment.effect.count,
      );
      return pauseSequenceForPendingDecision({
        decisionEvents: quantityDecision.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: nextLedgers,
        state: quantityDecision.state,
      });
    }
    if (segment.effect.type === "revealTop") {
      if (
        segment.effect.min !== undefined &&
        segment.effect.min < segment.effect.count
      ) {
        const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
          nextState,
          entry,
          index,
          segment.effect,
          segment.effect.count,
        );
        return pauseSequenceForPendingDecision({
          decisionEvents: quantityDecision.events,
          entry,
          effectPath: [...effectPath],
          events,
          index,
          ledgers: nextLedgers,
          state: quantityDecision.state,
        });
      }
      const revealed = applyRevealTopSequenceSegment(
        nextState,
        entry,
        segment as SupportedSequenceSegment & {
          effect: Extract<Effect, { type: "revealTop" }>;
        },
        index,
        nextLedgers,
        emptySegmentResult,
        ledgerKey,
      );
      if (!revealed.ok) {
        return { ok: false };
      }
      nextState = revealed.state;
      nextLedgers = revealed.ledgers;
      events.push(...revealed.events);
      continue;
    }
    const lifeState = applyLifeStateNoDecisionSegment({
      effectPath,
      emptySegmentResult,
      entry,
      events,
      index,
      ledgers: nextLedgers,
      segment,
      segmentKey: ledgerKey,
      state: nextState,
    });
    if (lifeState.handled) {
      if (!lifeState.result.ok || lifeState.result.kind === "paused") {
        return lifeState.result;
      }
      nextState = lifeState.result.state;
      nextLedgers = lifeState.result.ledgers;
      continue;
    }
    if (segment.effect.type === "placeTopDeckCards") {
      const partialResult: SequenceSegmentResult = {
        ...emptySegmentResult(),
        attempted: true,
      };
      const pausedLedgers: SegmentLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: partialResult,
        },
      };
      const decisionResult = createTopDeckPlacementDecision(
        nextState,
        entry,
        segment.effect,
        { decisionIdSuffix: `segment:${String(index)}` },
      );
      if (decisionResult.errors !== undefined) {
        return { ok: false };
      }
      return pauseSequenceForPendingDecision({
        decisionEvents: decisionResult.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: pausedLedgers,
        state: decisionResult.state,
      });
    }
    const partialResult: SequenceSegmentResult = {
      ...emptySegmentResult(),
      attempted: true,
    };
    const pausedLedgers: SegmentLedgers = {
      ...nextLedgers,
      segmentResults: {
        ...nextLedgers.segmentResults,
        [ledgerKey(segment, index)]: partialResult,
      },
    };
    if (segment.effect.type === "payCost") {
      const paySegment = segment as SupportedSequenceSegment & {
        effect: PayCostEffect;
      };
      const cost = paySegment.effect.cost;
      const paymentOptions = getSequenceOptionalPayCostOptions(
        nextState,
        entry,
        cost,
      );
      if (paymentOptions.length === 0) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [ledgerKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      const decisionResult = createPayCostDecisionForSequenceSegment(
        nextState,
        entry,
        cost,
        paymentOptions,
        index,
      );
      return pauseSequenceForPendingDecision({
        decisionEvents: decisionResult.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: pausedLedgers,
        state: decisionResult.state,
      });
    }
    if (segment.effect.type === "choice") {
      const decisionResult = createChooseEffectOptionDecisionForSequenceSegment(
        nextState,
        entry,
        segment.effect,
        index,
      );
      return pauseSequenceForPendingDecision({
        decisionEvents: decisionResult.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: pausedLedgers,
        state: decisionResult.state,
      });
    }
    if (segment.effect.type === "selectCards") {
      const decisionResult = createSupportedHandSelectionChoiceDecision(
        nextState,
        entry,
        segment.effect,
        index,
      );
      if (!decisionResult.ok) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [ledgerKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      return pauseSequenceForPendingDecision({
        decisionEvents: decisionResult.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: pausedLedgers,
        state: decisionResult.state,
      });
    }
    if (segment.effect.type === "selectFromSet") {
      const decisionResult = createSelectFromSetDecision({
        effect: segment.effect,
        entry,
        index,
        ledgers: nextLedgers,
        state: nextState,
      });
      if (!decisionResult.ok) {
        return { ok: false };
      }
      return pauseSequenceForPendingDecision({
        decisionEvents: decisionResult.events,
        entry,
        effectPath: [...effectPath],
        events,
        index,
        ledgers: pausedLedgers,
        state: decisionResult.state,
      });
    }
    if (segment.effect.type === "placeSetRemainder") {
      const placed = applyPlaceSetRemainderSequenceSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (!placed.ok) {
        return { ok: false };
      }
      if (placed.paused === true) {
        return pauseSequenceForPendingDecision({
          decisionEvents: placed.events,
          entry,
          effectPath: [...effectPath],
          events,
          index,
          ledgers: placed.ledgers,
          state: placed.state,
        });
      }
      nextState = placed.state;
      nextLedgers = placed.ledgers;
      events.push(...placed.events);
      continue;
    }
    if (segment.effect.type === "revealSelected") {
      const revealed = applyRevealSelectedSequenceSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (!revealed.ok) {
        return { ok: false };
      }
      nextState = revealed.state;
      nextLedgers = revealed.ledgers;
      events.push(...revealed.events);
      continue;
    }
    if (segment.effect.type === "selectAllTargets") {
      const selectedAll = applySelectAllTargetsSegment({
        entry,
        index,
        ledgers: nextLedgers,
        segment: segment as SequenceEffect["effects"][number] & {
          effect: Extract<Effect, { type: "selectAllTargets" }>;
        },
        segmentKey: ledgerKey(segment, index),
        state: nextState,
      });
      if (!selectedAll.ok) {
        return { ok: false };
      }
      nextLedgers = selectedAll.ledgers;
      continue;
    }
    if (segment.effect.type === "selectTargets") {
      const selectTargets = applySelectTargetsSequenceSegment({
        emptySegmentResult,
        entry,
        effectPath,
        events,
        index,
        nextLedgers,
        nextState,
        segmentKey,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "selectTargets" }>;
        },
      });
      if (!selectTargets.ok || selectTargets.kind === "paused") {
        return selectTargets;
      }
      nextState = selectTargets.state;
      nextLedgers = selectTargets.ledgers;
      continue;
    }
    if (segment.effect.type === "forEachSavedTarget") {
      const loop = applyForEachSavedTargetSegment({
        continueNoDecisionSegments,
        createTrashDecision,
        effectPath,
        entry,
        events,
        incrementStateSeqForDraw,
        index,
        ledgers: nextLedgers,
        segment: segment as SequenceEffect["effects"][number] & {
          effect: Extract<Effect, { type: "forEachSavedTarget" }>;
        },
        segmentKey: ledgerKey(segment, index),
        state: nextState,
      });
      if (!loop.ok) {
        return { ok: false };
      }
      if (loop.kind === "paused") {
        return loop;
      }
      nextState = loop.state;
      nextLedgers = loop.ledgers;
      events.push(...loop.events);
      continue;
    }
    if (segment.effect.type === "playSelected") {
      const played = applyPlaySelectedSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "playSelected" }>;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (played.kind === "paused") {
        return played;
      }
      nextState = played.state;
      nextLedgers = played.ledgers;
      continue;
    }
    if (segment.effect.type === "activateSelectedEvent") {
      const activated = applyActivateSelectedEventSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<
            SequenceSegmentEffect,
            { type: "activateSelectedEvent" }
          >;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      nextState = activated.state;
      nextLedgers = activated.ledgers;
      continue;
    }
    if (segment.effect.type === "playSource") {
      const playSource = segment.effect;
      if (
        playSource.source.type !== "triggerCard" ||
        playSource.ignoreCost !== true
      ) {
        return { ok: false };
      }
      const played = applyRuntimePlaySource({
        state: nextState,
        entry,
        enterRested: playSource.enterRested === true,
        ignoreCost: true,
      });
      if (played.errors !== undefined || played.state.pendingDecision) {
        return { ok: false };
      }
      nextState = played.state;
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: true,
            selectedCards: [entry.source],
          },
        },
      };
      events.push(...played.events);
      continue;
    }
    const fieldMutation = applyFieldMutationSequenceSegment({
      effectPath,
      emptySegmentResult,
      entry,
      events,
      index,
      ledgers: nextLedgers,
      pausedLedgers,
      segment: segment as SupportedSequenceSegment,
      segmentKey: ledgerKey,
      state: nextState,
    });
    if (fieldMutation.handled) {
      if (!fieldMutation.ok) {
        return { ok: false };
      }
      if (fieldMutation.kind === "paused") {
        return {
          events: fieldMutation.events,
          kind: "paused",
          ok: true,
          state: fieldMutation.state,
        };
      }
      events.splice(0, events.length, ...fieldMutation.events);
      nextState = fieldMutation.state;
      nextLedgers = fieldMutation.ledgers;
      continue;
    }
    if (
      isContinuousResolvedEffect(segment.effect) &&
      !hasSavedFieldObjectContinuousTarget(segment.effect)
    ) {
      const request = continuousChooseTargetRequest(segment.effect);
      if (request !== undefined) {
        return createSequenceSelectTargetsPause({
          effectBlockId: entry.effectBlockId,
          effectPath,
          entry,
          events,
          index,
          ledgers: pausedLedgers,
          request,
          state: nextState,
        });
      }
      const records = createContinuousRecordsForResolvedEffect(
        nextState,
        entry,
        segment.effect,
        undefined,
        { savedReferences: nextLedgers.savedReferences },
      );
      if (records === null) {
        return { ok: false };
      }
      nextState =
        records.length === 0
          ? nextState
          : {
              ...nextState,
              continuousEffects: [...nextState.continuousEffects, ...records],
            };
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: continuousRecordsCurrentlyApply(nextState, records),
          },
        },
      };
      continue;
    }
    if (segment.effect.type === "sequence") {
      const path = nestedSequencePath(effectPath, index);
      const nested = continueNoDecisionSegments(
        nextState,
        entry,
        segment.effect,
        0,
        nextLedgers,
        createTrashDecision,
        incrementStateSeqForDraw,
        path,
      );
      if (!nested.ok) {
        return { ok: false };
      }
      if (nested.kind === "paused") {
        return {
          events: [...events, ...nested.events],
          kind: "paused",
          ok: true,
          state: nested.state,
        };
      }
      const changedState =
        sequenceSegmentResultsChanged(
          nested.ledgers.segmentResults,
          segment.effect,
          path,
        ) || nested.events.length > 0;
      nextState = nested.state;
      nextLedgers = {
        ...nested.ledgers,
        segmentResults: {
          ...nested.ledgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState,
          },
        },
      };
      events.push(...nested.events);
      continue;
    }
    if (segment.effect.type === "conditional") {
      const condition = evaluateQueuedEffectCondition(
        nextState,
        entry,
        segment.effect.if,
        { savedReferences: nextLedgers.savedReferences },
      );
      if (!condition.supported) {
        return { ok: false };
      }
      if (!condition.passed) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [ledgerKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      let changedState = false;
      if (
        segment.effect.then.type === "sequence" ||
        !isContinuousResolvedEffect(segment.effect.then)
      ) {
        const thenSequence =
          segment.effect.then.type === "sequence"
            ? segment.effect.then
            : toSingleEffectSequence(segment.effect.then);
        const thenPath =
          segment.effect.then.type === "sequence"
            ? conditionalThenSequencePath(effectPath, index)
            : conditionalThenSingleEffectPath(effectPath, index);
        const nested = continueNoDecisionSegments(
          nextState,
          entry,
          thenSequence,
          0,
          nextLedgers,
          createTrashDecision,
          incrementStateSeqForDraw,
          thenPath,
        );
        if (!nested.ok) {
          return { ok: false };
        }
        if (nested.kind === "paused") {
          return {
            events: [...events, ...nested.events],
            kind: "paused",
            ok: true,
            state: nested.state,
          };
        }
        nextState = nested.state;
        nextLedgers = nested.ledgers;
        events.push(...nested.events);
        changedState =
          sequenceSegmentResultsChanged(
            nested.ledgers.segmentResults,
            thenSequence,
            thenPath,
          ) || nested.events.length > 0;
      } else {
        const request = continuousChooseTargetRequest(segment.effect.then);
        if (request !== undefined) {
          return createSequenceSelectTargetsPause({
            effectBlockId: entry.effectBlockId,
            effectPath,
            entry,
            events,
            index,
            ledgers: pausedLedgers,
            request,
            state: nextState,
          });
        }
        const records = createContinuousRecordsForResolvedEffect(
          nextState,
          entry,
          segment.effect.then,
          undefined,
          { savedReferences: nextLedgers.savedReferences },
        );
        if (records === null) {
          return { ok: false };
        }
        nextState =
          records.length === 0
            ? nextState
            : {
                ...nextState,
                continuousEffects: [...nextState.continuousEffects, ...records],
              };
        changedState = continuousRecordsCurrentlyApply(nextState, records);
      }
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState,
          },
        },
      };
      continue;
    }
    const decisionResult = createTrashDecision(
      nextState,
      entry,
      segment.effect as TrashFromHandEffect,
    );
    if (!decisionResult.ok) {
      return { ok: false };
    }
    return pauseSequenceForPendingDecision({
      decisionEvents: decisionResult.events,
      entry,
      effectPath: [...effectPath],
      events,
      index,
      ledgers: pausedLedgers,
      state: decisionResult.state,
    });
  }
  return {
    events,
    kind: "completed",
    ledgers: nextLedgers,
    ok: true,
    state: nextState,
  };
};
