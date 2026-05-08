import type {
  CardSupportStatus,
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
import { createEffectRuntimeTriggerQueueing } from "./effect-runtime-trigger-queueing.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";
import { evaluateQueuedEffectSourcePresence } from "./source-presence.js";
import { resolvePublicTargetCandidates } from "./target-selection.js";

export type { DrawExecutionFailureReason } from "./effect-runtime-primitives.js";
export type {
  BattleKOTriggerCandidate,
  DetectBattleKOTriggerCandidatesResult,
  OnKOTriggerCandidateDetectionFailureReason,
  OnOpponentAttackTriggerQueueingFailureReason,
  OnPlayTriggerQueueingFailureReason,
  QueueBattleKOTriggersResult,
  WhenAttackingTriggerQueueingFailureReason,
} from "./effect-runtime-trigger-queueing.js";
export {
  executeNoChoiceEffectPrimitive,
  isSupportedNoChoiceOnKODrawEffect,
  isSupportedNoChoiceOnOpponentAttackDrawEffect,
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
} from "./effect-runtime-primitives.js";

export type PendingRuntimeWorkKind = "effectQueue" | "deferredTriggers";

export interface PendingRuntimeWork {
  kind: PendingRuntimeWorkKind;
  count: number;
}

export interface UnsupportedPendingRuntimeWorkDetails extends PendingRuntimeWork {
  reason: "unsupported-pending-runtime-work";
}

export type EffectDefinitionLookupFailureReason =
  | "unsupported-support-status"
  | "implemented-custom-status"
  | "unexpected-vanilla-effect-definition"
  | "missing-effect-definition-id"
  | "missing-effect-definition"
  | "definition-card-id-mismatch"
  | "definition-status-mismatch"
  | "support-card-data-version-mismatch"
  | "rules-version-mismatch"
  | "source-text-hash-mismatch"
  | "definition-version-mismatch"
  | "untested-support-metadata"
  | "untested-definition-metadata"
  | "unreviewed-definition-metadata";

export interface EffectDefinitionLookupErrorDetails {
  reason: EffectDefinitionLookupFailureReason;
  supportStatus: CardSupportStatus;
}

export type ResolveImplementedDslEffectDefinitionResult =
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

export const detectPendingRuntimeWork = (
  state: GameState,
): PendingRuntimeWork | undefined => {
  if (state.effectQueue.length > 0) {
    return {
      kind: "effectQueue",
      count: state.effectQueue.length,
    };
  }
  if (state.deferredTriggers.length > 0) {
    return {
      kind: "deferredTriggers",
      count: state.deferredTriggers.length,
    };
  }
  return undefined;
};

const asLookupError = (
  reason: EffectDefinitionLookupFailureReason,
  supportStatus: CardSupportStatus,
): ResolveImplementedDslEffectDefinitionResult => ({
  ok: false,
  error: {
    type: "effectRuntimeError",
    effectId: "effect-definition-lookup",
    details: {
      reason,
      supportStatus,
    } satisfies EffectDefinitionLookupErrorDetails,
  },
});

const hasHumanReviewMetadata = (definition: EffectDefinition): boolean =>
  definition.metadata.reviewer !== undefined ||
  (definition.metadata.reviewedBy !== undefined &&
    definition.metadata.reviewedAt !== undefined);

export const resolveImplementedDslEffectDefinition = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
): ResolveImplementedDslEffectDefinitionResult => {
  const support = card.support;

  if (support.status === "implemented-custom") {
    return asLookupError("implemented-custom-status", support.status);
  }
  if (support.status === "vanilla-confirmed") {
    if (support.effectDefinitionId !== undefined) {
      return asLookupError(
        "unexpected-vanilla-effect-definition",
        support.status,
      );
    }
    return asLookupError("unsupported-support-status", support.status);
  }
  if (support.status !== "implemented-dsl") {
    return asLookupError("unsupported-support-status", support.status);
  }
  if (support.effectDefinitionId === undefined) {
    return asLookupError("missing-effect-definition-id", support.status);
  }
  if (!support.tested) {
    return asLookupError("untested-support-metadata", support.status);
  }
  if (support.cardDataVersion !== manifest.cardDataVersion) {
    return asLookupError("support-card-data-version-mismatch", support.status);
  }

  const registry = manifest.effectDefinitions;
  if (registry === undefined) {
    return asLookupError("missing-effect-definition", support.status);
  }
  const definition = registry[support.effectDefinitionId];
  if (definition === undefined) {
    return asLookupError("missing-effect-definition", support.status);
  }
  if (definition.cardId !== support.cardId) {
    return asLookupError("definition-card-id-mismatch", support.status);
  }
  if (definition.implementationStatus !== support.status) {
    return asLookupError("definition-status-mismatch", support.status);
  }
  if (definition.metadata.rulesVersion !== support.rulesVersion) {
    return asLookupError("rules-version-mismatch", support.status);
  }
  if (definition.metadata.sourceTextHash !== support.sourceTextHash) {
    return asLookupError("source-text-hash-mismatch", support.status);
  }
  if (
    definition.metadata.effectDefinitionsVersion !==
    manifest.effectDefinitionsVersion
  ) {
    return asLookupError("definition-version-mismatch", support.status);
  }
  if (!definition.metadata.tested) {
    return asLookupError("untested-definition-metadata", support.status);
  }
  if (!hasHumanReviewMetadata(definition)) {
    return asLookupError("unreviewed-definition-metadata", support.status);
  }

  return { ok: true, definition };
};

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

