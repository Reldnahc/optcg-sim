import { applyAction } from "@optcg/engine-core";
import type {
  CardFilter,
  CardId,
  EffectDefinition,
  EngineResult,
  PlayerId,
} from "@optcg/types";

import {
  installProbeTriggerCostCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardId;

export interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runOpponentAttackScenario = (
  input: {
    readonly category: "leader";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const attacker = must(state.players[p1], `player ${String(p1)}`);
  const defender = must(state.players[p2], `player ${String(p2)}`);
  attacker.leader.state = "active";
  defender.leader = {
    ...defender.leader,
    cardId: probeCardId,
  };
  const costCard = defender.hand.find((card) => card.cardId !== probeCardId);
  defender.hand =
    costCard === undefined
      ? []
      : [
          {
            ...costCard,
            zone: {
              zone: "hand" as const,
              playerId: p2,
              slot: "hand" as const,
              index: 0,
            },
          },
        ];
  installProbeTriggerCostCard(state, defender);

  return drainRuntime(
    applyAction(state, {
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
    }),
    input.setupFilters.length,
  );
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
