import type {
  DecisionId,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  QueueEntryId,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import type { EffectQueueGroup } from "./effect-queue-ordering.js";
import { cleanupResolvedLifeTrigger } from "./effect-runtime-life-trigger-cleanup.js";
import {
  evaluateQueueOrdering,
  orderNoChoiceQueueEntries,
} from "./effect-runtime-queue-ordering.js";
import { evaluateQueuedEffectSourcePresence } from "./effect-runtime-queue-source-presence.js";
import type {
  CreateUnsupportedPendingRuntimeWorkError,
  EffectRuntimeQueueTargetDecisions,
  ResolveImplementedDslEffectDefinition,
} from "./effect-runtime-queue-target-decisions.js";
import {
  executeNoChoiceEffectPrimitive,
  isSupportedQueuedNoChoiceDrawEffect,
} from "./effect-runtime-primitives.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

export type QueueEffectResolvedCustomTriggers = (
  state: GameState,
  entry: EffectQueueEntry,
  events: readonly EngineEvent[],
) => EngineResult | undefined;

export interface EffectRuntimeQueueResultsDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError;
  queueEffectResolvedCustomTriggers: QueueEffectResolvedCustomTriggers;
  targetDecisions: EffectRuntimeQueueTargetDecisions;
}

export interface EffectRuntimeQueueResults {
  processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  ) => EngineResult;
  processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ) => EngineResult;
}

const hasExactIds = (
  expectedIds: readonly QueueEntryId[],
  receivedIds: readonly QueueEntryId[],
): boolean => {
  if (expectedIds.length !== receivedIds.length) {
    return false;
  }
  if (new Set(receivedIds).size !== receivedIds.length) {
    return false;
  }
  const expected = new Set(expectedIds);
  return receivedIds.every((id) => expected.has(id));
};

export const createEffectRuntimeQueueResults = (
  dependencies: EffectRuntimeQueueResultsDependencies,
): EffectRuntimeQueueResults => {
  const unsupportedEffectQueueResult = (state: GameState): EngineResult =>
    toEngineResult(
      state,
      [],
      [
        dependencies.createUnsupportedPendingRuntimeWorkError({
          kind: "effectQueue",
          count: state.effectQueue.length,
        }),
      ],
    );

  const resolveQueuedNoChoiceDrawEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "draw" }> | undefined => {
    const resolved = state.cardManifest.cards[entry.source.cardId];
    if (resolved === undefined) {
      return undefined;
    }
    const lookup = dependencies.resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return undefined;
    }
    const match = lookup.definition.effects.find(
      (effect) => effect.id === entry.effectBlockId,
    );
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      !isSupportedQueuedNoChoiceDrawEffect(match)
    ) {
      return undefined;
    }
    return match.effect;
  };

  const resolveQueueEntriesInOrder = (
    state: GameState,
    entries: readonly EffectQueueEntry[],
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
      const drawEffect = resolveQueuedNoChoiceDrawEffect(nextState, selected);
      if (drawEffect === undefined) {
        return unsupportedEffectQueueResult(originalState);
      }

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

      const resolvedEvents: EngineEvent[] = [];
      const resolvedEventBaseState: GameState = {
        ...nextState,
        seq: toStateSeq(nextState.seq - 1),
      };
      appendEvent(
        resolvedEventBaseState,
        resolvedEvents,
        "effectResolved",
        {
          queueEntryId: selected.id,
          timingWindowId: selected.timingWindowId,
          generation: selected.generation,
          effectBlockId: selected.effectBlockId,
          ...(selected.triggerEventId !== undefined
            ? { triggerEventId: selected.triggerEventId }
            : {}),
          sourcePresencePolicy: selected.sourcePresencePolicy,
          orderingGroup: selected.orderingGroup,
          status: "resolved" as const,
        },
        { type: "public" },
      );
      const resolvedEvent = resolvedEvents[0];
      if (resolvedEvent !== undefined) {
        resolvedEvent.causedBy = {
          type: "effect",
          queueEntryId: selected.id,
          effectId: selected.effectBlockId,
        };
      }
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
        [...resolution.events, ...resolvedEvents, ...cleanup.events],
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

  const createChooseTriggerOrderDecision = (
    state: GameState,
    earliestChoiceGroup: EffectQueueGroup,
  ): EngineResult => {
    const triggerIds = earliestChoiceGroup.entries.map((entry) => entry.id);
    const decisionId =
      `decision:chooseTriggerOrder:${earliestChoiceGroup.timingWindowId}:${String(
        earliestChoiceGroup.generation,
      )}:${earliestChoiceGroup.orderingGroup}:${earliestChoiceGroup.controllerId}` as DecisionId;
    const causedBy = {
      type: "ruleProcess",
      name: "effectRuntime:chooseTriggerOrder",
    } as const;
    const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
      id: decisionId,
      type: "chooseTriggerOrder",
      playerId: earliestChoiceGroup.controllerId,
      prompt: "Choose trigger resolution order.",
      causedBy,
      visibility: { type: "public" },
      triggerIds,
      constraints: { mustUseAll: true },
    };
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: pendingDecision.id,
        decisionType: pendingDecision.type,
        playerId: pendingDecision.playerId,
      },
      { type: "public" },
    );
    const created = events[0];
    if (created !== undefined) {
      created.causedBy = causedBy;
    }
    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    };
    return toEngineResult(nextState, events);
  };

  const processNoChoiceEffectQueue = (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  ): EngineResult => {
    if (state.pendingDecision !== undefined) {
      return toEngineResult(state, []);
    }
    const ordering = evaluateQueueOrdering(state.effectQueue);
    if (!ordering.ok) {
      return unsupportedEffectQueueResult(state);
    }

    const earliestChoiceGroup = ordering.earliestChoiceGroup;
    if (earliestChoiceGroup !== undefined) {
      if (orderedCurrentChoiceGroupIds !== undefined) {
        const expectedIds = earliestChoiceGroup.entries.map(
          (entry) => entry.id,
        );
        if (!hasExactIds(expectedIds, orderedCurrentChoiceGroupIds)) {
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
        const resolved = resolveQueueEntriesInOrder(state, selectedEntries);
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
    const resolved = resolveQueueEntriesInOrder(state, [firstEntry]);
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

  return {
    processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice,
  };
};
