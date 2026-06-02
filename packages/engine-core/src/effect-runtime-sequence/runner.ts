import type {
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  continuousChooseTargetRequest,
  createSequenceSelectTargetsPause,
  hasSavedFieldObjectContinuousTarget,
  isContinuousResolvedEffect,
} from "./target-decisions.js";
import { createSupportedHandSelectionChoiceDecision } from "../effect-runtime-hand-selection.js";
import { applyFieldMutationSequenceSegment } from "./field-segments.js";
import {
  createChooseQuantityDecisionForSequenceSegment,
  createOptionalActivationDecisionForSequenceSegment,
  createPayCostDecisionForSequenceSegment,
  frameForPausedSequenceDecision,
  getSequenceOptionalPayCostOptions,
  stateWithPausedSequenceFrame,
} from "./frame-decisions.js";
import { applyPlaySelectedSequenceSegment } from "../runtime/primitives/play-selected.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { createContinuousRecordsForResolvedEffect } from "../runtime/continuous/continuous.js";
import { applySelectTargetsSequenceSegment } from "./select-targets.js";
import { createTopDeckPlacementDecision } from "../effect-runtime-top-deck-placement.js";
import { applySearchRevealSequenceSegment } from "./search-reveal.js";
import {
  applyDrawSegment,
  applyMoveCardsSegment,
  applyRevealTopSequenceSegment,
  shouldAttemptSegment,
} from "./segments.js";
import { type SupportedSequenceSegment } from "./support.js";
import { applyRuntimePlaySource } from "../play-card/core.js";
import { createSelectFromSetDecision } from "./selected-segments.js";
import {
  conditionalThenSequencePath,
  conditionalThenSingleEffectPath,
  nestedSequencePath,
  rootSequencePath,
  segmentKey,
  segmentKeyForPath,
  toSingleEffectSequence,
} from "./paths.js";

export {
  resolveSequenceForPath,
  segmentKey,
  segmentKeyForPath,
} from "./paths.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;
export type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};
type TrashDecisionResult =
  | { events: EngineEvent[]; ok: true; state: GameState }
  | { error: EngineError; events: EngineEvent[]; ok: false; state: GameState };
export type CreateTrashFromHandSequenceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
) => TrashDecisionResult;
export type SequenceFrameResumeResult =
  | { events: EngineEvent[]; ok: true; state: GameState }
  | { error: EngineError; ok: false }
  | undefined;

export type SequenceFrameRunResult =
  | {
      events: EngineEvent[];
      kind: "completed";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { ok: false };

type SequenceRuntimeFailureReason =
  | "missing-frame"
  | "missing-queue-entry"
  | "missing-effect-block"
  | "unsupported-sequence-shape"
  | "segment-execution-failed";

interface SequenceRuntimeErrorDetails {
  reason: SequenceRuntimeFailureReason;
}

export const emptySegmentResult = (): SequenceSegmentResult => ({
  attempted: false,
  succeeded: false,
  changedState: false,
  selectedCards: [],
  selectedTargets: [],
  paidCost: false,
  playerDeclined: false,
});

export const sequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SequenceRuntimeFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SequenceRuntimeErrorDetails,
});

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
          [ledgerKey(segment, index)]: emptySegmentResult(),
        },
      };
      continue;
    }
    if (segment.optional === true) {
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
      const optionalDecision =
        createOptionalActivationDecisionForSequenceSegment(
          nextState,
          entry,
          index,
        );
      const decision = optionalDecision.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: optionalDecision.state,
      });
      return {
        events: [...events, ...optionalDecision.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(
          optionalDecision.state,
          entry,
          frame,
        ),
      };
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
        const decision = quantityDecision.state.pendingDecision;
        if (decision === undefined) {
          return { ok: false };
        }
        const frame = frameForPausedSequenceDecision({
          decision,
          entry,
          effectPath: [...effectPath],
          index,
          savedReferences: nextLedgers.savedReferences,
          segmentResults: nextLedgers.segmentResults,
          state: quantityDecision.state,
        });
        return {
          events: [...events, ...quantityDecision.events],
          kind: "paused",
          ok: true,
          state: stateWithPausedSequenceFrame(
            quantityDecision.state,
            entry,
            frame,
          ),
        };
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
    if (segment.effect.type === "drawUpTo") {
      const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
        nextState,
        entry,
        index,
        segment.effect,
        segment.effect.count,
      );
      const decision = quantityDecision.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: nextLedgers.savedReferences,
        segmentResults: nextLedgers.segmentResults,
        state: quantityDecision.state,
      });
      return {
        events: [...events, ...quantityDecision.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(
          quantityDecision.state,
          entry,
          frame,
        ),
      };
    }
    if (segment.effect.type === "search") {
      const search = applySearchRevealSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        nextLedgers,
        nextState,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<
            SupportedSequenceSegment["effect"],
            { type: "search" }
          >;
        },
        segmentKey: ledgerKey,
      });
      if (!search.ok || search.kind === "paused") {
        return search;
      }
      nextState = search.state;
      nextLedgers = search.ledgers;
      continue;
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
        const decision = quantityDecision.state.pendingDecision;
        if (decision === undefined) {
          return { ok: false };
        }
        const frame = frameForPausedSequenceDecision({
          decision,
          entry,
          effectPath: [...effectPath],
          index,
          savedReferences: nextLedgers.savedReferences,
          segmentResults: nextLedgers.segmentResults,
          state: quantityDecision.state,
        });
        return {
          events: [...events, ...quantityDecision.events],
          kind: "paused",
          ok: true,
          state: stateWithPausedSequenceFrame(
            quantityDecision.state,
            entry,
            frame,
          ),
        };
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
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
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
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
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
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
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
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
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
            changedState: records.length > 0,
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
        nested.events.length > 0 || nested.state !== nextState;
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
        changedState = nested.events.length > 0;
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
        changedState = records.length > 0;
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
    const decision = decisionResult.state.pendingDecision;
    if (decision === undefined) {
      return { ok: false };
    }
    const frame = frameForPausedSequenceDecision({
      decision,
      entry,
      effectPath: [...effectPath],
      index,
      savedReferences: pausedLedgers.savedReferences,
      segmentResults: pausedLedgers.segmentResults,
      state: decisionResult.state,
    });
    return {
      events: [...events, ...decisionResult.events],
      kind: "paused",
      ok: true,
      state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
    };
  }
  return {
    events,
    kind: "completed",
    ledgers: nextLedgers,
    ok: true,
    state: nextState,
  };
};
