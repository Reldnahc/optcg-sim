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
  EndOfYourTurnTriggerQueueingFailureReason,
} from "./core.js";
import { toSnapshot } from "../../effect-runtime-trigger-source-lookup.js";
import { canAdmitOncePerTurnEffect } from "../../rules/once-per-turn.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";

const endOfYourTurnAutoAdapter = {
  category: "auto" as const,
  sourcePresencePolicies: ["mustRemainInSameZone"] as const,
  triggerType: "endOfYourTurn" as const,
};

const endPhaseStartedEvents = (state: GameState): readonly EngineEvent[] => {
  const queuedTriggerEventIds = new Set(
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
  return state.eventJournal.filter((event) => {
    if (
      event.type !== "phaseStarted" ||
      event.createdAtStateSeq !== state.seq ||
      queuedTriggerEventIds.has(String(event.id))
    ) {
      return false;
    }
    const payload = event.payload as { phase?: unknown; playerId?: unknown };
    return payload.phase === "end" && typeof payload.playerId === "string";
  });
};

const fieldSourcesForPlayer = (
  state: GameState,
  playerId: PlayerId,
): readonly CardInstance[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  return [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ].filter(
    (card) => card.controller === playerId && card.zone.playerId === playerId,
  );
};

export const createEndOfTurnTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  endOfYourTurnTriggerQueueingError: (
    reason: EndOfYourTurnTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueEndOfYourTurnTriggers: (state: GameState) => EngineResult | undefined;
} => {
  const queueEndOfYourTurnTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const phaseEvents = endPhaseStartedEvents(state);
    if (phaseEvents.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
    const events: EngineEvent[] = [];
    for (const event of phaseEvents) {
      const payload = event.payload as { playerId?: PlayerId };
      if (payload.playerId === undefined) {
        return toEngineResult(
          state,
          [],
          [endOfYourTurnTriggerQueueingError("invalid-end-phase-event")],
        );
      }
      const controllerId = payload.playerId;
      for (const source of fieldSourcesForPlayer(state, controllerId)) {
        if (isCardEffectInvalidated(state, source)) {
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
        const endOfTurnEffects = lookup.definition.effects.filter((effect) =>
          isAutoRuntimeTriggerCandidate(effect, endOfYourTurnAutoAdapter),
        );
        if (endOfTurnEffects.length === 0) {
          continue;
        }
        const matching = endOfTurnEffects.filter((effect) =>
          isSupportedAutoRuntimeEffectBlock(effect, endOfYourTurnAutoAdapter),
        );
        if (matching.length !== endOfTurnEffects.length) {
          return toEngineResult(
            state,
            [],
            [
              endOfYourTurnTriggerQueueingError(
                "unsupported-end-of-your-turn-definition",
              ),
            ],
          );
        }
        for (const effectBlock of matching) {
          const entrySource = {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: controllerId,
            zone: source.zone,
          };
          const entry: EffectQueueEntry = {
            id: `queue-entry:${String(event.id)}:endOfYourTurn:${String(
              effectBlock.id,
            )}` as EffectQueueEntry["id"],
            state: "pending",
            timingWindowId:
              `timing-window:${String(event.id)}:endOfYourTurn` as EffectQueueEntry["timingWindowId"],
            generation: 0,
            controllerId,
            source: entrySource,
            sourceSnapshot: toSnapshot(source, resolved),
            triggerEventId: event.id,
            effectBlockId: effectBlock.id,
            orderingGroup: "turnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effectBlock.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: "effectRuntime:endOfYourTurnTriggerQueueing",
            },
            ...effectQueueEntryPresentationForEffectBlock({
              effectBlock,
              resolvedCard: resolved,
              source: entrySource,
            }),
          };
          if (!canAdmitOncePerTurnEffect(state, entry, effectBlock)) {
            continue;
          }
          appended.push({
            entry,
            effectBlock,
            resolved,
          });
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

  return { queueEndOfYourTurnTriggers };
};
