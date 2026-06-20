import { applyAction, getLegalActions } from "@optcg/engine-core";
import type {
  Action,
  CardFilter,
  CardInstance,
  EffectBlock,
  EffectDefinition,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardInstance["cardId"];

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runCounterScenario = (
  input: {
    readonly category: "event";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
    effectBlocks: readonly EffectBlock[],
    options: { readonly allowBattleRemainder?: boolean },
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const attacker = must(state.players[p1], `player ${String(p1)}`);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader.state = "active";
  const probeHandIndex = attacker.hand.findIndex(
    (candidate) => candidate.cardId === probeCardId,
  );
  const probeCard = attacker.hand[probeHandIndex];
  if (probeCard === undefined) {
    return probeFailure(
      state,
      0,
      0,
      input.setupFilters.length,
      "probe counter event was not in hand",
    );
  }
  attacker.hand = attacker.hand
    .filter((_, index) => index !== probeHandIndex)
    .map((card, index) => ({
      ...card,
      zone: {
        zone: "hand" as const,
        playerId: p1,
        slot: "hand" as const,
        index,
      },
    }));
  const costCard = defender.hand.find(
    (candidate) => candidate.cardId !== probeCardId,
  );
  defender.hand = [
    {
      ...probeCard,
      owner: p2,
      controller: p2,
      zone: {
        zone: "hand" as const,
        playerId: p2,
        slot: "hand" as const,
        index: 0,
      },
    },
    ...(costCard === undefined
      ? []
      : [
          {
            ...costCard,
            owner: p2,
            controller: p2,
            zone: {
              zone: "hand" as const,
              playerId: p2,
              slot: "hand" as const,
              index: 1,
            },
          },
        ]),
  ];
  if (costCard !== undefined) {
    state.cardManifest.cards[costCard.cardId] = resolvedProbeCard({
      cardId: costCard.cardId,
      category: "character",
      effectText: "",
    });
  }
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.leader.instanceId,
      cardId: attacker.leader.cardId,
      playerId: p1,
      zone: attacker.leader.zone,
    },
    target: {
      instanceId: defender.leader.instanceId,
      cardId: defender.leader.cardId,
      playerId: p2,
      zone: defender.leader.zone,
    },
  });
  if (opened.errors !== undefined) {
    return drainRuntime(
      opened,
      input.setupFilters.length,
      input.definition.effects,
      {},
    );
  }
  const counterWindow = advanceToCounterAction(opened, probeCard.instanceId);
  if (counterWindow.action === undefined) {
    return probeFailure(
      counterWindow.result.state,
      counterWindow.result.events.length,
      counterWindow.decisionsResolved,
      input.setupFilters.length,
      "no legal useCounter action",
    );
  }
  return drainRuntime(
    applyAction(counterWindow.result.state, counterWindow.action),
    input.setupFilters.length,
    input.definition.effects,
    { allowBattleRemainder: true },
  );
};

const advanceToCounterAction = (
  initialResult: EngineResult,
  cardInstanceId: CardInstance["instanceId"],
): {
  readonly action?: Extract<Action, { type: "useCounter" }>;
  readonly decisionsResolved: number;
  readonly result: EngineResult;
} => {
  let result = initialResult;
  let decisionsResolved = 0;
  for (let step = 0; step < 5; step += 1) {
    const legalActions = getLegalActions(result.state, p2);
    const counterAction = legalActions.find(
      (action): action is Extract<Action, { type: "useCounter" }> =>
        action.type === "useCounter" &&
        action.cardInstanceId === cardInstanceId,
    );
    if (counterAction !== undefined) {
      return { action: counterAction, decisionsResolved, result };
    }
    const passAction = legalActions.find(
      (action): action is Extract<Action, { type: "respondToDecision" }> =>
        action.type === "respondToDecision" &&
        action.response.type === "cards" &&
        action.response.cards.length === 0,
    );
    if (passAction === undefined) {
      return { decisionsResolved, result };
    }
    result = applyAction(result.state, passAction);
    decisionsResolved += 1;
    if (result.errors !== undefined) {
      return { decisionsResolved, result };
    }
  }
  return { decisionsResolved, result };
};

const probeFailure = (
  state: GameState,
  eventCount: number,
  decisionsResolved: number,
  setupFilterCount: number,
  reason: string,
): BehaviorProbeRunResult => ({
  ok: false,
  reason,
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount,
  decisionsResolved,
  setupFilterCount,
});

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
