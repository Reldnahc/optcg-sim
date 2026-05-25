import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { isSupportedAutoRuntimeEffectBlock } from "./effect-runtime-block-support.js";
import {
  isSupportedNoChoiceOnOpponentAttackDrawEffect,
  isSupportedOptionalNoChoiceOnOpponentAttackDrawEffect,
} from "./effect-runtime-primitives.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  OnOpponentAttackTriggerQueueingFailureReason,
  WhenAttackingTriggerQueueingFailureReason,
} from "./effect-runtime-trigger-queueing.js";
import {
  attackEventCardRefMatches,
  findCardInstance,
  toSnapshot,
} from "./effect-runtime-trigger-source-lookup.js";

export const isSupportedWhenAttackingCompatibleQueuedEffect = (
  effect: Parameters<typeof isSupportedAutoRuntimeEffectBlock>[0],
): effect is Parameters<typeof isSupportedAutoRuntimeEffectBlock>[0] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  isSupportedAutoRuntimeEffectBlock(effect, {
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    triggerType: "whenAttacking",
  });

export const isSupportedOnOpponentAttackCompatibleQueuedEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Effect;
} =>
  isSupportedNoChoiceOnOpponentAttackDrawEffect(effect) ||
  isSupportedOptionalNoChoiceOnOpponentAttackDrawEffect(effect);

