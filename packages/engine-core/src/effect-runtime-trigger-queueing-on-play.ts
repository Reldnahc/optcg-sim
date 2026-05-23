import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import {
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedOptionalNoChoiceOnPlayDrawEffect,
} from "./effect-runtime-primitives.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  OnPlayTriggerQueueingFailureReason,
} from "./effect-runtime-trigger-queueing.js";
import {
  findCardInstance,
  toSnapshot,
} from "./effect-runtime-trigger-source-lookup.js";

const withoutCondition = (
  effect: EffectDefinition["effects"][number],
): EffectDefinition["effects"][number] => {
  const supportShape = { ...effect };
  delete (supportShape as { condition?: unknown }).condition;
  return supportShape;
};

const isSupportedOnPlayDrawUpToEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: { type: "drawUpTo"; count: number; player: "self" };
} =>
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.trigger.type === "onPlay" &&
  effect.category === "auto" &&
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "drawUpTo" &&
  Number.isInteger(effect.effect.count) &&
  effect.effect.count >= 0 &&
  effect.effect.player === "self";

const isSupportedOnPlayCompatibleQueuedEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  isSupportedNoChoiceOnPlayDrawEffect(withoutCondition(effect)) ||
  isSupportedOptionalNoChoiceOnPlayDrawEffect(withoutCondition(effect)) ||
  isSupportedOnPlayDrawUpToEffect(effect);

export const createOnPlayTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  onPlayTriggerQueueingError: (
    reason: OnPlayTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueOnPlayTriggers: (state: GameState) => EngineResult | undefined;
} => {
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
        isSupportedOnPlayCompatibleQueuedEffect,
      );
      if (matching.length !== onPlayEffects.length) {
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

  return { queueOnPlayTriggers };
};
