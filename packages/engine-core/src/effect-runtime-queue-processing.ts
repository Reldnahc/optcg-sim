import type {
  CardInstance,
  DecisionId,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  MatchCardManifest,
  QueueEntryId,
  ResolvedCard,
  Target,
  TargetRequest,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";
import {
  findEarliestChoiceRequiredEffectQueueGroup,
  groupValidatedEffectQueueEntries,
  orderNoChoiceEffectQueueGroups,
  validateEffectQueueOrderingInput,
} from "./effect-queue-ordering.js";
import {
  executeNoChoiceEffectPrimitive,
  isSupportedQueuedNoChoiceDrawEffect,
  resolvePlayerId,
} from "./effect-runtime-primitives.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";
import { evaluateQueuedEffectSourcePresence } from "./source-presence.js";
import { resolvePublicTargetCandidates } from "./target-selection.js";

type EffectQueuePendingRuntimeWork = {
  kind: "effectQueue";
  count: number;
};

type ResolveImplementedDslEffectDefinition = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
) =>
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

type QueueEffectResolvedCustomTriggers = (
  state: GameState,
  entry: EffectQueueEntry,
  events: readonly EngineEvent[],
) => EngineResult | undefined;

export interface EffectRuntimeQueueProcessingDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: (
    work: EffectQueuePendingRuntimeWork,
  ) => EngineError;
  queueEffectResolvedCustomTriggers: QueueEffectResolvedCustomTriggers;
}

export interface EffectRuntimeQueueProcessing {
  failUnsupportedTargetEffectContinuation: (state: GameState) => EngineResult;
  processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  ) => EngineResult;
  processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ) => EngineResult;
}

const isSupportedTargetChoiceEffectShape = (
  effect: EffectDefinition["effects"][number],
): boolean => {
  if (effect.category !== "auto") {
    return false;
  }
  if (effect.optional || effect.oncePerTurn) {
    return false;
  }
  return (
    effect.cost === undefined &&
    effect.condition === undefined &&
    effect.conditionTiming === undefined &&
    effect.failurePolicy === undefined &&
    targetRequestForEffect(effect.effect) !== undefined
  );
};

type EffectWithTarget = Extract<Effect, { target: unknown }>;

const isChooseTarget = (
  target: EffectWithTarget["target"],
): target is Extract<Target, { type: "choose" }> =>
  typeof target === "object" && "type" in target && target.type === "choose";

const targetRequestForEffect = (effect: Effect): TargetRequest | undefined => {
  if (!("target" in effect)) {
    return undefined;
  }
  return isChooseTarget(effect.target) ? effect.target.request : undefined;
};

const inferTimingWindowRanks = (
  entries: readonly EffectQueueEntry[],
): Array<{
  timingWindowId: EffectQueueEntry["timingWindowId"];
  rank: number;
}> => {
  const minCreatedAtSeqByWindow = new Map<
    EffectQueueEntry["timingWindowId"],
    number
  >();
  for (const entry of entries) {
    const existing = minCreatedAtSeqByWindow.get(entry.timingWindowId);
    if (existing === undefined || entry.createdAtEventSeq < existing) {
      minCreatedAtSeqByWindow.set(
        entry.timingWindowId,
        entry.createdAtEventSeq,
      );
    }
  }

  return [...minCreatedAtSeqByWindow.entries()]
    .sort((left, right) => {
      const seqDifference = left[1] - right[1];
      if (seqDifference !== 0) {
        return seqDifference;
      }
      if (left[0] < right[0]) {
        return -1;
      }
      if (left[0] > right[0]) {
        return 1;
      }
      return 0;
    })
    .map(([timingWindowId], rank) => ({ timingWindowId, rank }));
};

const isLifeTriggerResolutionEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): boolean => {
  const isNoZoneSource =
    entry.source.zone?.zone === "noZone" ||
    entry.sourceSnapshot.zone.zone === "noZone";
  if (!isNoZoneSource) {
    return false;
  }
  if (
    !String(entry.id).startsWith("queue-entry:life-trigger:") ||
    !String(entry.timingWindowId).startsWith("timing-window:life-trigger:")
  ) {
    return false;
  }
  if (entry.causedBy.type !== "decision") {
    return false;
  }
  return state.revealedCards.some(
    (record) =>
      record.origin === "lifeDamage" &&
      record.cleanupPolicy === "trashAfterResolution" &&
      record.cards.some((card) => card.instanceId === entry.source.instanceId),
  );
};

