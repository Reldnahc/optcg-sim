import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
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
  triggerContainsType,
} from "../../effect-runtime-block-support.js";
import {
  fieldTriggerSources,
  toSnapshot,
} from "../../effect-runtime-trigger-source-lookup.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";
import {
  matchEventTrigger,
  type EventReactionTriggerType,
} from "../event-hooks/matcher.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  EventReactionTriggerQueueingFailureReason,
} from "./core.js";

const queuedEventReactionTriggerEventIds = (state: GameState): Set<string> =>
  new Set(
    state.eventJournal.flatMap((event) => {
      if (event.type !== "effectQueued") {
        return [];
      }
      const payload = event.payload as {
        timingWindowId?: unknown;
        triggerEventId?: unknown;
      };
      return typeof payload.triggerEventId === "string" &&
        typeof payload.timingWindowId === "string" &&
        (payload.timingWindowId.endsWith(":damageDealt") ||
          payload.timingWindowId.endsWith(":fieldRemoved") ||
          payload.timingWindowId.endsWith(":cardPlayed") ||
          payload.timingWindowId.endsWith(":cardRested") ||
          payload.timingWindowId.endsWith(":donReturned") ||
          payload.timingWindowId.endsWith(":donAttached") ||
          payload.timingWindowId.endsWith(":attackDeclared") ||
          payload.timingWindowId.endsWith(":effectQueued") ||
          payload.timingWindowId.endsWith(":effectResolved") ||
          payload.timingWindowId.endsWith(":triggerActivated") ||
          payload.timingWindowId.endsWith(":lifeRemoved"))
        ? [payload.triggerEventId]
        : [];
    }),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const supportedAutoEventReactionTriggerTypes: ReadonlySet<EventReactionTriggerType> =
  new Set([
    "damageDealt",
    "fieldRemoved",
    "cardPlayed",
    "cardRested",
    "donReturned",
    "donAttached",
    "attackDeclared",
    "effectQueued",
    "effectResolved",
    "triggerActivated",
    "lifeRemoved",
  ]);

const autoEventReactionAdapter = (triggerType: EventReactionTriggerType) => ({
  category: "auto" as const,
  sourcePresencePolicies: ["mustRemainInSameZone"] as const,
  triggerType,
});

const isRecentRuntimeEvent = (state: GameState, event: EngineEvent): boolean =>
  Number(event.createdAtStateSeq) >= Math.max(0, Number(state.seq) - 2);

const isRuntimeEffectEvent = (event: EngineEvent): boolean =>
  event.causedBy?.type === "effect" || event.causedBy?.type === "decision";

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

const didEventHappenAfterSourceEntered = (
  state: GameState,
  event: EngineEvent,
  source: CardInstance,
): boolean => {
  const fieldEntrySeq = sourceFieldEntryEventSeq(state, source);
  return fieldEntrySeq === undefined || event.seq > fieldEntrySeq;
};

export const createEventReactionTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  eventReactionTriggerQueueingError: (
    reason: EventReactionTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueEventReactionTriggers: (state: GameState) => EngineResult | undefined;
} => {
  const queueEventReactionTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const alreadyQueued = queuedEventReactionTriggerEventIds(state);
    const reactionEvents = state.eventJournal.filter(
      (event) =>
        (isRecentRuntimeEvent(state, event) || isRuntimeEffectEvent(event)) &&
        !alreadyQueued.has(String(event.id)) &&
        (event.type === "damageDealt" ||
          event.type === "cardMoved" ||
          event.type === "cardPlayed" ||
          event.type === "cardRested" ||
          event.type === "donReturned" ||
          event.type === "donAttached" ||
          event.type === "attackDeclared" ||
          event.type === "effectQueued" ||
          event.type === "effectResolved" ||
          event.type === "triggerActivated"),
    );
    if (reactionEvents.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
    const events: EngineEvent[] = [];
    const sources = fieldTriggerSources(state);
    for (const event of reactionEvents) {
      for (const source of sources) {
        if (
          isCardEffectInvalidated(state, source) ||
          !didEventHappenAfterSourceEntered(state, event, source)
        ) {
          continue;
        }
        const resolved = state.cardManifest.cards[source.cardId];
        if (
          resolved === undefined ||
          resolved.support.status !== "implemented-dsl" ||
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
        const reactionEffects = lookup.definition.effects.flatMap((effect) => {
          const match = matchEventTrigger(state, source, effect.trigger, event);
          const triggerTypesForEvent = match.triggerTypes.filter(
            (triggerType) =>
              supportedAutoEventReactionTriggerTypes.has(triggerType) &&
              isAutoRuntimeTriggerCandidate(
                effect,
                autoEventReactionAdapter(triggerType),
              ),
          );
          return triggerTypesForEvent.length === 0
            ? []
            : [{ effect, triggerTypesForEvent }];
        });
        if (reactionEffects.length === 0) {
          continue;
        }
        const matching = reactionEffects.filter(
          ({ effect, triggerTypesForEvent }) =>
            triggerTypesForEvent.every(
              (triggerType) =>
                triggerContainsType(effect.trigger, triggerType) &&
                isSupportedAutoRuntimeEffectBlock(
                  effect,
                  autoEventReactionAdapter(triggerType),
                ),
            ),
        );
        if (matching.length !== reactionEffects.length) {
          return toEngineResult(
            state,
            [],
            [
              eventReactionTriggerQueueingError(
                "unsupported-event-reaction-definition",
              ),
            ],
          );
        }
        for (const { effect, triggerTypesForEvent } of matching) {
          if (effect.sourcePresencePolicy === undefined) {
            return toEngineResult(
              state,
              [],
              [eventReactionTriggerQueueingError("invalid-event-reaction")],
            );
          }
          const triggerType = triggerTypesForEvent[0];
          if (triggerType === undefined) {
            return toEngineResult(
              state,
              [],
              [eventReactionTriggerQueueingError("invalid-event-reaction")],
            );
          }
          const entrySource = {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: source.controller,
            zone: source.zone,
          };
          const entry: EffectQueueEntry = {
            id: `queue-entry:${String(event.id)}:${triggerType}:${String(source.instanceId)}:${String(effect.id)}` as EffectQueueEntry["id"],
            state: "pending",
            timingWindowId:
              `timing-window:${String(event.id)}:${triggerType}` as EffectQueueEntry["timingWindowId"],
            generation: 0,
            controllerId: source.controller,
            source: entrySource,
            sourceSnapshot: toSnapshot(source, resolved),
            triggerEventId: event.id,
            effectBlockId: effect.id,
            orderingGroup:
              source.controller === state.turn.turnPlayerId
                ? "turnPlayer"
                : "nonTurnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effect.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: "effectRuntime:eventReactionTriggerQueueing",
            },
            ...effectQueueEntryPresentationForEffectBlock({
              effectBlock: effect,
              resolvedCard: resolved,
              source: entrySource,
            }),
          };
          appended.push({ entry, effectBlock: effect, resolved });
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

  return { queueEventReactionTriggers };
};
