import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  QueueEntryId,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  createEvent,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { queueReferencedMainEffectFromTrigger } from "../effect-runtime-activate-referenced-effect.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { cleanupResolvedLifeTrigger } from "../effect-runtime-life-trigger-cleanup.js";
import { executeMoveCardsPrimitive } from "../effect-runtime-move-cards.js";
import { createQueuedTopDeckPlacementDecision as placeTopDeck } from "../effect-runtime-top-deck-placement.js";
import { createSupportedSequenceFrameDecision } from "../effect-runtime-sequence/frames.js";
import { applyRuntimePlaySource } from "../play-card/core.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../rules/once-per-turn.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import { createContinuousRecordsForResolvedEffect } from "../runtime/continuous/continuous.js";
import {
  executeDrawPrimitiveForResolvedQuantity,
  executeNoChoiceEffectPrimitive,
  executeWinGamePrimitive,
} from "../runtime/primitives/execute.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";
import {
  createChooseOptionalActivationDecision,
  createChooseQuantityDecision,
} from "./choice-decisions.js";
import { appendFailedConditionSpotlightEvent } from "../runtime/failed-condition-presentation.js";
import { resolveQueuedDamagePrimitive } from "./damage.js";
import { createQueuedEffectResolvers } from "./effect-resolution.js";
import { resolveQueuedPrimitiveBody } from "./primitive-resolution.js";
import { resolveQueuedQuantity } from "./quantity-resolution.js";
import type { EffectRuntimeQueueResultsDependencies } from "./results-types.js";
import { evaluateQueuedEffectSourcePresence } from "./source-presence.js";
import { resolveQueuedTrashFromHandDecision } from "./trash-from-hand.js";
import { createUnsupportedEffectQueueResult } from "./unsupported.js";

export interface QueueEntryResolver {
  readonly resolveQueueEntriesInOrder: (
    state: GameState,
    entries: readonly EffectQueueEntry[],
    acceptedOptionalQueueEntryIds?: ReadonlySet<QueueEntryId>,
  ) => EngineResult;
}

