import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  SelectCardsDecision,
  QueueEntryId,
} from "@optcg/types";
import {
  appendEffectResolvedEvent,
  createEvent,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { findFirstNoChoiceEffectQueueEntryBeforeChoiceGroup } from "./group-ordering.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { cleanupResolvedLifeTrigger } from "../effect-runtime-life-trigger-cleanup.js";
import {
  evaluateQueueOrdering,
  orderNoChoiceQueueEntries,
} from "./ordering.js";
import { hasUniqueQueueEntryIdsWithin } from "./id-matching.js";
import { evaluateQueuedEffectSourcePresence } from "./source-presence.js";
import { createChooseTriggerOrderDecision } from "../effect-runtime-trigger-order-decision.js";
import {
  executeDrawPrimitiveForResolvedQuantity,
  executeNoChoiceEffectPrimitive,
  executeWinGamePrimitive,
  isSupportedDamageEffect,
  isSupportedQueuedWinGameEffect,
} from "../runtime/primitives/execute.js";
import { queueReferencedMainEffectFromTrigger } from "../effect-runtime-activate-referenced-effect.js";
import { createContinuousRecordsForResolvedEffect } from "../runtime/continuous/continuous.js";
import {
  executeMoveCardsPrimitive,
  resolveSupportedQueuedMoveCardsEffect as resolveMoveCardsEffect,
} from "../effect-runtime-move-cards.js";
import { createQueuedTopDeckPlacementDecision as placeTopDeck } from "../effect-runtime-top-deck-placement.js";
import { createSupportedSearchRevealChoiceDecision } from "../effect-runtime-search-reveal.js";
import { createSupportedSequenceFrameDecision } from "../effect-runtime-sequence/frames.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";
import { resolveQueuedTrashFromHandDecision } from "./trash-from-hand.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../rules/once-per-turn.js";
import { applyRuntimePlaySource } from "../play-card/core.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import {
  createChooseOptionalActivationDecision,
  createChooseQuantityDecision,
} from "./choice-decisions.js";
import { resumePlaySourceOverflowDecision as resumePlaySourceOverflowDecisionHelper } from "../effect-runtime-play-source-overflow-resume.js";
import {
  hasExactDamageDeferredQueue,
  isActiveDoubleAttackDamageProcess,
} from "../effect-runtime-damage-deferred-queue.js";
import { resolveQueuedDamagePrimitive } from "./damage.js";
import { createQueuedEffectResolvers } from "./effect-resolution.js";
import { resolveQueuedQuantity } from "./quantity-resolution.js";
import type {
  EffectRuntimeQueueResults,
  EffectRuntimeQueueResultsDependencies,
} from "./results-types.js";
import { createUnsupportedEffectQueueResult } from "./unsupported.js";

