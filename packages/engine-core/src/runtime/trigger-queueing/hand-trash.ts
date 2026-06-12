import type {
  CardFilter,
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  PlayerRef,
  ResolvedCard,
  CardId,
} from "@optcg/types";

import {
  appendEffectQueuedEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { cardMatchesSearchFilter, getOpponentId } from "../../actions/state.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import { isSupportedAutoRuntimeEffectBlock } from "../../effect-runtime-block-support.js";
import {
  fieldTriggerSources,
  toSnapshot,
} from "../../effect-runtime-trigger-source-lookup.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  HandTrashedByEffectTriggerQueueingFailureReason,
} from "./core.js";

const queuedHandTrashTriggerEventIds = (state: GameState): Set<string> =>
  new Set(
    state.eventJournal.flatMap((event) => {
      if (event.type !== "effectQueued") {
        return [];
      }
      const payload = event.payload as {
        timingWindowId?: unknown;
        triggerEventId?: unknown;
      };
      const timingWindowId = payload.timingWindowId;
      return typeof payload.triggerEventId === "string" &&
        typeof timingWindowId === "string" &&
        timingWindowId.endsWith(":handTrashedByEffect")
        ? [payload.triggerEventId]
        : [];
    }),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const handTrashEventPlayer = (event: EngineEvent): PlayerId | undefined => {
  if (event.type !== "cardTrashed" || event.visibility.type !== "public") {
    return undefined;
  }
  if (!isRecord(event.payload)) {
    return undefined;
  }
  return event.payload["reason"] === "trashFromHand" &&
    event.payload["triggerSource"] === "effect" &&
    typeof event.payload["playerId"] === "string"
    ? (event.payload["playerId"] as PlayerId)
    : undefined;
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

const didHandTrashHappenAfterSourceEntered = (
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
  trashedPlayerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return trashedPlayerId === source.controller;
    case "owner":
      return trashedPlayerId === source.owner;
    case "opponent":
      return trashedPlayerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return trashedPlayerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return trashedPlayerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const sourceFilterMatches = (
  state: GameState,
  event: EngineEvent,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (!isRecord(event.payload)) {
    return false;
  }
  const sourceCardId = event.payload["sourceCardId"];
  if (typeof sourceCardId !== "string") {
    return false;
  }
  const resolved = state.cardManifest.cards[sourceCardId as CardId];
  return resolved !== undefined && cardMatchesSearchFilter(resolved, filter);
};

export const createHandTrashedByEffectTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  handTrashTriggerQueueingError: (
    reason: HandTrashedByEffectTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueHandTrashedByEffectTriggers: (
    state: GameState,
  ) => EngineResult | undefined;
} => {
  const queueHandTrashedByEffectTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const alreadyQueued = queuedHandTrashTriggerEventIds(state);
    const handTrashEvents = state.eventJournal.filter(
      (event) =>
        isRecentRuntimeEvent(state, event) &&
        !alreadyQueued.has(String(event.id)) &&
        handTrashEventPlayer(event) !== undefined,
    );
    if (handTrashEvents.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
    const events: EngineEvent[] = [];
    const sources = fieldTriggerSources(state);
    for (const event of handTrashEvents) {
      const trashedPlayerId = handTrashEventPlayer(event);
      if (trashedPlayerId === undefined) {
        return toEngineResult(
          state,
          [],
          [
            handTrashTriggerQueueingError(
              "invalid-hand-trashed-by-effect-event",
            ),
          ],
        );
      }

      for (const source of sources) {
        if (
          isCardEffectInvalidated(state, source) ||
          !didHandTrashHappenAfterSourceEntered(state, event, source)
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
        const handTrashEffects = lookup.definition.effects.filter(
          (effect) =>
            effect.trigger.type === "handTrashedByEffect" &&
            playerRefMatches(
              state,
              source,
              effect.trigger.player,
              trashedPlayerId,
            ) &&
            sourceFilterMatches(state, event, effect.trigger.sourceFilter),
        );
        if (handTrashEffects.length === 0) {
          continue;
        }
        const matching = handTrashEffects.filter((effect) =>
          isSupportedAutoRuntimeEffectBlock(effect, {
            category: "auto",
            sourcePresencePolicies: ["mustRemainInSameZone"],
            triggerType: "handTrashedByEffect",
          }),
        );
        if (matching.length !== handTrashEffects.length) {
          return toEngineResult(
            state,
            [],
            [
              handTrashTriggerQueueingError(
                "unsupported-hand-trashed-by-effect-definition",
              ),
            ],
          );
        }
        for (const effectBlock of matching) {
          const entrySource = {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: source.controller,
            zone: source.zone,
          };
          const entry: EffectQueueEntry = {
            id: `queue-entry:${String(event.id)}:handTrashedByEffect:${String(source.instanceId)}:${String(effectBlock.id)}` as EffectQueueEntry["id"],
            state: "pending",
            timingWindowId:
              `timing-window:${String(event.id)}:handTrashedByEffect` as EffectQueueEntry["timingWindowId"],
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
              name: "effectRuntime:handTrashedByEffectTriggerQueueing",
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

  return { queueHandTrashedByEffectTriggers };
};
