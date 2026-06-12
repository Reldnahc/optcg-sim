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
import { isSupportedAutoRuntimeEffectBlock } from "../../effect-runtime-block-support.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  OnOpponentAttackTriggerQueueingFailureReason,
  WhenAttackingTriggerQueueingFailureReason,
} from "./core.js";
import {
  attackEventCardRefMatches,
  findCardInstance,
  toSnapshot,
} from "../../effect-runtime-trigger-source-lookup.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";

const attackDeclaredPayloadMatchesBattle = (
  event: EngineEvent,
  battle: NonNullable<GameState["battle"]>,
): boolean => {
  if (event.type !== "attackDeclared") {
    return false;
  }
  const payload = event.payload as {
    attacker?: {
      playerId?: PlayerId;
      instanceId?: string;
      cardId?: string;
    };
    target?: {
      playerId?: PlayerId;
      instanceId?: string;
      cardId?: string;
    };
  };
  return (
    payload.attacker?.playerId === battle.attacker.playerId &&
    payload.attacker.instanceId === battle.attacker.instanceId &&
    payload.attacker.cardId === battle.attacker.cardId &&
    payload.target?.playerId === battle.originalTarget.playerId &&
    payload.target.instanceId === battle.originalTarget.instanceId &&
    payload.target.cardId === battle.originalTarget.cardId
  );
};

const hasQueuedOpponentAttackTimingWindow = (
  state: GameState,
  event: EngineEvent,
): boolean => {
  const timingWindowId = `timing-window:${String(event.id)}:onOpponentAttack`;
  return state.eventJournal.some((candidate) => {
    if (candidate.type !== "effectQueued") {
      return false;
    }
    const payload = candidate.payload as { timingWindowId?: string };
    return payload.timingWindowId === timingWindowId;
  });
};

const hasQueuedWhenAttackingTimingWindow = (
  state: GameState,
  event: EngineEvent,
): boolean => {
  const timingWindowId = `timing-window:${String(event.id)}`;
  return state.eventJournal.some((candidate) => {
    if (candidate.type !== "effectQueued") {
      return false;
    }
    const payload = candidate.payload as { timingWindowId?: string };
    return payload.timingWindowId === timingWindowId;
  });
};

const attackDeclaredEventsForOpponentAttackTiming = (
  state: GameState,
  battle: NonNullable<GameState["battle"]>,
): EngineEvent[] => {
  const currentSequenceEvents = state.eventJournal.filter(
    (event) =>
      event.type === "attackDeclared" && event.createdAtStateSeq === state.seq,
  );
  if (currentSequenceEvents.length > 0) {
    return currentSequenceEvents;
  }
  return state.eventJournal.filter(
    (event) =>
      attackDeclaredPayloadMatchesBattle(event, battle) &&
      !hasQueuedOpponentAttackTimingWindow(state, event),
  );
};

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
  effect: Parameters<typeof isSupportedAutoRuntimeEffectBlock>[0],
): effect is Parameters<typeof isSupportedAutoRuntimeEffectBlock>[0] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  isSupportedAutoRuntimeEffectBlock(effect, {
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    triggerType: "onOpponentAttack",
  });

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
        event.createdAtStateSeq === state.seq &&
        !hasQueuedWhenAttackingTimingWindow(state, event),
    );
    if (attackDeclaredEvents.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
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
      if (isCardEffectInvalidated(state, source)) {
        continue;
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
        const entrySource = {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.zone.playerId,
          zone: source.zone,
        };
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
          orderingGroup: "turnPlayer",
          createdAtEventSeq: event.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: effectBlock.sourcePresencePolicy,
          causedBy: {
            type: "ruleProcess",
            name: "effectRuntime:whenAttackingTriggerQueueing",
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

  const queueOnOpponentAttackTriggers = (
    state: GameState,
  ): EngineResult | undefined => {
    if (state.effectQueue.length > 0 || state.deferredTriggers.length > 0) {
      return undefined;
    }
    const battle = state.battle;
    if (battle === undefined || battle.step !== "attack") {
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

    const attackDeclaredEvents = attackDeclaredEventsForOpponentAttackTiming(
      state,
      battle,
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
    const defenderSources = [
      defender.leader,
      ...defender.characters,
      ...(defender.stage === undefined ? [] : [defender.stage]),
    ].filter(
      (card) =>
        card.controller === defenderId && card.zone.playerId === defenderId,
    );

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
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
            source.zone.zone !== "characterArea" &&
            source.zone.zone !== "stageArea")
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
        if (isCardEffectInvalidated(state, source)) {
          continue;
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
            `queue-entry:${String(event.id)}:onOpponentAttack:${String(source.instanceId)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
          const timingWindowId =
            `timing-window:${String(event.id)}:onOpponentAttack` as EffectQueueEntry["timingWindowId"];
          const entrySource = {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: source.zone.playerId,
            zone: source.zone,
          };
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
            orderingGroup: "nonTurnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effectBlock.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: "effectRuntime:onOpponentAttackTriggerQueueing",
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

  return { queueWhenAttackingTriggers, queueOnOpponentAttackTriggers };
};