export const createQueueEntryResolver = (
  dependencies: EffectRuntimeQueueResultsDependencies,
): QueueEntryResolver => {
  const unsupportedEffectQueueResult = (state: GameState): EngineResult =>
    createUnsupportedEffectQueueResult(
      state,
      dependencies.createUnsupportedPendingRuntimeWorkError,
    );
  const queuedEffectResolvers = createQueuedEffectResolvers(dependencies);

  const resolveQueueEntriesInOrder = (
    state: GameState,
    entries: readonly EffectQueueEntry[],
    acceptedOptionalQueueEntryIds: ReadonlySet<QueueEntryId> = new Set(),
  ): EngineResult => {
    const originalState = state;
    let nextState = state;
    const allEvents: EngineEvent[] = [];
    for (const selected of entries) {
      const sourcePresence = evaluateQueuedEffectSourcePresence(
        nextState,
        selected,
      );
      if (!sourcePresence.ok) {
        return unsupportedEffectQueueResult(originalState);
      }
      const queuedEffect = queuedEffectResolvers.resolveQueuedEffectDefinition(
        nextState,
        selected,
      );
      if (queuedEffect?.conditionTiming !== undefined) {
        return unsupportedEffectQueueResult(originalState);
      }
      const conditionResult = evaluateQueuedEffectCondition(
        nextState,
        selected,
        queuedEffect?.condition,
      );
      if (!conditionResult.supported) {
        return unsupportedEffectQueueResult(originalState);
      }
      if (!conditionResult.passed) {
        nextState = appendFailedConditionSpotlightEvent({
          effectBlock: queuedEffect,
          entry: selected,
          events: allEvents,
          state: nextState,
        });
        nextState = {
          ...nextState,
          effectQueue: nextState.effectQueue.filter(
            (entry) => entry.id !== selected.id,
          ),
        };
        const cleanup = cleanupResolvedLifeTrigger(nextState, selected);
        nextState = cleanup.state;
        allEvents.push(...cleanup.events);
        continue;
      }
      let queuedEffectForBodyResolution = queuedEffect;
      let drawEffect: Extract<Effect, { type: "draw" }> | undefined;
      if (queuedEffect?.optional === true) {
        const optionalSupportShape =
          queuedEffectResolvers.withoutConditionFields(queuedEffect);
        if (
          queuedEffect.sourcePresencePolicy !== selected.sourcePresencePolicy ||
          !queuedEffectResolvers.isSupportedQueuedOptionalEffectBlock(
            optionalSupportShape,
            selected,
          )
        ) {
          return unsupportedEffectQueueResult(originalState);
        }
        if (queuedEffect.oncePerTurn === true) {
          const oncePerTurnKey = toOncePerTurnKey({
            cardInstanceId: selected.source.instanceId,
            effectId: selected.effectBlockId,
            turnNumber: nextState.turn.globalTurn,
          });
          if (isOncePerTurnUsed(nextState, oncePerTurnKey)) {
            return unsupportedEffectQueueResult(originalState);
          }
        }
        if (!acceptedOptionalQueueEntryIds.has(selected.id)) {
          const paused = createChooseOptionalActivationDecision(
            nextState,
            selected,
          );
          return { ...paused, events: [...allEvents, ...paused.events] };
        }
        queuedEffectForBodyResolution = {
          ...optionalSupportShape,
          optional: false,
        };
        if (queuedEffectForBodyResolution.effect.type === "draw") {
          drawEffect = queuedEffectForBodyResolution.effect;
        }
      }
      const targetRequest =
        dependencies.targetDecisions.resolveQueuedTargetRequest(
          nextState,
          selected,
        );
      if (targetRequest !== undefined) {
        return dependencies.targetDecisions.createSelectTargetsDecisionForQueuedEffect(
          nextState,
          selected,
          targetRequest,
          {
            rollbackState: originalState,
            priorEvents: allEvents,
            errorCount: originalState.effectQueue.length,
          },
        );
      }
      const referencedMainEffect = queueReferencedMainEffectFromTrigger(
        nextState,
        selected,
        dependencies.resolveImplementedDslEffectDefinition,
      );
      if (referencedMainEffect !== undefined) {
        nextState = referencedMainEffect.state;
        allEvents.push(...referencedMainEffect.events);
        const cleanup = cleanupResolvedLifeTrigger(nextState, selected);
        nextState = cleanup.state;
        allEvents.push(...cleanup.events);
        continue;
      }
      const sequenceFrame = createSupportedSequenceFrameDecision(
        nextState,
        selected,
        queuedEffectForBodyResolution,
        createSupportedTrashFromHandChoiceDecision,
      );
      if (sequenceFrame !== undefined) {
        return sequenceFrame.ok
          ? toEngineResult(sequenceFrame.state, [
              ...allEvents,
              ...sequenceFrame.events,
            ])
          : sequenceFrame.error !== undefined
            ? toEngineResult(originalState, [], [sequenceFrame.error])
            : unsupportedEffectQueueResult(originalState);
      }
      const primitiveBody = resolveQueuedPrimitiveBody(
        queuedEffectForBodyResolution,
        selected,
      );
      const placement =
        primitiveBody?.kind === "placeTopDeckCards"
          ? placeTopDeck(nextState, queuedEffectForBodyResolution, selected)
          : undefined;
      if (placement !== undefined) return placement;
      const trashFromHandDecision = resolveQueuedTrashFromHandDecision(
        nextState,
        selected,
        queuedEffectResolvers.resolveQueuedEffectDefinition,
        queuedEffectForBodyResolution,
      );
      if (trashFromHandDecision?.kind === "unsupported") {
        return unsupportedEffectQueueResult(originalState);
      }
      if (trashFromHandDecision?.kind === "decision") {
        const trashDecision = createSupportedTrashFromHandChoiceDecision(
          nextState,
          selected,
          trashFromHandDecision.effect,
        );
        return trashDecision.ok
          ? toEngineResult(trashDecision.state, [
              ...allEvents,
              ...trashDecision.events,
            ])
          : unsupportedEffectQueueResult(originalState);
      }
      let moveCardsEffect =
        primitiveBody?.kind === "moveCards" ? primitiveBody.effect : undefined;
      const playSourceEffect =
        queuedEffectResolvers.resolveQueuedPlaySourceEffect(
          nextState,
          selected,
        );
      const drawUpToEffect =
        queuedEffectResolvers.resolveQueuedDrawUpToEffectBlock(
          queuedEffectForBodyResolution,
          selected,
        ) ??
        queuedEffectResolvers.resolveQueuedDrawUpToEffect(nextState, selected);
      const winGameEffect =
        primitiveBody?.kind === "winGame" ? primitiveBody.effect : undefined;
      const damageEffect =
        primitiveBody?.kind === "damage" ? primitiveBody.effect : undefined;
      const queuedContinuousEffect =
        queuedEffectResolvers.resolveQueuedContinuousEffect(
          nextState,
          selected,
        );
      let resolvedMoveCardsAsNoop = false;
      const resolvedTrashUntilAsNoop = trashFromHandDecision?.kind === "noop";
      if (
        moveCardsEffect !== undefined &&
        (moveCardsEffect.min ?? moveCardsEffect.count) < moveCardsEffect.count
      ) {
        const min = moveCardsEffect.min ?? moveCardsEffect.count;
        const max = moveCardsEffect.count;
        const resolvedQuantity = resolveQueuedQuantity(nextState, selected, {
          min,
          max,
        });
        if (resolvedQuantity === undefined) {
          const quantityDecision = createChooseQuantityDecision(
            nextState,
            selected,
            moveCardsEffect,
            { min, max },
          );
          return {
            ...quantityDecision,
            events: [...allEvents, ...quantityDecision.events],
          };
        }
        if (resolvedQuantity === 0) {
          moveCardsEffect = undefined;
          resolvedMoveCardsAsNoop = true;
        } else {
          moveCardsEffect = {
            ...moveCardsEffect,
            count: resolvedQuantity,
          };
        }
      }
      let resolutionEventsForTrigger: EngineEvent[] = [];
      let removedSelectedFromQueue = false;
      if (drawUpToEffect !== undefined) {
        const resolvedQuantity = resolveQueuedQuantity(nextState, selected, {
          min: 0,
          max: drawUpToEffect.count,
        });
        if (resolvedQuantity !== undefined) {
          const resolvingEntry: EffectQueueEntry = {
            ...selected,
            state: "resolving",
          };
          nextState = {
            ...nextState,
            effectQueue: nextState.effectQueue.filter(
              (entry) => entry.id !== selected.id,
            ),
          };
          removedSelectedFromQueue = true;
          const resolution = executeDrawPrimitiveForResolvedQuantity(
            nextState,
            resolvingEntry,
            drawUpToEffect.player,
            resolvedQuantity,
          );
          if (resolution.errors !== undefined) {
            return unsupportedEffectQueueResult(originalState);
          }
          nextState = resolution.state;
          allEvents.push(...resolution.events);
          resolutionEventsForTrigger = [...resolution.events];
        } else {
          const quantityDecision = createChooseQuantityDecision(
            nextState,
            selected,
            drawUpToEffect,
            { min: 0, max: drawUpToEffect.count },
          );
          return {
            ...quantityDecision,
            events: [...allEvents, ...quantityDecision.events],
          };
        }
      } else {
        drawEffect ??= queuedEffectResolvers.resolveQueuedDrawEffect(
          nextState,
          selected,
        );
        if (
          drawEffect === undefined &&
          moveCardsEffect === undefined &&
          !resolvedMoveCardsAsNoop &&
          !resolvedTrashUntilAsNoop &&
          playSourceEffect === undefined &&
          winGameEffect === undefined &&
          damageEffect === undefined &&
          queuedContinuousEffect === undefined
        ) {
          return unsupportedEffectQueueResult(originalState);
        }
      }
      if (queuedEffect?.oncePerTurn === true) {
        const oncePerTurnKey = toOncePerTurnKey({
          cardInstanceId: selected.source.instanceId,
          effectId: selected.effectBlockId,
          turnNumber: nextState.turn.globalTurn,
        });
        if (isOncePerTurnUsed(nextState, oncePerTurnKey)) {
          return unsupportedEffectQueueResult(originalState);
        }
        nextState = consumeOncePerTurn(nextState, oncePerTurnKey);
      }

      const resolvingEntry: EffectQueueEntry = {
        ...selected,
        state: "resolving",
      };
      if (!removedSelectedFromQueue) {
        nextState = {
          ...nextState,
          effectQueue: nextState.effectQueue.filter(
            (entry) => entry.id !== selected.id,
          ),
        };
      }

      if (drawEffect !== undefined) {
        const resolution = executeNoChoiceEffectPrimitive(
          nextState,
          resolvingEntry,
          drawEffect,
        );
        if (resolution.errors !== undefined) {
          return unsupportedEffectQueueResult(originalState);
        }
        nextState = resolution.state;
        allEvents.push(...resolution.events);
        resolutionEventsForTrigger = [...resolution.events];
      }
      if (moveCardsEffect !== undefined) {
        const resolution = executeMoveCardsPrimitive(
          nextState,
          resolvingEntry,
          moveCardsEffect,
        );
        if (resolution.errors !== undefined) {
          return unsupportedEffectQueueResult(originalState);
        }
        nextState = resolution.state;
        allEvents.push(...resolution.events);
        resolutionEventsForTrigger = [...resolution.events];
      }
      if (playSourceEffect !== undefined) {
        const resolution = applyRuntimePlaySource({
          state: nextState,
          entry: resolvingEntry,
          enterRested: playSourceEffect.enterRested === true,
          ignoreCost: true,
        });
        if (resolution.errors !== undefined) {
          return unsupportedEffectQueueResult(originalState);
        }
        if (resolution.state.pendingDecision !== undefined) {
          if (
            resolution.state.pendingDecision.type !== "selectCards" ||
            resolution.state.pendingDecision.runtime?.playSourceOverflow ===
              undefined
          ) {
            return unsupportedEffectQueueResult(originalState);
          }
          const pendingState = resolution.state.effectQueue.some(
            (entry) => entry.id === selected.id,
          )
            ? resolution.state
            : {
                ...resolution.state,
                effectQueue: [...resolution.state.effectQueue, selected],
              };
          return toEngineResult(pendingState, [
            ...allEvents,
            ...resolution.events,
          ]);
        }
        nextState = resolution.state;
        allEvents.push(...resolution.events);
        resolutionEventsForTrigger = [...resolution.events];
      }
      if (winGameEffect !== undefined) {
        const resolution = executeWinGamePrimitive(
          nextState,
          resolvingEntry,
          winGameEffect,
        );
        if (resolution.errors !== undefined) {
          return unsupportedEffectQueueResult(originalState);
        }
        nextState = resolution.state;
        allEvents.push(...resolution.events);
        resolutionEventsForTrigger = [...resolution.events];
      }
      if (damageEffect !== undefined) {
        const resolution = resolveQueuedDamagePrimitive(
          nextState,
          resolvingEntry,
          damageEffect,
          allEvents,
        );
        if (resolution.status === "unsupported") {
          return unsupportedEffectQueueResult(originalState);
        }
        if (resolution.status === "pendingDecision") {
          return resolution.result;
        }
        nextState = resolution.state;
        allEvents.push(...resolution.events);
        resolutionEventsForTrigger = [...resolution.events];
      }
      if (queuedContinuousEffect !== undefined) {
        const records = createContinuousRecordsForResolvedEffect(
          nextState,
          resolvingEntry,
          queuedContinuousEffect,
        );
        if (records === null) {
          return unsupportedEffectQueueResult(originalState);
        }
        nextState = {
          ...nextState,
          continuousEffects: [...nextState.continuousEffects, ...records],
        };
      }

      const resolvedEvents: EngineEvent[] = [];
      const resolvedEventBaseState: GameState = {
        ...nextState,
        seq: toStateSeq(nextState.seq - 1),
      };
      appendEffectResolvedEvent(
        resolvedEventBaseState,
        resolvedEvents,
        selected,
        queuedEffectForBodyResolution,
        nextState.cardManifest.cards[selected.source.cardId],
      );
      const resolvedEvent = resolvedEvents[0];
      if (resolvedEvent !== undefined) {
        nextState = {
          ...nextState,
          eventJournal: [...nextState.eventJournal, resolvedEvent],
        };
        allEvents.push(resolvedEvent);
      }

      const checkpointEvents: EngineEvent[] = [];
      const checkpointEventBaseState: GameState = {
        ...nextState,
        seq: toStateSeq(nextState.seq - 1),
      };
      nextState = applyRuleProcessingCheckpoint({
        state: nextState,
        events: checkpointEvents,
        phase: nextState.turn.phase,
        createEvent: (seqOffset, type, payload, visibility) => ({
          ...createEvent(
            checkpointEventBaseState,
            seqOffset,
            type,
            payload,
            visibility,
          ),
          causedBy: {
            type: "effect",
            queueEntryId: selected.id,
            effectId: selected.effectBlockId,
          },
        }),
      });
      if (checkpointEvents.length > 0) {
        nextState = {
          ...nextState,
          eventJournal: [...nextState.eventJournal, ...checkpointEvents],
        };
        allEvents.push(...checkpointEvents);
      }

      const cleanup = cleanupResolvedLifeTrigger(nextState, selected);
      nextState = cleanup.state;
      allEvents.push(...cleanup.events);

      if (nextState.status.type !== "active") {
        return toEngineResult(nextState, allEvents);
      }

      const triggered = dependencies.queueEffectResolvedCustomTriggers(
        nextState,
        selected,
        [...resolutionEventsForTrigger, ...resolvedEvents, ...cleanup.events],
      );
      if (triggered !== undefined) {
        if (triggered.errors !== undefined) {
          return triggered;
        }
        nextState = triggered.state;
        allEvents.push(...triggered.events);
      }
    }

    return toEngineResult(nextState, allEvents);
  };

  return { resolveQueueEntriesInOrder };
};
