import type {
  CardSupportStatus,
  CardInstance,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  MatchCardManifest,
  PlayerId,
  PlayerRef,
  ResolvedCard,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { getOpponentId, reindexZoneCards } from "./action-state.js";
import {
  groupValidatedEffectQueueEntries,
  orderNoChoiceEffectQueueGroups,
  validateEffectQueueOrderingInput,
} from "./effect-queue-ordering.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

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

export type DrawExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref"
  | "invalid-draw-count";

interface EffectExecutionErrorDetails {
  reason: DrawExecutionFailureReason;
}

export type OnPlayTriggerQueueingFailureReason =
  | "invalid-card-played-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-play-definition"
  | "multiple-on-play-effects";

interface OnPlayTriggerQueueingErrorDetails {
  reason: OnPlayTriggerQueueingFailureReason;
}

const drawExecutionError = (
  effectId: string,
  reason: DrawExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies EffectExecutionErrorDetails,
});

const onPlayTriggerQueueingError = (
  reason: OnPlayTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-play-trigger-queueing",
  details: { reason } satisfies OnPlayTriggerQueueingErrorDetails,
});

const resolvePlayerId = (
  state: GameState,
  entry: EffectQueueEntry,
  ref: PlayerRef,
): PlayerId | undefined => {
  switch (ref) {
    case "self":
    case "controller":
      return entry.controllerId;
    case "owner":
      return entry.source.playerId;
    case "turnPlayer":
      return state.turn.turnPlayerId;
    case "opponent":
      return getOpponentId(state, entry.controllerId) ?? undefined;
    case "nonTurnPlayer":
      return getOpponentId(state, state.turn.turnPlayerId) ?? undefined;
    default:
      return undefined;
  }
};

const executeDrawEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "draw" }>,
): EngineResult => {
  if (!Number.isInteger(effect.count) || effect.count < 0) {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "invalid-draw-count")],
    );
  }

  const playerId = resolvePlayerId(state, entry, effect.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  if (effect.count === 0) {
    return toEngineResult(state, []);
  }

  const player = state.players[playerId];
  const events: EngineEvent[] = [];
  let nextDeck = player.deck;
  let nextHand = player.hand;
  const maxDraw = Math.min(effect.count, nextDeck.length);
  for (let index = 0; index < maxDraw; index += 1) {
    const drawn = nextDeck[0];
    if (drawn === undefined) {
      break;
    }
    const remaining = nextDeck.slice(1).map((card, deckIndex) => ({
      ...card,
      zone: {
        zone: "deck" as const,
        playerId,
        slot: "deck" as const,
        index: deckIndex,
      },
    }));
    const moved: CardInstance = {
      ...drawn,
      zone: {
        zone: "hand" as const,
        playerId,
        slot: "hand" as const,
        index: nextHand.length,
      },
    };
    nextDeck = remaining;
    nextHand = [...nextHand, moved];

    appendEvent(state, events, "cardDrawn", { playerId });
    appendEvent(
      state,
      events,
      "cardMoved",
      { from: "deck", to: "hand", playerId, reason: "draw" },
      { type: "public" },
    );
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        from: { zone: "deck", playerId, slot: "deck", index: 0 },
        to: moved.zone,
        playerId,
        reason: "draw",
        instanceId: moved.instanceId,
        cardId: moved.cardId,
      },
      { type: "private", playerId },
    );
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: reindexZoneCards(nextDeck, "deck", playerId, "deck"),
        hand: reindexZoneCards(nextHand, "hand", playerId, "hand"),
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };

  return toEngineResult(nextState, events);
};

export const executeNoChoiceEffectPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
): EngineResult => {
  if (effect.type !== "draw") {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "unsupported-effect-shape")],
    );
  }
  return executeDrawEffect(state, entry, effect);
};

export const isSupportedNoChoiceOnPlayDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} => {
  if (effect.trigger.type !== "onPlay") {
    return false;
  }
  if (effect.category !== "auto") {
    return false;
  }
  if (effect.optional || effect.oncePerTurn) {
    return false;
  }
  if (
    effect.cost !== undefined ||
    effect.condition !== undefined ||
    effect.conditionTiming !== undefined ||
    effect.failurePolicy !== undefined
  ) {
    return false;
  }
  if (effect.sourcePresencePolicy === undefined) {
    return false;
  }
  return (
    effect.effect.type === "draw" &&
    Number.isInteger(effect.effect.count) &&
    effect.effect.count >= 0 &&
    effect.effect.player === "self"
  );
};

const findCardInstance = (
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): CardInstance | undefined => {
  const player = state.players[playerId];
  if (player === undefined) {
    return undefined;
  }
  const zoneCards = [
    player.leader,
    player.stage,
    ...player.characters,
    ...player.hand,
    ...player.deck,
    ...player.trash,
    ...player.costArea,
    ...player.donDeck,
  ];
  return zoneCards.find((card) => card?.instanceId === instanceId);
};

const toSnapshot = (
  card: CardInstance,
  resolved: ResolvedCard,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId: card.controller,
  zone: card.zone,
  category: resolved.category,
  colors: resolved.colors,
  ...(resolved.cost !== undefined ? { cost: resolved.cost } : {}),
  ...(resolved.power !== undefined ? { power: resolved.power } : {}),
  ...(resolved.counter !== undefined ? { counter: resolved.counter } : {}),
  ...(resolved.life !== undefined ? { life: resolved.life } : {}),
  keywords: resolved.printedKeywords,
});

