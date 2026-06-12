import type {
  CardInstance,
  CardId,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  PlayerRef,
  Trigger,
} from "@optcg/types";

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { cardMatchesSearchFilter, getOpponentId } from "../../actions/state.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import {
  isSupportedAutoRuntimeEffectBlock,
  triggerContainsType,
} from "../../effect-runtime-block-support.js";
import {
  fieldTriggerSources,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  EventReactionTriggerQueueingFailureReason,
} from "./core.js";

type EventReactionTriggerType =
  | "damageDealt"
  | "fieldRemoved"
  | "cardPlayed"
  | "cardRested"
  | "donReturned";

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
          payload.timingWindowId.endsWith(":donReturned"))
        ? [payload.triggerEventId]
        : [];
    }),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

const didEventHappenAfterSourceEntered = (
  state: GameState,
  event: EngineEvent,
  source: CardInstance,
): boolean => {
  const fieldEntrySeq = sourceFieldEntryEventSeq(state, source);
  return fieldEntrySeq === undefined || event.seq > fieldEntrySeq;
};

const playerRefMatchesSource = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  playerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return playerId === source.controller;
    case "owner":
      return playerId === source.owner;
    case "opponent":
      return playerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return playerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return playerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const damagedPlayer = (
  state: GameState,
  event: EngineEvent,
): PlayerId | undefined => {
  if (event.type !== "damageDealt" || event.visibility.type !== "public") {
    return undefined;
  }
  if (!isRecord(event.payload)) {
    return undefined;
  }
  const damagedPlayerId = event.payload["damagedPlayerId"];
  if (typeof damagedPlayerId === "string") {
    return damagedPlayerId as PlayerId;
  }
  const target = event.payload["target"];
  if (typeof target !== "string") {
    return undefined;
  }
  return Object.values(state.players).find(
    (player) => player.leader.instanceId === target,
  )?.playerId;
};

const matchesDamageTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "damageDealt" }>,
  event: EngineEvent,
): boolean => {
  const playerId = damagedPlayer(state, event);
  return (
    playerId !== undefined &&
    trigger.players.some((ref) =>
      playerRefMatchesSource(state, source, ref, playerId),
    )
  );
};

const matchesFieldRemovedTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "fieldRemoved" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardMoved" || event.visibility.type !== "public") {
    return false;
  }
  if (!isRecord(event.payload)) {
    return false;
  }
  const from = zoneRefFromUnknown(event.payload["from"]);
  if (
    from?.playerId === undefined ||
    (from.zone !== "leaderArea" &&
      from.zone !== "characterArea" &&
      from.zone !== "stageArea") ||
    !playerRefMatchesSource(state, source, trigger.player, from.playerId)
  ) {
    return false;
  }
  if (trigger.sourceKind === "ko" && event.payload["reason"] !== "ko") {
    return false;
  }
  const cardId = event.payload["cardId"];
  const resolved =
    typeof cardId === "string"
      ? state.cardManifest.cards[cardId as CardId]
      : undefined;
  return (
    trigger.filter === undefined ||
    cardMatchesSearchFilter(resolved, trigger.filter)
  );
};

const matchesCardPlayedTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "cardPlayed" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardPlayed" || event.visibility.type !== "public") {
    return false;
  }
  if (!isRecord(event.payload)) {
    return false;
  }
  const payload = event.payload;
  if (trigger.sourceFilter !== undefined) {
    return false;
  }
  const playerId = payload["playerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  if (
    trigger.sourceZone !== undefined &&
    payload["sourceZone"] !== trigger.sourceZone
  ) {
    return false;
  }
  const cardId = payload["cardId"];
  const resolved =
    typeof cardId === "string"
      ? state.cardManifest.cards[cardId as CardId]
      : undefined;
  if (
    trigger.filter !== undefined &&
    !cardMatchesSearchFilter(resolved, trigger.filter)
  ) {
    return false;
  }
  if (trigger.anyOf === undefined) {
    return true;
  }
  return trigger.anyOf.some((branch) => {
    if (branch.sourceFilter !== undefined) {
      return false;
    }
    if (
      branch.sourceZone !== undefined &&
      payload["sourceZone"] !== branch.sourceZone
    ) {
      return false;
    }
    return (
      branch.filter === undefined ||
      cardMatchesSearchFilter(resolved, branch.filter)
    );
  });
};

const matchesCardRestedTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "cardRested" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardRested" || event.visibility.type !== "public") {
    return false;
  }
  if (!isRecord(event.payload)) {
    return false;
  }
  const payload = event.payload;
  const playerId = payload["playerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  if (
    trigger.target === "self" &&
    (payload["instanceId"] !== source.instanceId ||
      payload["cardId"] !== source.cardId)
  ) {
    return false;
  }
  if (trigger.sourceController !== undefined) {
    const sourceControllerId = payload["sourceControllerId"];
    if (
      typeof sourceControllerId !== "string" ||
      !playerRefMatchesSource(
        state,
        source,
        trigger.sourceController,
        sourceControllerId as PlayerId,
      )
    ) {
      return false;
    }
  }
  if (
    trigger.sourceKind !== undefined &&
    trigger.sourceKind !== "any" &&
    payload["sourceKind"] !== trigger.sourceKind
  ) {
    return false;
  }
  const cardId = payload["cardId"];
  const resolved =
    typeof cardId === "string"
      ? state.cardManifest.cards[cardId as CardId]
      : undefined;
  return (
    trigger.filter === undefined ||
    cardMatchesSearchFilter(resolved, trigger.filter)
  );
};

const matchesDonReturnedTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "donReturned" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "donReturned" || event.visibility.type !== "public") {
    return false;
  }
  if (!isRecord(event.payload)) {
    return false;
  }
  const playerId = event.payload["playerId"];
  return (
    typeof playerId === "string" &&
    playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  );
};

const matchingTriggerTypes = (
  state: GameState,
  source: CardInstance,
  trigger: Trigger,
  event: EngineEvent,
): readonly EventReactionTriggerType[] => {
  if (trigger.type === "anyOf") {
    return [
      ...new Set(
        trigger.triggers.flatMap((child) =>
          matchingTriggerTypes(state, source, child, event),
        ),
      ),
    ];
  }
  if (
    trigger.type === "damageDealt" &&
    matchesDamageTrigger(state, source, trigger, event)
  ) {
    return ["damageDealt"];
  }
  if (
    trigger.type === "fieldRemoved" &&
    matchesFieldRemovedTrigger(state, source, trigger, event)
  ) {
    return ["fieldRemoved"];
  }
  if (
    trigger.type === "cardPlayed" &&
    matchesCardPlayedTrigger(state, source, trigger, event)
  ) {
    return ["cardPlayed"];
  }
  if (
    trigger.type === "cardRested" &&
    matchesCardRestedTrigger(state, source, trigger, event)
  ) {
    return ["cardRested"];
  }
  if (
    trigger.type === "donReturned" &&
    matchesDonReturnedTrigger(state, source, trigger, event)
  ) {
    return ["donReturned"];
  }
  return [];
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
        isRecentRuntimeEvent(state, event) &&
        !alreadyQueued.has(String(event.id)) &&
        (event.type === "damageDealt" ||
          event.type === "cardMoved" ||
          event.type === "cardPlayed" ||
          event.type === "cardRested" ||
          event.type === "donReturned"),
    );
    if (reactionEvents.length === 0) {
      return undefined;
    }

    const appended: EffectQueueEntry[] = [];
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
        const reactionEffects = lookup.definition.effects.flatMap((effect) => {
          const triggerTypesForEvent = matchingTriggerTypes(
            state,
            source,
            effect.trigger,
            event,
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
                isSupportedAutoRuntimeEffectBlock(effect, {
                  category: "auto",
                  sourcePresencePolicies: ["mustRemainInSameZone"],
                  triggerType,
                }),
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

  return { queueEventReactionTriggers };
};
