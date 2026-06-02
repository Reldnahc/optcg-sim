import type {
  CardInstance,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  PlayerRef,
} from "@optcg/types";

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { getOpponentId } from "../../actions/state.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import { isSupportedAutoRuntimeEffectBlock } from "../../effect-runtime-block-support.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  LifeRemovedTriggerQueueingFailureReason,
} from "./core.js";
import {
  fieldTriggerSources,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";

const queuedTriggerEventIds = (state: GameState): Set<string> =>
  new Set(
    state.eventJournal.flatMap((event) => {
      if (event.type !== "effectQueued") {
        return [];
      }
      const payload = event.payload as { triggerEventId?: unknown };
      return typeof payload.triggerEventId === "string"
        ? [payload.triggerEventId]
        : [];
    }),
  );

const movedLifePlayer = (event: EngineEvent): PlayerId | undefined => {
  if (event.type !== "cardMoved" || event.visibility.type !== "public") {
    return undefined;
  }
  const payload = event.payload as {
    from?: unknown;
    playerId?: PlayerId;
  };
  const from = zoneRefFromUnknown(payload.from);
  if (from?.zone === "life" && from.playerId !== undefined) {
    return from.playerId;
  }
  if (payload.from === "life" && payload.playerId !== undefined) {
    return payload.playerId;
  }
  return undefined;
};

const isRecentRuntimeEvent = (state: GameState, event: EngineEvent): boolean =>
  Number(event.createdAtStateSeq) >= Math.max(0, Number(state.seq) - 1);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRuntimeLifeMovementEvent = (event: EngineEvent): boolean =>
  event.causedBy?.type === "effect" || event.causedBy?.type === "decision";

const isEligibleLifeRemovedEvent = (
  state: GameState,
  event: EngineEvent,
): boolean =>
  isRecentRuntimeEvent(state, event) || isRuntimeLifeMovementEvent(event);

const sourceFieldEntryEventSeq = (
  state: GameState,
  source: CardInstance,
): number | undefined => {
  for (let index = state.eventJournal.length - 1; index >= 0; index -= 1) {
    const event = state.eventJournal[index];
    if (event?.type !== "cardPlayed" || !isRecord(event.payload)) {
      continue;
    }
    if (
      event.payload["instanceId"] === source.instanceId &&
      event.payload["cardId"] === source.cardId &&
      event.payload["playerId"] === source.controller
    ) {
      return event.seq;
    }
  }
  return undefined;
};

const didLifeRemovalHappenAfterSourceEntered = (
  state: GameState,
  event: EngineEvent,
  source: CardInstance,
): boolean => {
  const fieldEntrySeq = sourceFieldEntryEventSeq(state, source);
  return fieldEntrySeq === undefined || event.seq > fieldEntrySeq;
};

const playerRefMatches = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  movedPlayerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return movedPlayerId === source.controller;
    case "owner":
      return movedPlayerId === source.owner;
    case "opponent":
      return movedPlayerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return movedPlayerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return movedPlayerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

export const createLifeRemovedTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  lifeRemovedTriggerQueueingError: (
    reason: LifeRemovedTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueLifeRemovedTriggers: (state: GameState) => EngineResult | undefined;
} => {
  const queueLifeRemovedTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const alreadyQueued = queuedTriggerEventIds(state);
    const lifeRemovedEvents = state.eventJournal.filter(
      (event) =>
        isEligibleLifeRemovedEvent(state, event) &&
        !alreadyQueued.has(String(event.id)) &&
        movedLifePlayer(event) !== undefined,
    );
    if (lifeRemovedEvents.length === 0) {
      return undefined;
    }

    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];
    const sources = fieldTriggerSources(state);
    for (const event of lifeRemovedEvents) {
      const movedPlayerId = movedLifePlayer(event);
      if (movedPlayerId === undefined) {
        return toEngineResult(
          state,
          [],
          [lifeRemovedTriggerQueueingError("invalid-life-removed-event")],
        );
      }

      for (const source of sources) {
        if (
          isCardEffectInvalidated(state, source) ||
          !didLifeRemovalHappenAfterSourceEntered(state, event, source)
        ) {
          continue;
        }
        const resolved = state.cardManifest.cards[source.cardId];
        if (resolved === undefined) {
          continue;
        }
        if (resolved.support.status !== "implemented-dsl") {
          continue;
        }

        const lookup = dependencies.resolveImplementedDslEffectDefinition(
          resolved,
          state.cardManifest,
        );
        if (!lookup.ok) {
          return toEngineResult(state, [], [lookup.error]);
        }
        const lifeRemovedEffects = lookup.definition.effects.filter(
          (effect) =>
            effect.trigger.type === "lifeRemoved" &&
            effect.trigger.players.some((ref) =>
              playerRefMatches(state, source, ref, movedPlayerId),
            ),
        );
        if (lifeRemovedEffects.length === 0) {
          continue;
        }
        const matching = lifeRemovedEffects.filter((effect) =>
          isSupportedAutoRuntimeEffectBlock(effect, {
            category: "auto",
            sourcePresencePolicies: ["mustRemainInSameZone"],
            triggerType: "lifeRemoved",
          }),
        );
        if (matching.length !== lifeRemovedEffects.length) {
          return toEngineResult(
            state,
            [],
            [
              lifeRemovedTriggerQueueingError(
                "unsupported-life-removed-definition",
              ),
            ],
          );
        }
        for (const effectBlock of matching) {
          const queueId =
            `queue-entry:${String(event.id)}:lifeRemoved:${String(source.instanceId)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
          const timingWindowId =
            `timing-window:${String(event.id)}:lifeRemoved` as EffectQueueEntry["timingWindowId"];
          const entry: EffectQueueEntry = {
            id: queueId,
            state: "pending",
            timingWindowId,
            generation: 0,
            controllerId: source.controller,
            source: {
              instanceId: source.instanceId,
              cardId: source.cardId,
              playerId: source.controller,
              zone: source.zone,
            },
            sourceSnapshot: toSnapshot(source, resolved),
            triggerEventId: event.id,
            effectBlockId: effectBlock.id,
            orderingGroup:
              source.controller === state.turn.turnPlayerId
                ? "turnPlayer"
                : "nonTurnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effectBlock.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: "effectRuntime:lifeRemovedTriggerQueueing",
            },
          };
          appended.push(entry);
        }
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

  return { queueLifeRemovedTriggers };
};
