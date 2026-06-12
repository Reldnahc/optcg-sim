import type {
  CardId,
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
import { evaluateEffectBlockRuntimeSupport } from "../../effect-runtime-admission.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  MainEventTriggerQueueingFailureReason,
} from "./core.js";
import {
  findCardInstanceInTrash,
  toSnapshot,
} from "../../effect-runtime-trigger-source-lookup.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";

const isSupportedMainEventEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  effect.sourcePresencePolicy === "resolveFromDestinationZone" &&
  effect.trigger.type === "main" &&
  evaluateEffectBlockRuntimeSupport(effect).supported;

const queuedMainEventTriggerEventIds = (state: GameState): Set<string> =>
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
        payload.timingWindowId === `timing-window:${payload.triggerEventId}`
        ? [payload.triggerEventId]
        : [];
    }),
  );

const queuedOpponentActivationTriggerEventIds = (
  state: GameState,
): Set<string> =>
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
        payload.timingWindowId.endsWith(":opponentActivated")
        ? [payload.triggerEventId]
        : [];
    }),
  );

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
    const queuedMainEvents = queuedMainEventTriggerEventIds(state);
    const queuedOpponentActivations =
      queuedOpponentActivationTriggerEventIds(state);
    const acceptedCardPlayed = state.eventJournal.filter((event) => {
      if (
        event.type !== "cardPlayed" ||
        queuedMainEvents.has(String(event.id))
      ) {
        return false;
      }
      return (
        event.createdAtStateSeq === state.seq ||
        queuedOpponentActivations.has(String(event.id))
      );
    });
    if (acceptedCardPlayed.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
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
      const matching = mainEffects.filter(isSupportedMainEventEffect);
      if (matching.length !== mainEffects.length) {
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
      for (const effectBlock of matching) {
        const orderingGroup =
          source.zone.playerId === state.turn.turnPlayerId
            ? "turnPlayer"
            : "nonTurnPlayer";
        const queueId =
          `queue-entry:${String(event.id)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
        const timingWindowId =
          `timing-window:${String(event.id)}` as EffectQueueEntry["timingWindowId"];
        const entrySource = {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.zone.playerId,
          zone: source.zone,
        };
        const presentation = activeEffectTextPresentationForEffectBlock({
          effectBlock,
          resolvedCard: resolved,
          source: entrySource,
        });
        const entry: EffectQueueEntry = {
          id: queueId,
          state: "pending",
          timingWindowId,
          generation: 0,
          controllerId: source.zone.playerId,
          source: entrySource,
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
          ...(presentation === undefined ? {} : { presentation }),
        };
        appended.push({ entry, effectBlock, resolved });
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

  return { queueMainEventTriggers };
};
