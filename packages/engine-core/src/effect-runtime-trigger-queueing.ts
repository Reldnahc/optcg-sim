import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { zonesEqual } from "./action-state.js";
import {
  isSupportedEffectResolvedCustomDrawEffect,
  isSupportedNoChoiceOnKODrawEffect,
  isSupportedNoChoiceOnOpponentAttackDrawEffect,
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
} from "./effect-runtime-primitives.js";

export type OnPlayTriggerQueueingFailureReason =
  | "invalid-card-played-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-play-definition"
  | "multiple-on-play-effects";

export type WhenAttackingTriggerQueueingFailureReason =
  | "invalid-attack-declared-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-when-attacking-definition"
  | "multiple-when-attacking-effects";

export type OnOpponentAttackTriggerQueueingFailureReason =
  | "invalid-attack-declared-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-opponent-attack-definition"
  | "multiple-on-opponent-attack-effects";

export type OnKOTriggerCandidateDetectionFailureReason =
  | "invalid-ko-event-batch"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-ko-definition"
  | "multiple-on-ko-effects";

interface OnPlayTriggerQueueingErrorDetails {
  reason: OnPlayTriggerQueueingFailureReason;
}

interface WhenAttackingTriggerQueueingErrorDetails {
  reason: WhenAttackingTriggerQueueingFailureReason;
}

interface OnOpponentAttackTriggerQueueingErrorDetails {
  reason: OnOpponentAttackTriggerQueueingFailureReason;
}

interface OnKOTriggerCandidateDetectionErrorDetails {
  reason: OnKOTriggerCandidateDetectionFailureReason;
}

export interface BattleKOTriggerCandidate {
  effectBlockId: EffectDefinition["effects"][number]["id"];
  controllerId: PlayerId;
  source: EffectQueueEntry["source"];
  sourceSnapshot: EffectQueueEntry["sourceSnapshot"];
  triggerEventId: EngineEvent["id"];
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  causedBy: EffectQueueEntry["causedBy"];
}

export type DetectBattleKOTriggerCandidatesResult =
  | { ok: true; candidates: BattleKOTriggerCandidate[] }
  | { ok: false; error: EngineError };

export type QueueBattleKOTriggersResult =
  | { ok: true; state: GameState }
  | { ok: false; error: EngineError };

export type ResolveImplementedDslEffectDefinition = (
  resolved: ResolvedCard,
  manifest: GameState["cardManifest"],
) =>
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

export interface EffectRuntimeTriggerQueueingDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: (work: {
    kind: "effectQueue";
    count: number;
  }) => EngineError;
}

export interface EffectRuntimeTriggerQueueingHelpers {
  detectBattleKOTriggerCandidates: (
    state: GameState,
    events: readonly EngineEvent[],
  ) => DetectBattleKOTriggerCandidatesResult;
  queueBattleKOTriggers: (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ) => QueueBattleKOTriggersResult;
  queueOnPlayTriggers: (state: GameState) => EngineResult | undefined;
  queueWhenAttackingTriggers: (state: GameState) => EngineResult | undefined;
  queueOnOpponentAttackTriggers: (state: GameState) => EngineResult | undefined;
  queueEffectResolvedCustomTriggers: (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
  ) => EngineResult | undefined;
}

const onPlayTriggerQueueingError = (
  reason: OnPlayTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-play-trigger-queueing",
  details: { reason } satisfies OnPlayTriggerQueueingErrorDetails,
});

const whenAttackingTriggerQueueingError = (
  reason: WhenAttackingTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "when-attacking-trigger-queueing",
  details: { reason } satisfies WhenAttackingTriggerQueueingErrorDetails,
});

const onOpponentAttackTriggerQueueingError = (
  reason: OnOpponentAttackTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-opponent-attack-trigger-queueing",
  details: { reason } satisfies OnOpponentAttackTriggerQueueingErrorDetails,
});

const onKOTriggerCandidateDetectionError = (
  reason: OnKOTriggerCandidateDetectionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-ko-trigger-candidate-detection",
  details: { reason } satisfies OnKOTriggerCandidateDetectionErrorDetails,
});

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

const findCardInstanceInTrash = (
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): CardInstance | undefined => {
  const player = state.players[playerId];
  return player?.trash.find((card) => card.instanceId === instanceId);
};

