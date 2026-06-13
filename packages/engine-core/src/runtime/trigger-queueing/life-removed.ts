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

import {
  appendEffectQueuedEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import {
  isAutoRuntimeTriggerCandidate,
  isSupportedAutoRuntimeEffectBlock,
} from "../../effect-runtime-block-support.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  LifeRemovedTriggerQueueingFailureReason,
} from "./core.js";
import {
  fieldTriggerSources,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";
import { matchEventTrigger } from "../event-hooks/matcher.js";

const lifeRemovedAutoAdapter = {
  category: "auto" as const,
  sourcePresencePolicies: ["mustRemainInSameZone"] as const,
  triggerType: "lifeRemoved" as const,
};

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

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
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
            isAutoRuntimeTriggerCandidate(effect, lifeRemovedAutoAdapter) &&
            matchEventTrigger(
              state,
              source,
              effect.trigger,
              event,
            ).triggerTypes.includes("lifeRemoved"),
        );
        if (lifeRemovedEffects.length === 0) {
          continue;
        }
        const matching = lifeRemovedEffects.filter((effect) =>
          isSupportedAutoRuntimeEffectBlock(effect, lifeRemovedAutoAdapter),
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
          const entrySource = {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: source.controller,
            zone: source.zone,
          };
          const entry: EffectQueueEntry = {
            id: queueId,
            state: "pending",
            timingWindowId,
            generation: 0,
            controllerId: source.controller,
            source: entrySource,
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
            ...effectQueueEntryPresentationForEffectBlock({
              effectBlock,
              resolvedCard: resolved,
              source: entrySource,
            }),
          };
          appended.push({ entry, effectBlock, resolved });
        }
      }
    }

    if (appended.length === 0) {
      return undefined;
    }

    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      effectQueue: [
        ...state.effectQueue,
        ...appended.map(({ entry }) => entry),
      ],
    };
    for (const { entry, effectBlock, resolved } of appended) {
      appendEffectQueuedEvent(state, events, entry, effectBlock, resolved);
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  return { queueLifeRemovedTriggers };
};
