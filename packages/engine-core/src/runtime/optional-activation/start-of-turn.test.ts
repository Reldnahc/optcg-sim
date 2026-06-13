import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { applyAction, getLegalActions } from "../../actions.js";
import {
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1, p2, resolvedCard } from "../../action-test-fixtures.js";

const installStartOfTurnDrawDefinition = (params: {
  state: ReturnType<typeof makeMainPhaseLegalActionState>;
  sourceCardId: ReturnType<typeof toCardId>;
  definitionId: string;
  effectId: ReturnType<typeof toEffectId>;
}): EffectDefinition => {
  const definition: EffectDefinition = {
    cardId: params.sourceCardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: params.effectId,
        category: "activate",
        trigger: { type: "startOfYourTurn" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
    metadata: {
      sourceTextHash: `${params.definitionId}:source`,
      rulesVersion: `${params.definitionId}:rules`,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  params.state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [params.definitionId]: definition,
  };
  params.state.cardManifest.cards[params.sourceCardId] = resolvedCard({
    cardId: params.sourceCardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: params.definitionId,
      sourceTextHash: definition.metadata.sourceTextHash,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: params.state.cardManifest.cardDataVersion,
    },
  });
  return definition;
};

test("start-of-turn activations are legal only for the turn player during refresh", () => {
  const state = makeMainPhaseLegalActionState();
  state.turn.phase = "refresh";
  const leader = must(state.players[p1], "p1").leader;
  const effectId = toEffectId("start-turn-leader-draw");
  installStartOfTurnDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    definitionId: "def-start-turn-leader-draw",
    effectId,
  });

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );
  const p2Actions = getLegalActions(state, p2).filter(
    (action) => action.type === "activateEffect",
  );
  const mainPhaseState = {
    ...state,
    turn: { ...state.turn, phase: "main" as const },
  };

  assert.equal(p1Actions.length, 1);
  assert.deepEqual(p2Actions, []);
  assert.deepEqual(
    getLegalActions(mainPhaseState, p1).filter(
      (action) => action.type === "activateEffect",
    ),
    [],
  );
});

test("start-of-turn activation queues and resolves through reusable runtime bodies", () => {
  const state = makeMainPhaseLegalActionState();
  state.turn.phase = "refresh";
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;
  const effectId = toEffectId("start-turn-leader-draw");
  installStartOfTurnDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    definitionId: "def-start-turn-leader-draw",
    effectId,
  });

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").deck.length,
    beforeDeck - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );
});
