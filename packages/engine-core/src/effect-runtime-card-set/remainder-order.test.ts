import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance } from "@optcg/types";

import {
  addExtraDeckCard,
  createActiveState,
  must,
  p1,
} from "../action-test-fixtures.js";
import {
  activeDeckCardsForOrder,
  orderedIdsFromResponse,
  placeOrderedCardsOnDeck,
} from "./remainder-order.js";

const stateWithDeckCount = (count: number) => {
  const state = createActiveState();
  while ((state.players[p1]?.deck.length ?? 0) < count) {
    addExtraDeckCard(state, p1);
  }
  return state;
};

const topDeckCards = (count: number): CardInstance[] => {
  const state = stateWithDeckCount(count);
  const player = must(state.players[p1], "player");
  return player.deck.slice(0, count);
};

test("orderedIdsFromResponse accepts exactly the expected ids in any order", () => {
  assert.deepEqual(orderedIdsFromResponse(["b", "a"], ["a", "b"]), ["b", "a"]);
  assert.equal(orderedIdsFromResponse(["a", "a"], ["a", "b"]), null);
  assert.equal(orderedIdsFromResponse(["a"], ["a", "b"]), null);
  assert.equal(orderedIdsFromResponse(["a", "c"], ["a", "b"]), null);
  assert.equal(orderedIdsFromResponse(["a", 1], ["a", "b"]), null);
});

test("activeDeckCardsForOrder returns the active ordered deck prefix or fails closed", () => {
  const state = stateWithDeckCount(2);
  const player = must(state.players[p1], "player");
  const expected = player.deck.slice(0, 2).map((card) => ({
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId: p1,
    zone: card.zone,
  }));

  assert.deepEqual(activeDeckCardsForOrder(state, p1, expected), [
    player.deck[0],
    player.deck[1],
  ]);
  assert.equal(
    activeDeckCardsForOrder(
      {
        ...state,
        players: {
          ...state.players,
          [p1]: {
            ...player,
            deck: [player.deck[1], player.deck[0], ...player.deck.slice(2)],
          },
        },
      },
      p1,
      expected,
    ),
    null,
  );
});

test("placeOrderedCardsOnDeck moves an ordered subset to the deck bottom", () => {
  const state = stateWithDeckCount(3);
  const [first, second, third] = topDeckCards(3);
  assert.ok(first !== undefined && second !== undefined && third !== undefined);

  const moved = placeOrderedCardsOnDeck(state, p1, [third, first], "bottom");
  assert.ok(moved !== null);
  const nextDeck = must(moved.players[p1], "player").deck;

  assert.equal(nextDeck.at(-2)?.instanceId, third.instanceId);
  assert.equal(nextDeck.at(-1)?.instanceId, first.instanceId);
  assert.deepEqual(
    nextDeck.map((card) => card.zone.index),
    nextDeck.map((_, index) => index),
  );
  assert.equal(
    nextDeck.some((card) => card.instanceId === second.instanceId),
    true,
  );
});