const unsupportedEffectIdByKind: Record<PendingRuntimeWorkKind, string> = {
  effectQueue: "unsupported-effect-queue",
  deferredTriggers: "unsupported-deferred-triggers",
};

const unsupportedPendingRuntimeWorkError = (
  work: PendingRuntimeWork,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: unsupportedEffectIdByKind[work.kind],
  details: {
    reason: "unsupported-pending-runtime-work",
    kind: work.kind,
    count: work.count,
  } satisfies UnsupportedPendingRuntimeWorkDetails,
});

const triggerQueueing = createEffectRuntimeTriggerQueueing({
  resolveImplementedDslEffectDefinition,
  createUnsupportedPendingRuntimeWorkError: unsupportedPendingRuntimeWorkError,
});

export const detectBattleKOTriggerCandidates =
  triggerQueueing.detectBattleKOTriggerCandidates;
export const queueBattleKOTriggers = triggerQueueing.queueBattleKOTriggers;
const queueOnPlayTriggers = triggerQueueing.queueOnPlayTriggers;
const queueWhenAttackingTriggers = triggerQueueing.queueWhenAttackingTriggers;
const queueOnOpponentAttackTriggers =
  triggerQueueing.queueOnOpponentAttackTriggers;
const queueEffectResolvedCustomTriggers =
  triggerQueueing.queueEffectResolvedCustomTriggers;

export const failUnsupportedTargetEffectContinuation = (
  state: GameState,
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      unsupportedPendingRuntimeWorkError({
        kind: "effectQueue",
        count: state.effectQueue.length,
      }),
    ],
  );

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

const resolveQueuedNoChoiceDrawEffect = (
  state: GameState,
  entry: EffectQueueEntry,
): Extract<Effect, { type: "draw" }> | undefined => {
  const resolved = state.cardManifest.cards[entry.source.cardId];
  if (resolved === undefined) {
    return undefined;
  }
  const lookup = resolveImplementedDslEffectDefinition(
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
  const lookup = resolveImplementedDslEffectDefinition(
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
        unsupportedPendingRuntimeWorkError({
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

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "effect-runtime",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
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
          unsupportedPendingRuntimeWorkError({
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
          unsupportedPendingRuntimeWorkError({
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
          unsupportedPendingRuntimeWorkError({
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

    const triggered = queueEffectResolvedCustomTriggers(nextState, selected, [
      ...resolution.events,
      ...resolvedEvents,
      ...cleanup.events,
    ]);
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
        unsupportedPendingRuntimeWorkError({
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
      const expectedIds = earliestChoiceGroup.entries.map((entry) => entry.id);
      if (!hasExactIds(expectedIds, orderedCurrentChoiceGroupIds)) {
        return toEngineResult(
          state,
          [],
          [
            unsupportedPendingRuntimeWorkError({
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
        unsupportedPendingRuntimeWorkError({
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

export const processDefenderOpponentAttackTiming = (
  state: GameState,
): EngineResult => {
  const queued = queueOnOpponentAttackTriggers(state);
  if (queued === undefined) {
    return toEngineResult(state, []);
  }
  if (queued.errors !== undefined) {
    return queued;
  }

  const resolved = processNoChoiceEffectQueue(queued.state);
  if (resolved.errors !== undefined) {
    return toEngineResult(state, [], toErrorTuple(resolved.errors));
  }
  return toEngineResult(resolved.state, [...queued.events, ...resolved.events]);
};

export const processEffectRuntime = (state: GameState): EngineResult => {
  const queuedFromOnPlay = queueOnPlayTriggers(state);
  if (queuedFromOnPlay !== undefined) {
    return queuedFromOnPlay;
  }
  const queuedFromWhenAttacking = queueWhenAttackingTriggers(state);
  if (queuedFromWhenAttacking !== undefined) {
    return queuedFromWhenAttacking;
  }
  if (state.deferredTriggers.length > 0) {
    return toEngineResult(
      state,
      [],
      [
        unsupportedPendingRuntimeWorkError({
          kind: "deferredTriggers",
          count: state.deferredTriggers.length,
        }),
      ],
    );
  }
  const work = detectPendingRuntimeWork(state);
  if (work === undefined) {
    return toEngineResult(state, []);
  }
  if (work.kind === "effectQueue") {
    return processNoChoiceEffectQueue(state);
  }
  return toEngineResult(state, [], [unsupportedPendingRuntimeWorkError(work)]);
};

export const processEffectRuntimeAfterTriggerOrderChoice = (
  state: GameState,
  orderedIds: readonly QueueEntryId[],
): EngineResult => processNoChoiceEffectQueue(state, orderedIds);
