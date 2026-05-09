import type {
  CardId,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { isSupportedNoChoiceMainEventDrawEffect } from "./effect-runtime-primitives.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  MainEventTriggerQueueingFailureReason,
} from "./effect-runtime-trigger-queueing.js";
import {
  findCardInstanceInTrash,
  toSnapshot,
} from "./effect-runtime-trigger-source-lookup.js";

export const createMainEventTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  mainEventTriggerQueueingError: (
    reason: MainEventTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueMainEventTriggers: (state: GameState) => EngineResult | undefined;
} => {
  const queueMainEventTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
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
        cardId?: CardId;
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
          [mainEventTriggerQueueingError("invalid-card-played-event")],
        );
      }
      if (payload.category !== "event") {
        continue;
      }

      const resolved = state.cardManifest.cards[payload.cardId];
      if (resolved === undefined) {
        continue;
      }
      if (resolved.support.status !== "implemented-dsl") {
        continue;
      }

      const source = findCardInstanceInTrash(
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
          [mainEventTriggerQueueingError("source-presence-failed")],
        );
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error]);
      }
      const mainEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "main",
      );
      if (mainEffects.length === 0) {
        continue;
      }
      const matching = mainEffects.filter(
        isSupportedNoChoiceMainEventDrawEffect,
      );
      if (matching.length === 0) {
        return toEngineResult(
          state,
          [],
          [mainEventTriggerQueueingError("unsupported-main-event-definition")],
        );
      }
      if (matching.length !== 1) {
        return toEngineResult(
          state,
          [],
          [mainEventTriggerQueueingError("multiple-main-event-effects")],
        );
      }
      if (lookup.definition.effects.length !== 1) {
        return toEngineResult(
          state,
          [],
          [mainEventTriggerQueueingError("unsupported-main-event-definition")],
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
            name: "effectRuntime:mainEventTriggerQueueing",
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
      const queued = events[beforeEventCount];
      if (queued !== undefined) {
        queued.causedBy = entry.causedBy;
      }
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  return { queueMainEventTriggers };
};
