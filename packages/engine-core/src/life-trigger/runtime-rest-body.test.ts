import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction } from "../actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { applyDeclareAttack } from "../battle/actions.js";
import {
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "../battle/test-fixtures.js";

test("activated Life trigger resolves reusable rest body against opponent leader", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-rest-opponent-leader");
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  const definition = effectDefinition(
    lifeCardId,
    { type: "trigger" },
    { type: "rest", target: { type: "opponentLeader" } },
  );
  const effect = must(definition.effects[0], "trigger effect");
  const supported = {
    ...definition,
    effects: [
      {
        ...effect,
        optional: false,
        oncePerTurn: false,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
  state.cardManifest.cards[lifeCardId] = {
    ...resolvedCard({
      cardId: lifeCardId,
      category: "event",
      cost: 1,
      triggerText: "[Trigger] Rest your opponent's Leader.",
    }),
    support: {
      cardId: lifeCardId,
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-rest-opponent-leader",
      tested: true,
      rulesVersion: supported.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: supported.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-rest-opponent-leader": supported,
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);
  const passed = passCounterStep(opened.state, p2);
  assert.equal(passed.errors, undefined);
  const decision = must(passed.state.pendingDecision, "life trigger decision");

  const result = applyAction(passed.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.revealedCards.length, 0);
  assert.equal(
    must(result.state.players[p1], "attacking player").leader.state,
    "rested",
  );
});
