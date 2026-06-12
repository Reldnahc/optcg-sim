import assert from "node:assert/strict";
import { test } from "vitest";

import { must, p1, p2 } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import { cardRef, setupAttackState } from "./test-fixtures.js";

test("declaring an attack emits a reusable cardRested event for the attacker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(result.errors, undefined);
  const restedEvent = result.events.find(
    (event) => event.type === "cardRested",
  );
  assert.ok(restedEvent !== undefined);
  assert.deepEqual(restedEvent.payload, {
    playerId: p1,
    instanceId: attacker.instanceId,
    cardId: attacker.cardId,
    category: "character",
  });
  assert.equal(restedEvent.visibility.type, "public");
});
