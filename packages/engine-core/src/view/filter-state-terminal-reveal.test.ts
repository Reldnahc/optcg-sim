import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction } from "../actions.js";
import { createActiveState, must, p1, p2 } from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("reveals all private zones after the match is terminal", () => {
  const state = applyAction(createActiveState(), {
    type: "concede",
    playerId: p1,
  }).state;
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");

  const view = filterStateForPlayer(state, p1);
  const opponentHand = view.opponent.hand;
  const opponentDeck = view.opponent.deck;
  assert.ok(opponentHand);
  assert.ok(opponentDeck);

  assert.equal(view.self.deck?.length, p1State.deck.length);
  assert.equal(view.self.donDeck?.length, p1State.donDeck.length);
  assert.equal(opponentHand.length, p2State.hand.length);
  assert.equal(opponentDeck.length, p2State.deck.length);
  assert.equal(view.opponent.donDeck?.length, p2State.donDeck.length);
  assert.deepEqual(
    view.self.life.faceUpCards.map((card) => card.instanceId),
    p1State.life.map((lifeCard) => lifeCard.card.instanceId),
  );
  assert.deepEqual(
    view.opponent.life.faceUpCards.map((card) => card.instanceId),
    p2State.life.map((lifeCard) => lifeCard.card.instanceId),
  );
  assert.deepEqual(
    opponentHand.map((card) => card.instanceId),
    p2State.hand.map((card) => card.instanceId),
  );
  assert.deepEqual(
    opponentDeck.map((card) => card.instanceId),
    p2State.deck.map((card) => card.instanceId),
  );
});
