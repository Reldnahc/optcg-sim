import {
  applyAction,
  getLegalActions,
  resolveSupportedVanillaBattle,
} from "@optcg/engine-core";
import type {
  Action,
  CardInstance,
  CardFilter,
  EffectDefinition,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  configureProbeFieldSourceForScenario,
  fieldProbeSource,
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runOnKOScenario = (
  input: {
    readonly category: "character";
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
  state.turn.playerTurnCounts[p1] = 1;
  state.turn.playerTurnCounts[p2] = 2;
  state.turn.turnPlayerId = p2;
  const defender = must(state.players[p1], `player ${String(p1)}`);
  const attacker = must(state.players[p2], `player ${String(p2)}`);
  const source = fieldProbeSource(defender);
  if (source === undefined) {
    return {
      ok: false,
      reason: "probe card could not be fielded",
      pendingDecisionDrained: state.pendingDecision === undefined,
      effectQueueDrained: state.effectQueue.length === 0,
      eventCount: 0,
      decisionsResolved: 0,
      setupFilterCount: input.setupFilters.length,
    };
  }
  configureProbeFieldSourceForScenario(state, source, input.definition.effects);
  const currentSource = currentFieldCard(state, source) ?? source;
  currentSource.state = "rested";
  attacker.leader.state = "active";
  for (const card of defender.hand) {
    state.cardManifest.cards[card.cardId] = resolvedProbeCard({
      cardId: card.cardId,
      category: "character",
      effectText: "",
    });
  }

  const attacked = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.leader.instanceId,
      cardId: attacker.leader.cardId,
      playerId: p2,
      zone: attacker.leader.zone,
    },
    target: {
      instanceId: currentSource.instanceId,
      cardId: currentSource.cardId,
      playerId: p1,
      zone: currentSource.zone,
    },
  });
  if (attacked.errors !== undefined) {
    return drainRuntime(attacked, input.setupFilters.length);
  }
  const counterStepPass = getLegalActions(attacked.state, p1).find(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision" &&
      action.response.type === "cards" &&
      action.response.cards.length === 0,
  );
  const readyForResolution =
    counterStepPass === undefined
      ? attacked
      : applyAction(attacked.state, counterStepPass);
  return drainRuntime(
    readyForResolution.state.battle === undefined ||
      readyForResolution.errors !== undefined
      ? readyForResolution
      : resolveSupportedVanillaBattle(readyForResolution.state),
    input.setupFilters.length,
  );
};

const currentFieldCard = (
  state: GameState,
  source: CardInstance,
): CardInstance | undefined =>
  state.players[source.controller]?.characters.find(
    (candidate) => candidate.instanceId === source.instanceId,
  );

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
