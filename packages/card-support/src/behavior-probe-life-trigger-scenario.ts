import { applyAction, getLegalActions } from "@optcg/engine-core";
import type {
  Action,
  CardFilter,
  CardId,
  EffectBlock,
  EffectDefinition,
  EngineResult,
  PlayerId,
} from "@optcg/types";

import {
  ensureProbePlayerDeckCount,
  ensureProbePlayerHandCount,
  ensureProbePlayerLifeCount,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const probeCardId = "probe-card" as CardId;

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runLifeTriggerScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
    effectBlocks: readonly EffectBlock[],
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
  defender.hand = [];
  ensureProbePlayerHandCount(state, p2, 5);
  ensureProbePlayerDeckCount(state, p2, 5);
  ensureProbePlayerLifeCount(state, p2, 1);
  const topLife = must(defender.life[0], "defender top Life");
  defender.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: probeCardId,
    },
  };
  const resolved = must(
    state.cardManifest.cards[probeCardId],
    "probe card metadata",
  );
  state.cardManifest.cards[probeCardId] = {
    ...resolved,
    triggerText: input.text,
  };

  const attacked = applyAction(state, {
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
  if (attacked.errors !== undefined) {
    return drainRuntime(
      attacked,
      input.setupFilters.length,
      input.definition.effects,
    );
  }
  const counterStepPass = getLegalActions(attacked.state, p2).find(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision" &&
      action.response.type === "cards" &&
      action.response.cards.length === 0,
  );
  const readyForTrigger =
    counterStepPass === undefined
      ? attacked
      : applyAction(attacked.state, counterStepPass);
  return drainRuntime(
    readyForTrigger,
    input.setupFilters.length,
    input.definition.effects,
  );
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
