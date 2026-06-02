import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, CardInstance, PlayerId } from "@optcg/types";

import { must } from "../action-test-fixtures.js";
import { reorderDeckSlice } from "./state.js";

const p1 = "p1" as PlayerId;

const deckCard = (id: string, index: number): CardInstance => ({
  instanceId: `${id}-instance` as CardInstance["instanceId"],
  cardId: id as CardId,
  owner: p1,
  controller: p1,
  zone: { zone: "deck", playerId: p1, slot: "deck", index },
  attachedDon: [],
});

test("reorderDeckSlice places an ordered looked slice on top and reindexes deck", () => {
  const deck = [
    deckCard("look-a", 0),
    deckCard("look-b", 1),
    deckCard("tail-c", 2),
  ];

  const reordered = reorderDeckSlice({
    deck,
    destination: "top",
    orderedSlice: [must(deck[1], "look b"), must(deck[0], "look a")],
    playerId: p1,
    sliceCount: 2,
  });

  assert.deepEqual(
    reordered.map((card) => card.cardId),
    ["look-b", "look-a", "tail-c"],
  );
  assert.deepEqual(
    reordered.map((card) => card.zone.index),
    [0, 1, 2],
  );
});

test("reorderDeckSlice places an ordered looked slice on bottom and reindexes deck", () => {
  const deck = [
    deckCard("look-a", 0),
    deckCard("look-b", 1),
    deckCard("tail-c", 2),
  ];

  const reordered = reorderDeckSlice({
    deck,
    destination: "bottom",
    orderedSlice: [must(deck[1], "look b"), must(deck[0], "look a")],
    playerId: p1,
    sliceCount: 2,
  });

  assert.deepEqual(
    reordered.map((card) => card.cardId),
    ["tail-c", "look-b", "look-a"],
  );
  assert.deepEqual(
    reordered.map((card) => card.zone.index),
    [0, 1, 2],
  );
});
