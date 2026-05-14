import type {
  DecisionId,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  QueueEntryId,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    remainingDamagePoints: number;
  };
};

import {
  appendEvent,
  createEvent,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import type { EffectQueueGroup } from "./effect-queue-ordering.js";
import { createSupportedDrawThenTrashSequenceDecision } from "./effect-runtime-draw-trash-sequence.js";
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
  isSupportedEffectResolvedCustomDrawEffect,
  isSupportedQueuedNoChoiceDrawEffect,
  isSupportedQueuedOptionalNoChoiceDrawEffect,
} from "./effect-runtime-primitives.js";
import { createSupportedSearchRevealChoiceDecision } from "./effect-runtime-search-reveal.js";
import {
  createSupportedTrashFromHandChoiceDecision,
  isSupportedQueuedTrashFromHandEffect,
} from "./effect-runtime-trash-from-hand.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "./once-per-turn.js";
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
    acceptedOptionalQueueEntryIds?: readonly QueueEntryId[],
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

const isActiveDoubleAttackDamageProcess = (state: GameState): boolean =>
  (() => {
    const battle = state.battle as EngineInternalBattleState | undefined;
    return (
      battle?.damageProcess?.type === "multipleDamage" &&
      battle.damageProcess.remainingDamagePoints > 0
    );
  })();

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

  const resolveQueuedEffectDefinition = (
    state: GameState,
    entry: EffectQueueEntry,
  ): EffectDefinition["effects"][number] | undefined => {
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
    if (match === undefined) {
      return undefined;
    }
    return match;
  };

  const resolveQueuedNoChoiceDrawEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "draw" }> | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      !isSupportedQueuedNoChoiceDrawEffect(match)
    ) {
      return undefined;
    }
    return match.effect;
  };

  const resolveQueuedSearchRevealEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "search" }> | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.effect.type !== "search" ||
      match.category !== "auto" ||
      match.optional === true ||
      match.oncePerTurn === true ||
      match.condition !== undefined ||
      match.conditionTiming !== undefined ||
      match.cost !== undefined ||
      match.failurePolicy !== undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      match.sourcePresencePolicy !== "mustRemainInSameZone"
    ) {
      return undefined;
    }
    return match.effect;
  };

  const resolveQueuedTrashFromHandEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "trashFromHand" }> | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      !isSupportedQueuedTrashFromHandEffect(match)
    ) {
      return undefined;
    }
    return match.effect;
  };

  const isPublicFieldZone = (
    zone: EffectQueueEntry["source"]["zone"],
  ): boolean =>
    zone?.zone === "leaderArea" ||
    zone?.zone === "characterArea" ||
    zone?.zone === "stageArea";

  const isSupportedDamageDeferredEffectQueueEntry = (
    state: GameState,
    entry: EffectQueueEntry,
  ): boolean => {
    if (
      entry.causedBy.type !== "effect" ||
      !String(entry.causedBy.queueEntryId).startsWith(
        "queue-entry:life-trigger:",
      ) ||
      !String(entry.timingWindowId).startsWith("timing-window:life-trigger:") ||
      entry.triggerEventId === undefined ||
      entry.generation <= 0 ||
      !isPublicFieldZone(entry.source.zone) ||
      !isPublicFieldZone(entry.sourceSnapshot.zone)
    ) {
      return false;
    }
    const effect = resolveQueuedEffectDefinition(state, entry);
    return (
      effect !== undefined &&
      effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
      isSupportedEffectResolvedCustomDrawEffect(
        effect,
        `effectResolved:${String(entry.causedBy.effectId)}`,
      )
    );
  };

  const hasExactDamageDeferredQueue = (state: GameState): boolean => {
    if (state.deferredTriggers.length !== 1 || state.effectQueue.length !== 1) {
      return false;
    }
    const bucket = state.deferredTriggers[0];
    const entry = state.effectQueue[0];
    if (bucket === undefined || entry === undefined) {
      return false;
    }
    return (
      bucket.releasePolicy === "afterCurrentProcess" &&
      bucket.triggerIds.length === 1 &&
      bucket.triggerIds[0] === String(entry.id) &&
      bucket.timingWindowId === entry.timingWindowId &&
      bucket.generation === entry.generation &&
      entry.state === "pending" &&
      isSupportedDamageDeferredEffectQueueEntry(state, entry)
    );
  };

  const createChooseOptionalActivationDecision = (
    state: GameState,
    entry: EffectQueueEntry,
  ): EngineResult => {
    const decisionId =
      `decision:chooseOptionalActivation:${String(entry.id)}` as DecisionId;
    const causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    } as const;
    const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
      id: decisionId,
      type: "chooseOptionalActivation",
      playerId: entry.controllerId,
      prompt: "Choose whether to activate this effect.",
      causedBy,
      visibility: { type: "private", playerId: entry.controllerId },
      effectId: entry.effectBlockId,
      source: entry.source,
      options: ["activate", "decline"],
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
      { type: "private", playerId: entry.controllerId },
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
      const queuedEffect = resolveQueuedEffectDefinition(nextState, selected);
      let drawEffect: Extract<Effect, { type: "draw" }> | undefined;
      if (queuedEffect?.optional === true) {
        if (
          queuedEffect.sourcePresencePolicy !== selected.sourcePresencePolicy ||
          !isSupportedQueuedOptionalNoChoiceDrawEffect(queuedEffect)
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
          drawEffect = queuedEffect.effect;
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
      const drawTrashSequence = createSupportedDrawThenTrashSequenceDecision(
        nextState,
        selected,
        queuedEffect,
      );
      if (drawTrashSequence !== undefined) {
        return drawTrashSequence.ok
          ? toEngineResult(drawTrashSequence.state, [
              ...allEvents,
              ...drawTrashSequence.events,
            ])
          : unsupportedEffectQueueResult(originalState);
      }
      const searchEffect = resolveQueuedSearchRevealEffect(nextState, selected);
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
        appendEvent(
          searchDecision.state,
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
      const trashFromHandEffect = resolveQueuedTrashFromHandEffect(
        nextState,
        selected,
      );
      if (trashFromHandEffect !== undefined) {
        const trashDecision = createSupportedTrashFromHandChoiceDecision(
          nextState,
          selected,
          trashFromHandEffect,
        );
        return trashDecision.ok
          ? toEngineResult(trashDecision.state, [
              ...allEvents,
              ...trashDecision.events,
            ])
          : unsupportedEffectQueueResult(originalState);
      }
      drawEffect ??= resolveQueuedNoChoiceDrawEffect(nextState, selected);
      if (drawEffect === undefined) {
        return unsupportedEffectQueueResult(originalState);
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
    acceptedOptionalQueueEntryIds: readonly QueueEntryId[] = [],
  ): EngineResult => {
    if (state.pendingDecision !== undefined) {
      return toEngineResult(state, []);
    }
    if (
      state.deferredTriggers.length > 0 &&
      isActiveDoubleAttackDamageProcess(state)
    ) {
      return hasExactDamageDeferredQueue(state)
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

  return {
    processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice,
  };
};