const cleanupResolvedLifeTrigger = (
  state: GameState,
  entry: EffectQueueEntry,
): { state: GameState; events: EngineEvent[] } => {
  if (!isLifeTriggerResolutionEntry(state, entry)) {
    return { state, events: [] };
  }
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return { state, events: [] };
  }
  const trashed: CardInstance = {
    instanceId: entry.source.instanceId,
    cardId: entry.source.cardId,
    owner: entry.sourceSnapshot.ownerId,
    controller: entry.sourceSnapshot.controllerId,
    attachedDon: [],
    zone: {
      zone: "trash",
      playerId: entry.controllerId,
      slot: "trash",
      index: 0,
    },
  };
  const events: EngineEvent[] = [];
  const eventBaseState: GameState = {
    ...state,
    seq: toStateSeq(state.seq - 1),
  };
  appendEvent(
    eventBaseState,
    events,
    "cardMoved",
    {
      instanceId: trashed.instanceId,
      cardId: trashed.cardId,
      from: entry.source.zone,
      to: trashed.zone,
      reason: "lifeTriggerResolved",
    },
    { type: "public" },
  );
  appendEvent(
    eventBaseState,
    events,
    "cardTrashed",
    {
      playerId: entry.controllerId,
      instanceId: trashed.instanceId,
      cardId: trashed.cardId,
      reason: "lifeTriggerResolved",
    },
    { type: "public" },
  );
  for (const event of events) {
    event.causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    };
  }
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [entry.controllerId]: {
        ...player,
        trash: reindexZoneCards(
          [trashed, ...player.trash],
          "trash",
          entry.controllerId,
          "trash",
        ),
      },
    },
    revealedCards: state.revealedCards.filter(
      (record) =>
        !record.cards.some(
          (card) => card.instanceId === entry.source.instanceId,
        ),
    ),
    eventJournal: [...state.eventJournal, ...events],
  };
  return { state: nextState, events };
};

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

export const createEffectRuntimeQueueProcessing = (
  dependencies: EffectRuntimeQueueProcessingDependencies,
): EffectRuntimeQueueProcessing => {
  const failUnsupportedTargetEffectContinuation = (
    state: GameState,
  ): EngineResult =>
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

  const resolveQueuedTargetRequest = (
    state: GameState,
    entry: EffectQueueEntry,
  ): TargetRequest | undefined => {
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
      !isSupportedTargetChoiceEffectShape(match)
    ) {
      return undefined;
    }
    return targetRequestForEffect(match.effect);
  };

  const createSelectTargetsDecisionForQueuedEffect = (
    state: GameState,
    entry: EffectQueueEntry,
    request: TargetRequest,
    options: {
      rollbackState: GameState;
      priorEvents: readonly EngineEvent[];
      errorCount: number;
    },
  ): EngineResult => {
    const resolved = resolvePublicTargetCandidates(state, request, {
      sourceControllerId: entry.controllerId,
    });
    const chooserId = resolvePlayerId(state, entry, request.chooser);
    if (!resolved.ok || chooserId === undefined) {
      return toEngineResult(
        options.rollbackState,
        [],
        [
          dependencies.createUnsupportedPendingRuntimeWorkError({
            kind: "effectQueue",
            count: options.errorCount,
          }),
        ],
      );
    }

    const causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    } as const;
    const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
      id: toDecisionId(`decision:selectTargets:${String(entry.id)}`),
      type: "selectTargets",
      playerId: chooserId,
      prompt: "Select targets.",
      causedBy,
      visibility: { type: "public" },
      request,
      candidates: resolved.candidates,
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
    return toEngineResult(nextState, [...options.priorEvents, ...events]);
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
        return toEngineResult(
          originalState,
          [],
          [
            dependencies.createUnsupportedPendingRuntimeWorkError({
              kind: "effectQueue",
              count: originalState.effectQueue.length,
            }),
          ],
        );
      }
      const targetRequest = resolveQueuedTargetRequest(nextState, selected);
      if (targetRequest !== undefined) {
        return createSelectTargetsDecisionForQueuedEffect(
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
        return toEngineResult(
          originalState,
          [],
          [
            dependencies.createUnsupportedPendingRuntimeWorkError({
              kind: "effectQueue",
              count: originalState.effectQueue.length,
            }),
          ],
        );
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
        return toEngineResult(
          originalState,
          [],
          [
            dependencies.createUnsupportedPendingRuntimeWorkError({
              kind: "effectQueue",
              count: originalState.effectQueue.length,
            }),
          ],
        );
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

  const processNoChoiceEffectQueue = (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  ): EngineResult => {
    if (state.pendingDecision !== undefined) {
      return toEngineResult(state, []);
    }
    const validated = validateEffectQueueOrderingInput(
      state.effectQueue,
      inferTimingWindowRanks(state.effectQueue),
    );
    if (!validated.ok) {
      return toEngineResult(
        state,
        [],
        [
          dependencies.createUnsupportedPendingRuntimeWorkError({
            kind: "effectQueue",
            count: state.effectQueue.length,
          }),
        ],
      );
    }

    const grouped = groupValidatedEffectQueueEntries(validated);
    const earliestChoiceGroup =
      findEarliestChoiceRequiredEffectQueueGroup(grouped);
    if (earliestChoiceGroup !== undefined) {
      if (orderedCurrentChoiceGroupIds !== undefined) {
        const expectedIds = earliestChoiceGroup.entries.map(
          (entry) => entry.id,
        );
        if (!hasExactIds(expectedIds, orderedCurrentChoiceGroupIds)) {
          return toEngineResult(
            state,
            [],
            [
              dependencies.createUnsupportedPendingRuntimeWorkError({
                kind: "effectQueue",
                count: state.effectQueue.length,
              }),
            ],
          );
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
    }

    const ordered = orderNoChoiceEffectQueueGroups(grouped);
    if (!ordered.ok) {
      return toEngineResult(
        state,
        [],
        [
          dependencies.createUnsupportedPendingRuntimeWorkError({
            kind: "effectQueue",
            count: state.effectQueue.length,
          }),
        ],
      );
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
    failUnsupportedTargetEffectContinuation,
    processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice,
  };
};