export const createEffectRuntimeQueueResults = (
  dependencies: EffectRuntimeQueueResultsDependencies,
): EffectRuntimeQueueResults => {
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
      let drawEffect: Extract<Effect, { type: "draw" }> | undefined;
      if (queuedEffect?.optional === true) {
        const optionalSupportShape =
          queuedEffectResolvers.withoutConditionFields(queuedEffect);
        if (
          queuedEffect.sourcePresencePolicy !== selected.sourcePresencePolicy ||
          (!queuedEffectResolvers.isSupportedQueuedOptionalDrawEffectBlock(
            optionalSupportShape,
          ) &&
            !queuedEffectResolvers.canResolveQueuedDrawFromActivateMainEntry(
              optionalSupportShape,
              selected,
            ))
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
        if (acceptedOptionalQueueEntryIds.has(selected.id)) {
          drawEffect = optionalSupportShape.effect;
        } else {
          const paused = createChooseOptionalActivationDecision(
            nextState,
            selected,
          );
          return { ...paused, events: [...allEvents, ...paused.events] };
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
        queuedEffect,
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
      const searchEffect =
        queuedEffectResolvers.resolveQueuedSearchRevealEffect(
          nextState,
          selected,
        );
      if (searchEffect !== undefined) {
        const searchDecision = createSupportedSearchRevealChoiceDecision(
          nextState,
          selected,
          searchEffect,
        );
        if (!searchDecision.ok) {
          return unsupportedEffectQueueResult(originalState);
        }
        if (searchDecision.kind === "decisionCreated") {
          return toEngineResult(searchDecision.state, [
            ...allEvents,
            ...searchDecision.events,
          ]);
        }

        const resolvedEvents: EngineEvent[] = [];
        appendEffectResolvedEvent(
          searchDecision.state,
          resolvedEvents,
          selected,
        );
        const resolvedEvent = resolvedEvents[0];
        if (resolvedEvent !== undefined) {
          nextState = {
            ...searchDecision.state,
            seq: toStateSeq(searchDecision.state.seq + 1),
            effectQueue: searchDecision.state.effectQueue.filter(
              (entry) => entry.id !== selected.id,
            ),
            eventJournal: [...searchDecision.state.eventJournal, resolvedEvent],
          };
          allEvents.push(...searchDecision.events, resolvedEvent);
        }
        continue;
      }
      const placement = placeTopDeck(nextState, queuedEffect, selected);
      if (placement !== undefined) return placement;
      const trashFromHandDecision = resolveQueuedTrashFromHandDecision(
        nextState,
        selected,
        queuedEffectResolvers.resolveQueuedEffectDefinition,
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
      let moveCardsEffect = resolveMoveCardsEffect(queuedEffect, selected);
      const playSourceEffect =
        queuedEffectResolvers.resolveQueuedPlaySourceEffect(
          nextState,
          selected,
        );
      const drawUpToEffect = queuedEffectResolvers.resolveQueuedDrawUpToEffect(
        nextState,
        selected,
      );
      const winGameEffect =
        queuedEffect !== undefined &&
        queuedEffect.sourcePresencePolicy === selected.sourcePresencePolicy &&
        isSupportedQueuedWinGameEffect(queuedEffect)
          ? queuedEffect.effect
          : undefined;
      const damageEffect =
        queuedEffect !== undefined &&
        queuedEffect.sourcePresencePolicy === selected.sourcePresencePolicy &&
        isSupportedDamageEffect(queuedEffect.effect)
          ? queuedEffect.effect
          : undefined;
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

  const processNoChoiceEffectQueue = (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
    acceptedOptionalQueueEntryIds: readonly QueueEntryId[] = [],
  ): EngineResult => {
    if (state.pendingDecision !== undefined) {
      return toEngineResult(state, []);
    }
    if (
      state.deferredTriggers.length > 0 &&
      isActiveDoubleAttackDamageProcess(state)
    ) {
      return hasExactDamageDeferredQueue(
        state,
        queuedEffectResolvers.resolveQueuedEffectDefinition,
      )
        ? toEngineResult(state, [])
        : unsupportedEffectQueueResult(state);
    }
    const ordering = evaluateQueueOrdering(state.effectQueue);
    if (!ordering.ok) {
      return unsupportedEffectQueueResult(state);
    }

    const earliestChoiceGroup = ordering.earliestChoiceGroup;
    if (
      acceptedOptionalQueueEntryIds.length > 0 &&
      orderedCurrentChoiceGroupIds === undefined
    ) {
      const acceptedOptionalIds = new Set(acceptedOptionalQueueEntryIds);
      const acceptedEntry = state.effectQueue.find((entry) =>
        acceptedOptionalIds.has(entry.id),
      );
      if (acceptedEntry === undefined) {
        return unsupportedEffectQueueResult(state);
      }
      const resolved = resolveQueueEntriesInOrder(
        state,
        [acceptedEntry],
        acceptedOptionalIds,
      );
      if (
        resolved.errors !== undefined ||
        resolved.state.status.type !== "active"
      ) {
        return resolved;
      }
      const continued = processNoChoiceEffectQueue(resolved.state);
      return {
        ...continued,
        events: [...resolved.events, ...continued.events],
      };
    }
    if (earliestChoiceGroup !== undefined) {
      if (orderedCurrentChoiceGroupIds !== undefined) {
        const expectedIds = earliestChoiceGroup.entries.map(
          (entry) => entry.id,
        );
        if (
          !hasUniqueQueueEntryIdsWithin(
            expectedIds,
            orderedCurrentChoiceGroupIds,
          )
        ) {
          return unsupportedEffectQueueResult(state);
        }
        const selectedById = new Map(
          earliestChoiceGroup.entries.map((entry) => [entry.id, entry]),
        );
        const selectedEntries = orderedCurrentChoiceGroupIds.map((id) => {
          const entry = selectedById.get(id);
          if (entry === undefined) {
            throw new Error("Ordered choice id missing from validated group.");
          }
          return entry;
        });
        const acceptedOptionalIds = new Set(acceptedOptionalQueueEntryIds);
        const resolved = resolveQueueEntriesInOrder(
          state,
          selectedEntries,
          acceptedOptionalIds,
        );
        if (
          resolved.errors !== undefined ||
          resolved.state.status.type !== "active"
        ) {
          return resolved;
        }
        const continued = processNoChoiceEffectQueue(resolved.state);
        return {
          ...continued,
          events: [...resolved.events, ...continued.events],
        };
      }
      const noChoiceBeforeChoice =
        findFirstNoChoiceEffectQueueEntryBeforeChoiceGroup(
          ordering.groups,
          earliestChoiceGroup,
        );
      if (noChoiceBeforeChoice !== undefined) {
        const resolved = resolveQueueEntriesInOrder(
          state,
          [noChoiceBeforeChoice],
          new Set(acceptedOptionalQueueEntryIds),
        );
        if (
          resolved.errors !== undefined ||
          resolved.state.status.type !== "active"
        ) {
          return resolved;
        }
        const continued = processNoChoiceEffectQueue(resolved.state);
        return {
          ...continued,
          events: [...resolved.events, ...continued.events],
        };
      }
      return createChooseTriggerOrderDecision(state, earliestChoiceGroup);
    }

    const ordered = orderNoChoiceQueueEntries(ordering.groups);
    if (!ordered.ok) {
      return unsupportedEffectQueueResult(state);
    }

    const firstEntry = ordered.entries[0];
    if (firstEntry === undefined) {
      return toEngineResult(state, []);
    }
    const resolved = resolveQueueEntriesInOrder(
      state,
      [firstEntry],
      new Set(acceptedOptionalQueueEntryIds),
    );
    if (
      resolved.errors !== undefined ||
      resolved.state.status.type !== "active"
    ) {
      return resolved;
    }
    const continued = processNoChoiceEffectQueue(resolved.state);
    return {
      ...continued,
      events: [...resolved.events, ...continued.events],
    };
  };

  const processEffectRuntimeAfterTriggerOrderChoice = (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ): EngineResult => processNoChoiceEffectQueue(state, orderedIds);

  const resumePlaySourceOverflowDecision = (
    originalState: GameState,
    decision: SelectCardsDecision,
    playCardResult: EngineResult,
  ): EngineResult | undefined =>
    resumePlaySourceOverflowDecisionHelper({
      originalState,
      decision,
      playCardResult,
      createUnsupportedPendingRuntimeWorkError:
        dependencies.createUnsupportedPendingRuntimeWorkError,
      queueEffectResolvedCustomTriggers:
        dependencies.queueEffectResolvedCustomTriggers,
    });

  return {
    processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice,
    resumePlaySourceOverflowDecision,
  };
};
