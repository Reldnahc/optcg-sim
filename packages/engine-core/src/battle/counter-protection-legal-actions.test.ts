import assert from "node:assert/strict";
import { test } from "vitest";

import { getLegalActions } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import {
  cardRef,
  protectTargetFromOpponentEffectKO,
  setupAttackState,
} from "./test-fixtures.js";

test("counter-step legal actions expose Character Counters against opponent-effect K.O. protected Characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const counterCard = must(p2State.hand[0], "counter card");
  protectTargetFromOpponentEffectKO(state, target);
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 4000,
  });
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(target, p2),
  });

  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "counter decision");
  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "useCounter",
      cardInstanceId: counterCard.instanceId,
      target: cardRef(target, p2),
    },
  ]);
});