export const createAttackTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  whenAttackingTriggerQueueingError: (
    reason: WhenAttackingTriggerQueueingFailureReason,
  ) => EngineError,
  onOpponentAttackTriggerQueueingError: (
    reason: OnOpponentAttackTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueWhenAttackingTriggers: (state: GameState) => EngineResult | undefined;
  queueOnOpponentAttackTriggers: (state: GameState) => EngineResult | undefined;
} => {
  const queueWhenAttackingTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const attackDeclaredEvents = state.eventJournal.filter(
      (event) =>
        event.type === "attackDeclared" &&
        event.createdAtStateSeq === state.seq,
    );
    if (attackDeclaredEvents.length === 0) {
      return undefined;
    }

    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];
    for (const event of attackDeclaredEvents) {
      const payload = event.payload as {
        attacker?: {
          playerId?: PlayerId;
          instanceId?: string;
          cardId?: string;
          zone?: CardInstance["zone"];
        };
      };
      const attackerPayload = payload.attacker;
      if (
        attackerPayload?.playerId === undefined ||
        attackerPayload.instanceId === undefined ||
        attackerPayload.cardId === undefined
      ) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("invalid-attack-declared-event")],
        );
      }
      if (attackerPayload.playerId !== state.turn.turnPlayerId) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("invalid-attack-declared-event")],
        );
      }

      const source = findCardInstance(
        state,
        attackerPayload.playerId,
        attackerPayload.instanceId,
      );
      if (
        source === undefined ||
        source.cardId !== attackerPayload.cardId ||
        source.zone.playerId !== attackerPayload.playerId ||
        !attackEventCardRefMatches(
          attackerPayload,
          source,
          state.turn.turnPlayerId,
        ) ||
        (source.zone.zone !== "leaderArea" &&
          source.zone.zone !== "characterArea")
      ) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("source-presence-failed")],
        );
      }
      const resolved = state.cardManifest.cards[source.cardId];
      if (resolved === undefined) {
        return toEngineResult(
          state,
          [],
          [whenAttackingTriggerQueueingError("missing-card-definition")],
        );
      }
      if (resolved.support.effectDefinitionId === undefined) {
        continue;
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error]);
      }
      const whenAttackingEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "whenAttacking",
      );
      if (whenAttackingEffects.length === 0) {
        continue;
      }
      const matching = whenAttackingEffects.filter(
        isSupportedWhenAttackingCompatibleQueuedEffect,
      );
      if (matching.length !== whenAttackingEffects.length) {
        return toEngineResult(
          state,
          [],
          [
            whenAttackingTriggerQueueingError(
              "unsupported-when-attacking-definition",
            ),
          ],
        );
      }
      for (const effectBlock of matching) {
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
          orderingGroup: "turnPlayer",
          createdAtEventSeq: event.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: effectBlock.sourcePresencePolicy,
          causedBy: {
            type: "ruleProcess",
            name: "effectRuntime:whenAttackingTriggerQueueing",
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
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  const queueOnOpponentAttackTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const battle = state.battle;
    if (battle === undefined || battle.step !== "counter") {
      return undefined;
    }
    const defenderId = battle.currentTarget.playerId;
    if (defenderId === state.turn.turnPlayerId) {
      return toEngineResult(
        state,
        [],
        [onOpponentAttackTriggerQueueingError("invalid-attack-declared-event")],
      );
    }

    const attackDeclaredEvents = state.eventJournal.filter(
      (event) =>
        event.type === "attackDeclared" &&
        event.createdAtStateSeq === state.seq,
    );
    if (attackDeclaredEvents.length === 0) {
      return undefined;
    }

    const defender = state.players[defenderId];
    if (defender === undefined) {
      return toEngineResult(
        state,
        [],
        [onOpponentAttackTriggerQueueingError("source-presence-failed")],
      );
    }
    const defenderSources = [defender.leader, ...defender.characters].filter(
      (card) =>
        card.controller === defenderId && card.zone.playerId === defenderId,
    );

    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];
    for (const event of attackDeclaredEvents) {
      const payload = event.payload as {
        attacker?: {
          playerId?: PlayerId;
          instanceId?: string;
          cardId?: string;
          zone?: CardInstance["zone"];
        };
        target?: {
          playerId?: PlayerId;
          instanceId?: string;
          cardId?: string;
          zone?: CardInstance["zone"];
        };
      };
      const attackerPayload = payload.attacker;
      const targetPayload = payload.target;
      if (
        attackerPayload?.playerId !== state.turn.turnPlayerId ||
        attackerPayload.instanceId === undefined ||
        attackerPayload.cardId === undefined ||
        targetPayload?.playerId !== defenderId ||
        targetPayload.instanceId === undefined ||
        targetPayload.cardId === undefined
      ) {
        return toEngineResult(
          state,
          [],
          [
            onOpponentAttackTriggerQueueingError(
              "invalid-attack-declared-event",
            ),
          ],
        );
      }
      const attackingSource = findCardInstance(
        state,
        state.turn.turnPlayerId,
        attackerPayload.instanceId,
      );
      const attackedTarget = findCardInstance(
        state,
        defenderId,
        targetPayload.instanceId,
      );
      if (
        attackingSource === undefined ||
        attackedTarget === undefined ||
        !attackEventCardRefMatches(
          attackerPayload,
          attackingSource,
          state.turn.turnPlayerId,
        ) ||
        !attackEventCardRefMatches(targetPayload, attackedTarget, defenderId)
      ) {
        return toEngineResult(
          state,
          [],
          [onOpponentAttackTriggerQueueingError("source-presence-failed")],
        );
      }

      for (const candidate of defenderSources) {
        const source = findCardInstance(
          state,
          defenderId,
          candidate.instanceId,
        );
        if (
          source === undefined ||
          source.cardId !== candidate.cardId ||
          source.zone.playerId !== defenderId ||
          source.controller !== defenderId ||
          (source.zone.zone !== "leaderArea" &&
            source.zone.zone !== "characterArea")
        ) {
          return toEngineResult(
            state,
            [],
            [onOpponentAttackTriggerQueueingError("source-presence-failed")],
          );
        }
        const resolved = state.cardManifest.cards[source.cardId];
        if (resolved === undefined) {
          return toEngineResult(
            state,
            [],
            [onOpponentAttackTriggerQueueingError("missing-card-definition")],
          );
        }
        if (resolved.support.effectDefinitionId === undefined) {
          continue;
        }

        const lookup = dependencies.resolveImplementedDslEffectDefinition(
          resolved,
          state.cardManifest,
        );
        if (!lookup.ok) {
          return toEngineResult(state, [], [lookup.error]);
        }
        const onOpponentAttackEffects = lookup.definition.effects.filter(
          (effect) => effect.trigger.type === "onOpponentAttack",
        );
        if (onOpponentAttackEffects.length === 0) {
          continue;
        }
        const matching = onOpponentAttackEffects.filter(
          isSupportedOnOpponentAttackCompatibleQueuedEffect,
        );
        if (matching.length !== onOpponentAttackEffects.length) {
          return toEngineResult(
            state,
            [],
            [
              onOpponentAttackTriggerQueueingError(
                "unsupported-on-opponent-attack-definition",
              ),
            ],
          );
        }
        for (const effectBlock of matching) {
          const queueId =
            `queue-entry:${String(event.id)}:onOpponentAttack:${String(effectBlock.id)}` as EffectQueueEntry["id"];
          const timingWindowId =
            `timing-window:${String(event.id)}:onOpponentAttack` as EffectQueueEntry["timingWindowId"];
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
            orderingGroup: "nonTurnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effectBlock.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: "effectRuntime:onOpponentAttackTriggerQueueing",
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

  return { queueWhenAttackingTriggers, queueOnOpponentAttackTriggers };
};
