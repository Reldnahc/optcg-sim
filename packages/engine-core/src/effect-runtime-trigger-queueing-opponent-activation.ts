import type {
  CardInstance,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  OpponentActivationKind,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { getOpponentId } from "./action-state.js";
import { isCardEffectInvalidated } from "./effect-invalidation.js";
import { isSupportedAutoRuntimeEffectBlock } from "./effect-runtime-block-support.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  OpponentActivationTriggerQueueingFailureReason,
} from "./effect-runtime-trigger-queueing.js";
import {
  fieldTriggerSources,
  toSnapshot,
} from "./effect-runtime-trigger-source-lookup.js";

const queuedOpponentActivationTriggerEventIds = (
  state: GameState,
): Set<string> =>
  new Set(
    state.eventJournal.flatMap((event) => {
      if (event.type !== "effectQueued") {
        return [];
      }
      const payload = event.payload as {
        queueEntryId?: unknown;
        timingWindowId?: unknown;
        triggerEventId?: unknown;
      };
      const queuedByOpponentActivation =
        typeof payload.queueEntryId === "string"
          ? payload.queueEntryId.includes(":opponentActivated:")
          : typeof payload.timingWindowId === "string" &&
            payload.timingWindowId.endsWith(":opponentActivated");
      return queuedByOpponentActivation &&
        typeof payload.triggerEventId === "string"
        ? [payload.triggerEventId]
        : [];
    }),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const playerIdFromPayload = (
  payload: Record<string, unknown>,
): PlayerId | undefined => {
  const playerId = payload["playerId"];
  return typeof playerId === "string" ? (playerId as PlayerId) : undefined;
};

const opponentActivationFromEvent = (
  state: GameState,
  event: EngineEvent,
): { kind: OpponentActivationKind; playerId: PlayerId } | undefined => {
  if (event.visibility.type !== "public") {
    return undefined;
  }
  if (event.type === "cardPlayed") {
    if (!isRecord(event.payload)) {
      return undefined;
    }
    const playerId = playerIdFromPayload(event.payload);
    return event.payload["category"] === "event" && playerId !== undefined
      ? { kind: "event", playerId }
      : undefined;
  }
  if (event.type === "counterUsed") {
    if (!isRecord(event.payload)) {
      return undefined;
    }
    const playerId = playerIdFromPayload(event.payload);
    const cardId = event.payload["cardId"];
    const metadata =
      typeof cardId === "string"
        ? state.cardManifest.cards[cardId as CardInstance["cardId"]]
        : undefined;
    return metadata?.category === "event" && playerId !== undefined
      ? { kind: "event", playerId }
      : undefined;
  }
  if (event.type === "blockerActivated") {
    const payload = event.payload as {
      blocker?: { playerId?: PlayerId };
    };
    const playerId = payload.blocker?.playerId;
    return playerId === undefined ? undefined : { kind: "blocker", playerId };
  }
  return undefined;
};

const isRecentRuntimeEvent = (state: GameState, event: EngineEvent): boolean =>
  Number(event.createdAtStateSeq) >= Math.max(0, Number(state.seq) - 2);

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

const didActivationHappenAfterSourceEntered = (
  state: GameState,
  event: EngineEvent,
  source: CardInstance,
): boolean => {
  const fieldEntrySeq = sourceFieldEntryEventSeq(state, source);
  return fieldEntrySeq === undefined || event.seq > fieldEntrySeq;
};

const isOpponentActivationForSource = (
  state: GameState,
  source: CardInstance,
  activation: { kind: OpponentActivationKind; playerId: PlayerId },
): boolean => activation.playerId === getOpponentId(state, source.controller);

export const createOpponentActivationTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  opponentActivationTriggerQueueingError: (
    reason: OpponentActivationTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueOpponentActivationTriggers: (
    state: GameState,
  ) => EngineResult | undefined;
} => {
  const queueOpponentActivationTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const alreadyQueued = queuedOpponentActivationTriggerEventIds(state);
    const activationEvents = state.eventJournal.filter(
      (event) =>
        isRecentRuntimeEvent(state, event) &&
        !alreadyQueued.has(String(event.id)) &&
        opponentActivationFromEvent(state, event) !== undefined,
    );
    if (activationEvents.length === 0) {
      return undefined;
    }

    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];
    const sources = fieldTriggerSources(state);
    for (const event of activationEvents) {
      const activation = opponentActivationFromEvent(state, event);
      if (activation === undefined) {
        return toEngineResult(
          state,
          [],
          [
            opponentActivationTriggerQueueingError(
              "invalid-opponent-activation-event",
            ),
          ],
        );
      }

      for (const source of sources) {
        if (
          isCardEffectInvalidated(state, source) ||
          !didActivationHappenAfterSourceEntered(state, event, source) ||
          !isOpponentActivationForSource(state, source, activation)
        ) {
          continue;
        }
        const resolved = state.cardManifest.cards[source.cardId];
        if (
          resolved === undefined ||
          resolved.support.status !== "implemented-dsl"
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
        const activationEffects = lookup.definition.effects.filter(
          (effect) =>
            effect.trigger.type === "opponentActivated" &&
            effect.trigger.activations.includes(activation.kind),
        );
        if (activationEffects.length === 0) {
          continue;
        }
        const matching = activationEffects.filter((effect) =>
          isSupportedAutoRuntimeEffectBlock(effect, {
            category: "auto",
            sourcePresencePolicies: ["mustRemainInSameZone"],
            triggerType: "opponentActivated",
          }),
        );
        if (matching.length !== activationEffects.length) {
          return toEngineResult(
            state,
            [],
            [
              opponentActivationTriggerQueueingError(
                "unsupported-opponent-activation-definition",
              ),
            ],
          );
        }
        for (const effectBlock of matching) {
          const entry: EffectQueueEntry = {
            id: `queue-entry:${String(event.id)}:opponentActivated:${String(source.instanceId)}:${String(effectBlock.id)}` as EffectQueueEntry["id"],
            state: "pending",
            timingWindowId:
              `timing-window:${String(event.id)}:opponentActivated` as EffectQueueEntry["timingWindowId"],
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
              name: "effectRuntime:opponentActivationTriggerQueueing",
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

  return { queueOpponentActivationTriggers };
};
