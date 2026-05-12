import assert from "node:assert/strict";
import type { Effect } from "@optcg/types";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
} from "./action-test-fixtures.js";
import { createSupportedSearchRevealTransientSet } from "./effect-runtime-search-reveal.js";
import { queueDrawForP1 } from "./effect-runtime-queue-processing-test-support.js";

const supportedSearch = (
  overrides: Partial<Extract<Effect, { type: "search" }>["request"]> = {},
): Extract<Effect, { type: "search" }> => ({
  type: "search",
  request: {
    zone: "deck",
    player: "self",
    lookCount: 1,
    filter: { categories: ["character"] },
    min: 0,
    max: 1,
    destination: "hand",
    revealTo: "chooserOnly",
    shuffleAfter: false,
    ...overrides,
  },
});

const markTopDeckCard = (
  state: ReturnType<typeof createActiveState>,
  category: "character" | "event",
) => {
  const player = must(state.players[p1], "p1");
  const topDeck = must(player.deck[0], "top deck");
  state.cardManifest.cards[topDeck.cardId] = resolvedCard({
    cardId: topDeck.cardId,
    category,
  });
  return topDeck;
};

test("supported top-1 Character deck search creates deterministic transient reveal set", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const entry = queueDrawForP1();

  const result = createSupportedSearchRevealTransientSet(
    state,
    entry,
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "created");
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(result.transientSet.id, "set:search-reveal:queue-entry-1");
  assert.deepEqual(result.transientSet.cards, [
    {
      instanceId: topDeck.instanceId,
      cardId: topDeck.cardId,
      playerId: p1,
      zone: topDeck.zone,
    },
  ]);
  assert.equal(result.transientSet.origin, "topOfDeck");
  assert.equal(result.transientSet.ownerId, p1);
  assert.equal(result.transientSet.controllerId, p1);
  assert.deepEqual(result.transientSet.visibility, {
    type: "private",
    playerId: p1,
  });
  assert.equal(result.transientSet.cleanupPolicy, "returnToOrigin");
  assert.equal(typeof result.transientSetHash, "string");

  const repeated = createSupportedSearchRevealTransientSet(
    state,
    entry,
    supportedSearch(),
  );
  assert.equal(repeated.ok, true);
  assert.equal(repeated.kind, "created");
  assert.equal(repeated.transientSetHash, result.transientSetHash);
});

test("supported top-1 deck search creates no transient set for absent or ineligible top card", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const originalDeck = [...player.deck];
  markTopDeckCard(state, "event");

  const ineligible = createSupportedSearchRevealTransientSet(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(ineligible.ok, true);
  assert.equal(ineligible.kind, "noEligibleCandidate");
  assert.equal(ineligible.state, state);
  assert.deepEqual(ineligible.events, []);
  assert.deepEqual(player.deck, originalDeck);

  player.deck = [];
  const absent = createSupportedSearchRevealTransientSet(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(absent.ok, true);
  assert.equal(absent.kind, "noEligibleCandidate");
  assert.equal(absent.state, state);
  assert.deepEqual(absent.events, []);
});

test("unsupported search reveal shapes fail closed without mutation or events", () => {
  const unsupportedEffects: Extract<Effect, { type: "search" }>[] = [
    supportedSearch({ zone: "trash" }),
    supportedSearch({ player: "opponent" }),
    supportedSearch({ lookCount: 2 }),
    supportedSearch({ filter: { categories: ["event"] } }),
    supportedSearch({ min: 1 }),
    supportedSearch({ max: 2 }),
    supportedSearch({ destination: "trash" }),
    supportedSearch({ revealTo: "bothPlayers" }),
    supportedSearch({ shuffleAfter: true }),
    supportedSearch({
      remainingCards: {
        destination: "deck",
        position: "bottom",
        order: "ownerChoice",
      },
    }),
  ];
  for (const [index, effect] of unsupportedEffects.entries()) {
    const state = createActiveState();
    const topDeck = markTopDeckCard(state, "character");
    const result = createSupportedSearchRevealTransientSet(
      state,
      queueDrawForP1(),
      effect,
    );

    assert.equal(result.ok, false, `case ${String(index)}`);
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
    assert.equal(
      must(state.players[p1], "p1").deck[0]?.instanceId,
      topDeck.instanceId,
    );
    assert.equal(result.error.type, "effectRuntimeError");
  }
});
