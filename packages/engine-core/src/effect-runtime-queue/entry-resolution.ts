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
  type EngineResultOptions,
  replaceEngineResultEvents,
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
  canAdmitOncePerTurnEffect,
  consumeOncePerTurnForQueueEntry,
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

const replaceEffectQueueEntry = (
  state: GameState,
  replacement: EffectQueueEntry,
): GameState => ({
  ...state,
  effectQueue: state.effectQueue.map((entry) =>
    entry.id === replacement.id ? replacement : entry,
  ),
});

export interface QueueEntryResolver {
  readonly resolveQueueEntriesInOrder: (
    state: GameState,
    entries: readonly EffectQueueEntry[],
    acceptedOptionalQueueEntryIds?: ReadonlySet<QueueEntryId>,
    options?: EngineResultOptions,
  ) => EngineResult;
}

export const createQueueEntryResolver = (
  dependencies: EffectRuntimeQueueResultsDependencies,
): QueueEntryResolver => {
  const queuedEffectResolvers = createQueuedEffectResolvers(dependencies);

  const resolveQueueEntriesInOrder = (
    state: GameState,
    entries: readonly EffectQueueEntry[],
    acceptedOptionalQueueEntryIds: ReadonlySet<QueueEntryId> = new Set(),
    options: EngineResultOptions = {},
  ): EngineResult => {
    const originalState = state;
    const unsupportedEffectQueueResult = (
      state: GameState,
      context?: Parameters<typeof createUnsupportedEffectQueueResult>[3],
    ): EngineResult =>
      createUnsupportedEffectQueueResult(
        state,
        dependencies.createUnsupportedPendingRuntimeWorkError,
        options,
        context,
      );
    let nextState = state;
    const allEvents: EngineEvent[] = [];
    for (const selected of entries) {
      const sourcePresence = evaluateQueuedEffectSourcePresence(
        nextState,
        selected,
      );
      if (!sourcePresence.ok) {
        return unsupportedEffectQueueResult(originalState, {
          gate: "queue-source-presence",
          entry: selected,
          exposeEntryIdentity: false,
          queueReason: "source-presence-failed",
        });
      }
      const queuedEffect = queuedEffectResolvers.resolveQueuedEffectDefinition(
        nextState,
        selected,
      );
      if (queuedEffect?.conditionTiming !== undefined) {
        return unsupportedEffectQueueResult(originalState, {
          gate: "queue-entry-resolution",
          entry: selected,
          exposeEntryIdentity: true,
          queueReason: "unsupported-condition-timing",
        });
      }
      const conditionResult = evaluateQueuedEffectCondition(
        nextState,
        selected,
        queuedEffect?.condition,
      );
      if (!conditionResult.supported) {
        return unsupportedEffectQueueResult(originalState, {
          gate: "queue-entry-resolution",
          entry: selected,
          exposeEntryIdentity: true,
          queueReason: "unsupported-condition",
        });
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
      let selectedForBodyResolution = selected;
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selected,
            exposeEntryIdentity: true,
            queueReason: "unsupported-optional-shape",
          });
        }
        if (!canAdmitOncePerTurnEffect(nextState, selected, queuedEffect)) {
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selected,
            exposeEntryIdentity: true,
            queueReason: "once-per-turn-admission-failed",
          });
        }
        if (!acceptedOptionalQueueEntryIds.has(selected.id)) {
          const paused = createChooseOptionalActivationDecision(
            nextState,
            selected,
            options,
          );
          return replaceEngineResultEvents(
            paused,
            [...allEvents, ...paused.events],
            options,
          );
        }
        queuedEffectForBodyResolution = {
          ...optionalSupportShape,
          optional: false,
        };
        selectedForBodyResolution = {
          ...selected,
          effectBlockOverride: queuedEffectForBodyResolution,
        };
        nextState = replaceEffectQueueEntry(
          nextState,
          selectedForBodyResolution,
        );
        if (queuedEffectForBodyResolution.effect.type === "draw") {
          drawEffect = queuedEffectForBodyResolution.effect;
        }
      }
      const targetRequest =
        dependencies.targetDecisions.resolveQueuedTargetRequest(
          nextState,
          selectedForBodyResolution,
        );
      if (targetRequest !== undefined) {
        return dependencies.targetDecisions.createSelectTargetsDecisionForQueuedEffect(
          nextState,
          selectedForBodyResolution,
          targetRequest,
          {
            rollbackState: originalState,
            priorEvents: allEvents,
            errorCount: originalState.effectQueue.length,
            ...options,
          },
        );
      }
      const referencedMainEffect = queueReferencedMainEffectFromTrigger(
        nextState,
        selectedForBodyResolution,
        dependencies.resolveImplementedDslEffectDefinition,
      );
      if (referencedMainEffect !== undefined) {
        nextState = referencedMainEffect.state;
        allEvents.push(...referencedMainEffect.events);
        const cleanup = cleanupResolvedLifeTrigger(
          nextState,
          selectedForBodyResolution,
        );
        nextState = cleanup.state;
        allEvents.push(...cleanup.events);
        continue;
      }
      const sequenceFrame = createSupportedSequenceFrameDecision(
        nextState,
        selectedForBodyResolution,
        queuedEffectForBodyResolution,
        createSupportedTrashFromHandChoiceDecision,
      );
      if (sequenceFrame !== undefined) {
        return sequenceFrame.ok
          ? toEngineResult(
              sequenceFrame.state,
              [...allEvents, ...sequenceFrame.events],
              undefined,
              options,
            )
          : sequenceFrame.error !== undefined
            ? toEngineResult(originalState, [], [sequenceFrame.error], options)
            : unsupportedEffectQueueResult(originalState, {
                gate: "queue-entry-resolution",
                entry: selectedForBodyResolution,
                exposeEntryIdentity: true,
                queueReason: "unsupported-sequence-frame",
              });
      }
      const primitiveBody = resolveQueuedPrimitiveBody(
        queuedEffectForBodyResolution,
        selectedForBodyResolution,
      );
      const placement =
        primitiveBody?.kind === "placeTopDeckCards"
          ? placeTopDeck(
              nextState,
              queuedEffectForBodyResolution,
              selectedForBodyResolution,
            )
          : undefined;
      if (placement !== undefined) return placement;
      const trashFromHandDecision = resolveQueuedTrashFromHandDecision(
        nextState,
        selectedForBodyResolution,
        queuedEffectResolvers.resolveQueuedEffectDefinition,
        queuedEffectForBodyResolution,
      );
      if (trashFromHandDecision?.kind === "unsupported") {
        return unsupportedEffectQueueResult(originalState, {
          gate: "queue-entry-resolution",
          entry: selectedForBodyResolution,
          exposeEntryIdentity: true,
          queueReason: "unsupported-trash-from-hand",
        });
      }
      if (trashFromHandDecision?.kind === "decision") {
        const trashDecision = createSupportedTrashFromHandChoiceDecision(
          nextState,
          selectedForBodyResolution,
          trashFromHandDecision.effect,
        );
        return trashDecision.ok
          ? toEngineResult(
              trashDecision.state,
              [...allEvents, ...trashDecision.events],
              undefined,
              options,
            )
          : unsupportedEffectQueueResult(originalState, {
              gate: "queue-entry-resolution",
              entry: selectedForBodyResolution,
              exposeEntryIdentity: true,
              queueReason: "unsupported-trash-from-hand",
            });
      }
      let moveCardsEffect =
        primitiveBody?.kind === "moveCards" ? primitiveBody.effect : undefined;
      const playSourceEffect =
        queuedEffectResolvers.resolveQueuedPlaySourceEffect(
          nextState,
          selectedForBodyResolution,
        );
      const drawUpToEffect =
        queuedEffectResolvers.resolveQueuedDrawUpToEffectBlock(
          queuedEffectForBodyResolution,
          selectedForBodyResolution,
        ) ??
        queuedEffectResolvers.resolveQueuedDrawUpToEffect(
          nextState,
          selectedForBodyResolution,
        );
      const winGameEffect =
        primitiveBody?.kind === "winGame" ? primitiveBody.effect : undefined;
      const damageEffect =
        primitiveBody?.kind === "damage" ? primitiveBody.effect : undefined;
      const queuedContinuousEffect =
        queuedEffectResolvers.resolveQueuedContinuousEffect(
          nextState,
          selectedForBodyResolution,
        );
      let resolvedMoveCardsAsNoop = false;
      const resolvedTrashUntilAsNoop = trashFromHandDecision?.kind === "noop";
      if (
        moveCardsEffect !== undefined &&
        typeof moveCardsEffect.count === "number" &&
        (moveCardsEffect.min ?? moveCardsEffect.count) < moveCardsEffect.count
      ) {
        const min = moveCardsEffect.min ?? moveCardsEffect.count;
        const max = moveCardsEffect.count;
        const resolvedQuantity = resolveQueuedQuantity(
          nextState,
          selectedForBodyResolution,
          { min, max },
        );
        if (resolvedQuantity === undefined) {
          const quantityDecision = createChooseQuantityDecision(
            nextState,
            selectedForBodyResolution,
            moveCardsEffect,
            { min, max },
            options,
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
        const resolvedQuantity = resolveQueuedQuantity(
          nextState,
          selectedForBodyResolution,
          {
            min: 0,
            max: drawUpToEffect.count,
          },
        );
        if (resolvedQuantity !== undefined) {
          const resolvingEntry: EffectQueueEntry = {
            ...selectedForBodyResolution,
            state: "resolving",
          };
          nextState = {
            ...nextState,
            effectQueue: nextState.effectQueue.filter(
              (entry) => entry.id !== selectedForBodyResolution.id,
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
            return unsupportedEffectQueueResult(originalState, {
              gate: "queue-entry-resolution",
              entry: selectedForBodyResolution,
              exposeEntryIdentity: true,
              queueReason: "unsupported-draw",
            });
          }
          nextState = resolution.state;
          allEvents.push(...resolution.events);
          resolutionEventsForTrigger = [...resolution.events];
        } else {
          const quantityDecision = createChooseQuantityDecision(
            nextState,
            selectedForBodyResolution,
            drawUpToEffect,
            { min: 0, max: drawUpToEffect.count },
            options,
          );
          return {
            ...quantityDecision,
            events: [...allEvents, ...quantityDecision.events],
          };
        }
      } else {
        drawEffect ??= queuedEffectResolvers.resolveQueuedDrawEffect(
          nextState,
          selectedForBodyResolution,
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-body",
          });
        }
      }
      if (queuedEffect !== undefined) {
        if (
          !canAdmitOncePerTurnEffect(
            nextState,
            selectedForBodyResolution,
            queuedEffect,
          )
        ) {
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "once-per-turn-admission-failed",
          });
        }
        nextState = consumeOncePerTurnForQueueEntry(
          nextState,
          selectedForBodyResolution,
          queuedEffect,
        );
      }

      const resolvingEntry: EffectQueueEntry = {
        ...selectedForBodyResolution,
        state: "resolving",
      };
      if (!removedSelectedFromQueue) {
        nextState = {
          ...nextState,
          effectQueue: nextState.effectQueue.filter(
            (entry) => entry.id !== selectedForBodyResolution.id,
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-draw",
          });
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-move-cards",
          });
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-play-source",
          });
        }
        if (resolution.state.pendingDecision !== undefined) {
          if (
            resolution.state.pendingDecision.type !== "selectCards" ||
            resolution.state.pendingDecision.runtime?.playSourceOverflow ===
              undefined
          ) {
            return unsupportedEffectQueueResult(originalState, {
              gate: "queue-entry-resolution",
              entry: selectedForBodyResolution,
              exposeEntryIdentity: true,
              queueReason: "unsupported-play-source",
            });
          }
          const pendingState = resolution.state.effectQueue.some(
            (entry) => entry.id === selectedForBodyResolution.id,
          )
            ? resolution.state
            : {
                ...resolution.state,
                effectQueue: [
                  ...resolution.state.effectQueue,
                  selectedForBodyResolution,
                ],
              };
          return toEngineResult(
            pendingState,
            [...allEvents, ...resolution.events],
            undefined,
            options,
          );
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-win-game",
          });
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
          options,
        );
        if (resolution.status === "unsupported") {
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-damage",
          });
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
          return unsupportedEffectQueueResult(originalState, {
            gate: "queue-entry-resolution",
            entry: selectedForBodyResolution,
            exposeEntryIdentity: true,
            queueReason: "unsupported-continuous",
          });
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
        selectedForBodyResolution,
        queuedEffectForBodyResolution,
        nextState.cardManifest.cards[selectedForBodyResolution.source.cardId],
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
            queueEntryId: selectedForBodyResolution.id,
            effectId: selectedForBodyResolution.effectBlockId,
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

      const cleanup = cleanupResolvedLifeTrigger(
        nextState,
        selectedForBodyResolution,
      );
      nextState = cleanup.state;
      allEvents.push(...cleanup.events);

      if (nextState.status.type !== "active") {
        return toEngineResult(nextState, allEvents, undefined, options);
      }

      const triggered = dependencies.queueEffectResolvedCustomTriggers(
        nextState,
        selectedForBodyResolution,
        [...resolutionEventsForTrigger, ...resolvedEvents, ...cleanup.events],
        options,
      );
      if (triggered !== undefined) {
        if (triggered.errors !== undefined) {
          return triggered;
        }
        nextState = triggered.state;
        allEvents.push(...triggered.events);
      }
    }

    return toEngineResult(nextState, allEvents, undefined, options);
  };

  return { resolveQueueEntriesInOrder };
};