const attackEventCardRefMatches = (
  ref: {
    playerId?: PlayerId;
    instanceId?: string;
    cardId?: string;
    zone?: CardInstance["zone"];
  },
  card: CardInstance,
  playerId: PlayerId,
): boolean =>
  ref.playerId === playerId &&
  ref.instanceId === card.instanceId &&
  ref.cardId === card.cardId &&
  ref.zone !== undefined &&
  zonesEqual(ref.zone, card.zone);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const zoneRefFromUnknown = (
  value: unknown,
): CardInstance["zone"] | undefined => {
  if (!isRecord(value) || typeof value["zone"] !== "string") {
    return undefined;
  }
  return {
    zone: value["zone"] as CardInstance["zone"]["zone"],
    ...(typeof value["playerId"] === "string"
      ? { playerId: value["playerId"] as PlayerId }
      : {}),
    ...(typeof value["slot"] === "string"
      ? { slot: value["slot"] as NonNullable<CardInstance["zone"]["slot"]> }
      : {}),
    ...(typeof value["index"] === "number" ? { index: value["index"] } : {}),
  };
};

const findMatchingKOMoveEvent = (
  koEvent: EngineEvent,
  events: readonly EngineEvent[],
): EngineEvent | undefined => {
  const koPayload = koEvent.payload as {
    playerId?: PlayerId;
    instanceId?: string;
  };
  const matches = events.filter((event) => {
    if (event.type !== "cardMoved") {
      return false;
    }
    const payload = event.payload as {
      from?: unknown;
      to?: unknown;
      reason?: string;
      instanceId?: string;
    };
    const from = zoneRefFromUnknown(payload.from);
    const to = zoneRefFromUnknown(payload.to);
    return (
      payload.reason === "ko" &&
      payload.instanceId === koPayload.instanceId &&
      from?.zone === "characterArea" &&
      from.playerId === koPayload.playerId &&
      to?.zone === "trash" &&
      to.playerId === koPayload.playerId
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
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

const fieldTriggerSources = (state: GameState): CardInstance[] =>
  Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ]);

export const createEffectRuntimeTriggerQueueing = (
  dependencies: EffectRuntimeTriggerQueueingDependencies,
): EffectRuntimeTriggerQueueingHelpers => {
  const detectBattleKOTriggerCandidates = (
    state: GameState,
    events: readonly EngineEvent[],
  ): DetectBattleKOTriggerCandidatesResult => {
    const candidates: BattleKOTriggerCandidate[] = [];
    const koEvents = events.filter((event) => event.type === "cardKOd");

    for (const event of koEvents) {
      const payload = event.payload as {
        playerId?: PlayerId;
        instanceId?: string;
      };
      if (payload.playerId === undefined || payload.instanceId === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }
      const movedEvent = findMatchingKOMoveEvent(event, events);
      if (movedEvent === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }

      const source = findCardInstanceInTrash(
        state,
        payload.playerId,
        payload.instanceId,
      );
      const movedPayload = movedEvent.payload as {
        from?: unknown;
        to?: unknown;
      };
      const origin = zoneRefFromUnknown(movedPayload.from);
      const destination = zoneRefFromUnknown(movedPayload.to);
      if (
        source === undefined ||
        origin === undefined ||
        destination === undefined ||
        source.zone.zone !== "trash" ||
        !zonesEqual(source.zone, destination)
      ) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("source-presence-failed"),
        };
      }

      const resolved = state.cardManifest.cards[source.cardId];
      if (resolved === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("missing-card-definition"),
        };
      }
      if (resolved.support.effectDefinitionId === undefined) {
        continue;
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return { ok: false, error: lookup.error };
      }
      const onKOEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "onKO",
      );
      if (onKOEffects.length === 0) {
        continue;
      }
      const matching = onKOEffects.filter(isSupportedNoChoiceOnKODrawEffect);
      if (matching.length === 0 || lookup.definition.effects.length !== 1) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError(
            "unsupported-on-ko-definition",
          ),
        };
      }
      if (matching.length !== 1) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("multiple-on-ko-effects"),
        };
      }

      const effectBlock = matching[0];
      if (effectBlock === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError(
            "unsupported-on-ko-definition",
          ),
        };
      }
      const candidateSource =
        effectBlock.sourcePresencePolicy === "resolveFromLastKnownInformation"
          ? { ...source, zone: origin }
          : source;
      candidates.push({
        effectBlockId: effectBlock.id,
        controllerId: candidateSource.controller,
        source: {
          instanceId: candidateSource.instanceId,
          cardId: candidateSource.cardId,
          playerId: payload.playerId,
          zone: candidateSource.zone,
        },
        sourceSnapshot: toSnapshot(candidateSource, resolved),
        triggerEventId: event.id,
        sourcePresencePolicy: effectBlock.sourcePresencePolicy,
        causedBy: {
          type: "ruleProcess",
          name: "effectRuntime:onKOTriggerCandidateDetection",
        },
      });
    }

    return { ok: true, candidates };
  };

  const queueBattleKOTriggers = (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ): QueueBattleKOTriggersResult => {
    const detected = detectBattleKOTriggerCandidates(state, events);
    if (!detected.ok) {
      return detected;
    }
    if (detected.candidates.length === 0) {
      return { ok: true, state };
    }

    const appended: EffectQueueEntry[] = [];
    for (const candidate of detected.candidates) {
      const triggerEvent = events.find(
        (event) => event.id === candidate.triggerEventId,
      );
      if (triggerEvent === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }

      const orderingGroup =
        candidate.controllerId === state.turn.turnPlayerId
          ? "turnPlayer"
          : "nonTurnPlayer";
      const entry: EffectQueueEntry = {
        id: `queue-entry:${String(candidate.triggerEventId)}:${String(
          candidate.effectBlockId,
        )}` as EffectQueueEntry["id"],
        state: "pending",
        timingWindowId:
          `timing-window:${String(candidate.triggerEventId)}:onKO` as EffectQueueEntry["timingWindowId"],
        generation: 0,
        controllerId: candidate.controllerId,
        source: candidate.source,
        sourceSnapshot: candidate.sourceSnapshot,
        triggerEventId: candidate.triggerEventId,
        effectBlockId: candidate.effectBlockId,
        orderingGroup,
        createdAtEventSeq: triggerEvent.seq,
        queuedAtStateSeq: state.seq,
        sourcePresencePolicy: candidate.sourcePresencePolicy,
        causedBy: {
          type: "ruleProcess",
          name: "effectRuntime:onKOTriggerQueueing",
        },
      };
      appended.push(entry);
    }

    for (const entry of appended) {
      const beforeEventCount = events.length;
      appendEvent(
        eventBaseState,
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
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }

    return {
      ok: true,
      state: {
        ...state,
        effectQueue: [...state.effectQueue, ...appended],
      },
    };
  };

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

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
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
      const matching = onPlayEffects.filter(
        isSupportedNoChoiceOnPlayDrawEffect,
      );
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

  const queueWhenAttackingTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const attackDeclaredEvents = state.eventJournal.filter(
      (event) =>
        event.type === "attackDeclared" &&
        event.createdAtStateSeq === state.seq,
    );
    if (attackDeclaredEvents.length === 0) {
      return undefined;
    }

    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];
    for (const event of attackDeclaredEvents) {
      const payload = event.payload as {
        attacker?: {
          playerId?: PlayerId;
          instanceId?: string;
          cardId?: string;
          zone?: CardInstance["zone"];
        };
      };
      const attackerPayload = payload.attacker;
      if (
        attackerPayload?.playerId === undefined ||
        attackerPayload.instanceId === undefined ||
        attackerPayload.cardId === undefined
      ) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("invalid-attack-declared-event")],
        );
      }
      if (attackerPayload.playerId !== state.turn.turnPlayerId) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("invalid-attack-declared-event")],
        );
      }

      const source = findCardInstance(
        state,
        attackerPayload.playerId,
        attackerPayload.instanceId,
      );
      if (
        source === undefined ||
        source.cardId !== attackerPayload.cardId ||
        source.zone.playerId !== attackerPayload.playerId ||
        !attackEventCardRefMatches(
          attackerPayload,
          source,
          state.turn.turnPlayerId,
        ) ||
        (source.zone.zone !== "leaderArea" &&
          source.zone.zone !== "characterArea")
      ) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("source-presence-failed")],
        );
      }
      const resolved = state.cardManifest.cards[source.cardId];
      if (resolved === undefined) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("missing-card-definition")],
        );
      }
      if (resolved.support.effectDefinitionId === undefined) {
        continue;
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error]);
      }
      const whenAttackingEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "whenAttacking",
      );
      if (whenAttackingEffects.length === 0) {
        continue;
      }
      const matching = whenAttackingEffects.filter(
        isSupportedNoChoiceWhenAttackingDrawEffect,
      );
      if (matching.length === 0) {
        return toEngineResult(
          state,
          [],
          [
            whenAttackingTriggerQueueingError(
              "unsupported-when-attacking-definition",
            ),
          ],
        );
      }
      if (matching.length !== 1) {
        return toEngineResult(
          state,
          [],
          [
            whenAttackingTriggerQueueingError(
              "multiple-when-attacking-effects",
            ),
          ],
        );
      }
      if (lookup.definition.effects.length !== 1) {
        return toEngineResult(
          state,
          [],
          [
            whenAttackingTriggerQueueingError(
              "unsupported-when-attacking-definition",
            ),
          ],
        );
      }

      for (const effectBlock of matching) {
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
          orderingGroup: "turnPlayer",
          createdAtEventSeq: event.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: effectBlock.sourcePresencePolicy,
          causedBy: {
            type: "ruleProcess",
            name: "effectRuntime:whenAttackingTriggerQueueing",
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
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  const queueOnOpponentAttackTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const battle = state.battle;
    if (battle === undefined || battle.step !== "counter") {
      return undefined;
    }
    const defenderId = battle.currentTarget.playerId;
    if (defenderId === state.turn.turnPlayerId) {
      return toEngineResult(
        state,
        [],
        [onOpponentAttackTriggerQueueingError("invalid-attack-declared-event")],
      );
    }

    const attackDeclaredEvents = state.eventJournal.filter(
      (event) =>
        event.type === "attackDeclared" &&
        event.createdAtStateSeq === state.seq,
    );
    if (attackDeclaredEvents.length === 0) {
      return undefined;
    }

    const defender = state.players[defenderId];
    if (defender === undefined) {
      return toEngineResult(
        state,
        [],
        [onOpponentAttackTriggerQueueingError("source-presence-failed")],
      );
    }
    const defenderSources = [defender.leader, ...defender.characters].filter(
      (card) =>
        card.controller === defenderId && card.zone.playerId === defenderId,
    );

    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];
    for (const event of attackDeclaredEvents) {
      const payload = event.payload as {
        attacker?: {
          playerId?: PlayerId;
          instanceId?: string;
          cardId?: string;
          zone?: CardInstance["zone"];
        };
        target?: {
          playerId?: PlayerId;
          instanceId?: string;
          cardId?: string;
          zone?: CardInstance["zone"];
        };
      };
      const attackerPayload = payload.attacker;
      const targetPayload = payload.target;
      if (
        attackerPayload?.playerId !== state.turn.turnPlayerId ||
        attackerPayload.instanceId === undefined ||
        attackerPayload.cardId === undefined ||
        targetPayload?.playerId !== defenderId ||
        targetPayload.instanceId === undefined ||
        targetPayload.cardId === undefined
      ) {
        return toEngineResult(
          state,
          [],
          [
            onOpponentAttackTriggerQueueingError(
              "invalid-attack-declared-event",
            ),
          ],
        );
      }
      const attackingSource = findCardInstance(
        state,
        state.turn.turnPlayerId,
        attackerPayload.instanceId,
      );
      const attackedTarget = findCardInstance(
        state,
        defenderId,
        targetPayload.instanceId,
      );
      if (
        attackingSource === undefined ||
        attackedTarget === undefined ||
        !attackEventCardRefMatches(
          attackerPayload,
          attackingSource,
          state.turn.turnPlayerId,
        ) ||
        !attackEventCardRefMatches(targetPayload, attackedTarget, defenderId)
      ) {
        return toEngineResult(
          state,
          [],
          [onOpponentAttackTriggerQueueingError("source-presence-failed")],
        );
      }

      for (const candidate of defenderSources) {
        const source = findCardInstance(
          state,
          defenderId,
          candidate.instanceId,
        );
        if (
          source === undefined ||
          source.cardId !== candidate.cardId ||
          source.zone.playerId !== defenderId ||
          source.controller !== defenderId ||
          (source.zone.zone !== "leaderArea" &&
            source.zone.zone !== "characterArea")
        ) {
          return toEngineResult(
            state,
            [],
            [onOpponentAttackTriggerQueueingError("source-presence-failed")],
          );
        }
        const resolved = state.cardManifest.cards[source.cardId];
        if (resolved === undefined) {
          return toEngineResult(
            state,
            [],
            [onOpponentAttackTriggerQueueingError("missing-card-definition")],
          );
        }
        if (resolved.support.effectDefinitionId === undefined) {
          continue;
        }

        const lookup = dependencies.resolveImplementedDslEffectDefinition(
          resolved,
          state.cardManifest,
        );
        if (!lookup.ok) {
          return toEngineResult(state, [], [lookup.error]);
        }
        const onOpponentAttackEffects = lookup.definition.effects.filter(
          (effect) => effect.trigger.type === "onOpponentAttack",
        );
        if (onOpponentAttackEffects.length === 0) {
          continue;
        }
        const matching = onOpponentAttackEffects.filter(
          isSupportedNoChoiceOnOpponentAttackDrawEffect,
        );
        if (matching.length === 0) {
          return toEngineResult(
            state,
            [],
            [
              onOpponentAttackTriggerQueueingError(
                "unsupported-on-opponent-attack-definition",
              ),
            ],
          );
        }
        if (matching.length !== 1) {
          return toEngineResult(
            state,
            [],
            [
              onOpponentAttackTriggerQueueingError(
                "multiple-on-opponent-attack-effects",
              ),
            ],
          );
        }
        if (lookup.definition.effects.length !== 1) {
          return toEngineResult(
            state,
            [],
            [
              onOpponentAttackTriggerQueueingError(
                "unsupported-on-opponent-attack-definition",
              ),
            ],
          );
        }

        for (const effectBlock of matching) {
          const queueId =
            `queue-entry:${String(event.id)}:onOpponentAttack:${String(effectBlock.id)}` as EffectQueueEntry["id"];
          const timingWindowId =
            `timing-window:${String(event.id)}:onOpponentAttack` as EffectQueueEntry["timingWindowId"];
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
            orderingGroup: "nonTurnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effectBlock.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: "effectRuntime:onOpponentAttackTriggerQueueing",
            },
          };
          appended.push(entry);
        }
      }
    }

    if (appended.length === 0) {
      return undefined;
    }
    const sameControllerEntryCount = appended.filter(
      (entry) => entry.controllerId === defenderId,
    ).length;
    if (sameControllerEntryCount > 1) {
      return toEngineResult(
        state,
        [],
        [
          onOpponentAttackTriggerQueueingError(
            "multiple-on-opponent-attack-effects",
          ),
        ],
      );
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
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  const queueEffectResolvedCustomTriggers = (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
  ): EngineResult | undefined => {
    const effectResolved = resolutionEvents.find(
      (event) => event.type === "effectResolved",
    );
    if (effectResolved === undefined) {
      return undefined;
    }
    const eventName = `effectResolved:${String(resolvedEntry.effectBlockId)}`;
    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];

    for (const source of fieldTriggerSources(state)) {
      const resolved = state.cardManifest.cards[source.cardId];
      if (
        resolved === undefined ||
        resolved.support.effectDefinitionId === undefined
      ) {
        continue;
      }
      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error]);
      }
      const matching = lookup.definition.effects.filter((effect) =>
        isSupportedEffectResolvedCustomDrawEffect(effect, eventName),
      );
      if (matching.length === 0) {
        continue;
      }
      if (matching.length !== 1) {
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

      for (const effectBlock of matching) {
        const orderingGroup =
          source.controller === state.turn.turnPlayerId
            ? "turnPlayer"
            : "nonTurnPlayer";
        const queueId =
          `queue-entry:${String(effectResolved.id)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
        const entry: EffectQueueEntry = {
          id: queueId,
          state: "pending",
          timingWindowId: resolvedEntry.timingWindowId,
          generation: resolvedEntry.generation + 1,
          controllerId: source.controller,
          source: {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: source.controller,
            zone: source.zone,
          },
          sourceSnapshot: toSnapshot(source, resolved),
          triggerEventId: effectResolved.id,
          effectBlockId: effectBlock.id,
          orderingGroup,
          createdAtEventSeq: effectResolved.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: effectBlock.sourcePresencePolicy,
          causedBy: {
            type: "effect",
            queueEntryId: resolvedEntry.id,
            effectId: resolvedEntry.effectBlockId,
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
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  return {
    detectBattleKOTriggerCandidates,
    queueBattleKOTriggers,
    queueOnPlayTriggers,
    queueWhenAttackingTriggers,
    queueOnOpponentAttackTriggers,
    queueEffectResolvedCustomTriggers,
  };
};
