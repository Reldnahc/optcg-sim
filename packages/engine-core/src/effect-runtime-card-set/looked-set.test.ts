import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef, EffectQueueEntry } from "@optcg/types";

import {
  addExtraDeckCard,
  createActiveState,
  must,
  p1,
} from "../action-test-fixtures.js";
import {
  createPrivateTopDeckLookSet,
  createPrivateLookSetSelectCardsDecision,
  isCurrentTopDeckLookSet,
} from "./looked-set.js";

const stateWithDeckCount = (count: number) => {
  const state = createActiveState();
  while ((state.players[p1]?.deck.length ?? 0) < count) {
    addExtraDeckCard(state, p1);
  }
  return state;
};

const queueEntryId = "queue-entry:test-look" as EffectQueueEntry["id"];
const effectId = "effect:test-look" as EffectQueueEntry["effectBlockId"];

test("createPrivateTopDeckLookSet captures ordered top-deck refs privately", () => {
  const state = stateWithDeckCount(3);
  const player = must(state.players[p1], "player");
  const set = createPrivateTopDeckLookSet({
    count: 2,
    playerId: p1,
    setId: "set:test-look",
    state,
  });

  assert.ok(set !== null);
  assert.deepEqual(
    set.cards.map((card) => card.instanceId),
    player.deck.slice(0, 2).map((card) => card.instanceId),
  );
  assert.equal(set.origin, "topOfDeck");
  assert.equal(set.cleanupPolicy, "returnToOrigin");
  assert.deepEqual(set.visibility, { type: "private", playerId: p1 });
});

test("isCurrentTopDeckLookSet fails closed when the deck prefix changes", () => {
  const state = stateWithDeckCount(2);
  const player = must(state.players[p1], "player");
  const set = createPrivateTopDeckLookSet({
    count: 2,
    playerId: p1,
    setId: "set:test-look",
    state,
  });
  assert.ok(set !== null);

  assert.equal(isCurrentTopDeckLookSet(state, p1, set), true);
  assert.equal(
    isCurrentTopDeckLookSet(
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
      set,
    ),
    false,
  );
});

test("createPrivateLookSetSelectCardsDecision builds a private chooser decision", () => {
  const state = stateWithDeckCount(2);
  const set = createPrivateTopDeckLookSet({
    count: 2,
    playerId: p1,
    setId: "set:test-look",
    state,
  });
  assert.ok(set !== null);
  const candidates: CardRef[] = set.cards.slice(0, 1);
  const decision = createPrivateLookSetSelectCardsDecision({
    candidates,
    decisionId: "decision:selectCards:test-look",
    effectId,
    filter: { categories: ["character"] },
    max: 1,
    playerId: p1,
    prompt: "Choose a revealed card or decline.",
    queueEntryId,
    requestVisibility: "privateToChooser",
    setId: set.id,
  });

  assert.equal(decision.type, "selectCards");
  assert.deepEqual(decision.visibility, { type: "private", playerId: p1 });
  assert.equal(decision.request.set, set.id);
  assert.equal(decision.request.max, 1);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    candidates.map((card) => card.instanceId),
  );
  assert.deepEqual(decision.defaultResponse, { type: "cards", cards: [] });
});