const queueOnPlayTriggers = (state: GameState): EngineResult | undefined => {
  if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
    return undefined;
  }
  const acceptedCardPlayed = state.eventJournal.filter(
    (event) =>
      event.type === "cardPlayed" && event.createdAtStateSeq === state.seq,
  );
  if (acceptedCardPlayed.length === 0) {
    return undefined;
  }

  const appended: EffectQueueEntry[] = [];
  const events: EngineEvent[] = [];
  for (const event of acceptedCardPlayed) {
    const payload = event.payload as {
      playerId?: PlayerId;
      instanceId?: string;
      cardId?: string;
      category?: string;
    };
    if (
      payload.playerId === undefined ||
      payload.instanceId === undefined ||
      payload.cardId === undefined ||
      payload.category === undefined
    ) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("invalid-card-played-event")],
      );
    }
    if (payload.category !== "character" && payload.category !== "stage") {
      continue;
    }

    const source = findCardInstance(
      state,
      payload.playerId,
      payload.instanceId,
    );
    if (
      source === undefined ||
      source.cardId !== payload.cardId ||
      source.zone.playerId !== payload.playerId
    ) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("source-presence-failed")],
      );
    }
    const expectedZone =
      payload.category === "character" ? "characterArea" : "stageArea";
    if (source.zone.zone !== expectedZone) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("source-presence-failed")],
      );
    }
    const resolved = state.cardManifest.cards[source.cardId];
    if (resolved === undefined) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("missing-card-definition")],
      );
    }

    const lookup = resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return toEngineResult(state, [], [lookup.error]);
    }
    const onPlayEffects = lookup.definition.effects.filter(
      (effect) => effect.trigger.type === "onPlay",
    );
    if (onPlayEffects.length === 0) {
      continue;
    }
    const matching = onPlayEffects.filter(isSupportedNoChoiceOnPlayDrawEffect);
    if (matching.length === 0) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("unsupported-on-play-definition")],
      );
    }
    if (matching.length !== 1) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("multiple-on-play-effects")],
      );
    }
    if (lookup.definition.effects.length !== 1) {
      return toEngineResult(
        state,
        [],
        [onPlayTriggerQueueingError("unsupported-on-play-definition")],
      );
    }

    for (const effectBlock of matching) {
      const orderingGroup =
        source.zone.playerId === state.turn.turnPlayerId
          ? "turnPlayer"
          : "nonTurnPlayer";
      const queueId =
        `queue-entry:${String(event.id)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
      const timingWindowId =
        `timing-window:${String(event.id)}` as EffectQueueEntry["timingWindowId"];
      const entry: EffectQueueEntry = {
        id: queueId,
        state: "pending",
        timingWindowId,
        generation: 0,
        controllerId: source.zone.playerId,
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.zone.playerId,
          zone: source.zone,
        },
        sourceSnapshot: toSnapshot(source, resolved),
        triggerEventId: event.id,
        effectBlockId: effectBlock.id,
        orderingGroup,
        createdAtEventSeq: event.seq,
        queuedAtStateSeq: toStateSeq(state.seq + 1),
        sourcePresencePolicy: effectBlock.sourcePresencePolicy,
        causedBy: {
          type: "ruleProcess",
          name: "effectRuntime:onPlayTriggerQueueing",
        },
      };
      appended.push(entry);
    }
  }

  if (appended.length === 0) {
    return undefined;
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    effectQueue: [...state.effectQueue, ...appended],
  };
  for (const entry of appended) {
    const beforeEventCount = events.length;
    appendEvent(
      state,
      events,
      "effectQueued",
      {
        queueEntryId: entry.id,
        timingWindowId: entry.timingWindowId,
        generation: entry.generation,
        effectBlockId: entry.effectBlockId,
        triggerEventId: entry.triggerEventId,
        sourcePresencePolicy: entry.sourcePresencePolicy,
        orderingGroup: entry.orderingGroup,
      },
      { type: "public" },
    );
    const event = events[beforeEventCount];
    if (event !== undefined) {
      event.causedBy = entry.causedBy;
    }
  }
  nextState.eventJournal = [...state.eventJournal, ...events];
  return toEngineResult(nextState, events);
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

const isSourcePresentForQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): boolean => {
  if (entry.sourcePresencePolicy !== "mustRemainInSameZone") {
    return false;
  }
  const source = findCardInstance(
    state,
    entry.source.playerId,
    entry.source.instanceId,
  );
  if (source === undefined) {
    return false;
  }
  const expectedZone = entry.source.zone;
  if (expectedZone === undefined) {
    return false;
  }
  return (
    source.cardId === entry.source.cardId &&
    source.zone.zone === expectedZone.zone &&
    source.zone.playerId === expectedZone.playerId &&
    source.zone.slot === expectedZone.slot &&
    source.zone.index === expectedZone.index
  );
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
  if (match === undefined || !isSupportedNoChoiceOnPlayDrawEffect(match)) {
    return undefined;
  }
  return match.effect;
};

const processNoChoiceEffectQueue = (state: GameState): EngineResult => {
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

  const ordered = orderNoChoiceEffectQueueGroups(
    groupValidatedEffectQueueEntries(validated),
  );
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

  const originalState = state;
  let nextState = state;
  const allEvents: EngineEvent[] = [];
  for (const selected of ordered.entries) {
    if (!isSourcePresentForQueueEntry(nextState, selected)) {
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

    if (nextState.status.type !== "active") {
      return toEngineResult(nextState, allEvents);
    }
  }

  return toEngineResult(nextState, allEvents);
};

export const processEffectRuntime = (state: GameState): EngineResult => {
  const queuedFromOnPlay = queueOnPlayTriggers(state);
  if (queuedFromOnPlay !== undefined) {
    return queuedFromOnPlay;
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
