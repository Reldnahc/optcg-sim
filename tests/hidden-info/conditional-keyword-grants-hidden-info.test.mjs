import assert from "node:assert/strict";
import { test } from "vitest";

import {
  must,
  p1,
  p2,
  resolvedCard,
} from "../../packages/engine-core/src/action-test-fixtures.ts";
import { applyAction } from "../../packages/engine-core/src/actions.ts";
import {
  addTrashMarker,
  cardRef,
  continuousKeywordEffectRecord,
  setupAttackState,
} from "../../packages/engine-core/src/battle/test-fixtures.ts";
import { filterStateForPlayer } from "../../packages/engine-core/src/filter-state-for-player.ts";

test("conditional keyword grants do not expose continuous records or private zone identities", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defender = must(p2State.characters[0], "defender");
  defender.state = "active";
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[defender.cardId] = resolvedCard({
    cardId: defender.cardId,
    category: "character",
    power: 3000,
  });
  addTrashMarker(state, p2);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "hidden-info-conditional-blocker",
      defender,
      "blocker",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];

  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  const attackerView = filterStateForPlayer(opened.state, p1);
  const serialized = JSON.stringify(attackerView);

  assert.equal(serialized.includes("continuousEffects"), false);
  assert.equal(serialized.includes("sourceSnapshot"), false);
  assert.equal(serialized.includes("trashCount"), false);
  for (const hiddenHandCard of must(opened.state.players[p2], "opened p2")
    .hand) {
    assert.equal(serialized.includes(String(hiddenHandCard.cardId)), false);
  }
  for (const hiddenLifeCard of must(opened.state.players[p2], "opened p2")
    .life) {
    assert.equal(
      serialized.includes(String(hiddenLifeCard.card.cardId)),
      false,
    );
  }
});
