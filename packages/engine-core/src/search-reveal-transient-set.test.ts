import assert from "node:assert/strict";
import type { Effect, TransientCardSet } from "@optcg/types";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import {
  createSupportedSearchRevealChoiceDecision,
  createSupportedSearchRevealChoiceDecisionFromTransientSet,
  createSupportedSearchRevealTransientSet,
} from "./effect-runtime-search-reveal.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
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

test("eligible search reveal path creates private reveal record and chooser-owned selectCards decision", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const entry = queueDrawForP1();

  const result = createSupportedSearchRevealChoiceDecision(
    state,
    entry,
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "decisionCreated");
  assert.equal(result.state === state, false);
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  const decision = must(result.state.pendingDecision, "pending decision");
  assert.equal(decision.id, "decision:selectCards:search-reveal:queue-entry-1");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(decision.visibility, { type: "private", playerId: p1 });
  assert.deepEqual(decision.request, {
    timing: "onResolution",
    chooser: "self",
    set: "set:search-reveal:queue-entry-1",
    filter: { categories: ["character"] },
    min: 0,
    max: 1,
    allowFewerIfUnavailable: true,
    visibility: "privateToChooser",
  });
  assert.deepEqual(decision.candidates, [
    {
      card: {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: p1,
        zone: topDeck.zone,
      },
      visibility: { type: "private", playerId: p1 },
    },
  ]);
  assert.deepEqual(decision.defaultResponse, { type: "cards", cards: [] });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "private", playerId: p1 },
      { type: "private", playerId: p1 },
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    revealId: "reveal:search-reveal:queue-entry-1",
    cards: [decision.candidates[0]?.card],
    origin: "topOfDeck",
    selectionSetId: "set:search-reveal:queue-entry-1",
  });
  assert.deepEqual(result.events[1]?.payload, {
    decisionId: decision.id,
    decisionType: "selectCards",
    playerId: p1,
  });
  assert.deepEqual(result.state.revealedCards, [
    {
      id: "reveal:search-reveal:queue-entry-1",
      cards: [decision.candidates[0]?.card],
      visibility: { type: "private", playerId: p1 },
      origin: "topOfDeck",
      createdAtStateSeq: result.state.seq,
      cleanupPolicy: "returnToOrigin",
    },
  ]);
  assert.deepEqual(result.state.eventJournal.slice(-2), result.events);
});

test("search reveal decision candidates are visible only to the chooser", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const result = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "decisionCreated");

  const chooserView = filterStateForPlayer(result.state, p1);
  const opponentView = filterStateForPlayer(result.state, p2);
  const chooserSerialized = JSON.stringify(chooserView);
  const opponentSerialized = JSON.stringify(opponentView);

  assert.equal(chooserView.pendingDecision?.type, "selectCards");
  assert.equal(chooserSerialized.includes("queueEntryId"), false);
  assert.equal(chooserSerialized.includes("effectBlockId"), false);
  assert.deepEqual(
    chooserView.revealedCards.map((record) => record.id),
    ["reveal:search-reveal:queue-entry-1"],
  );
  assert.equal(chooserSerialized.includes(String(topDeck.cardId)), true);
  assert.equal(chooserSerialized.includes(String(topDeck.instanceId)), true);
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentView.revealedCards, []);
  assert.equal(opponentSerialized.includes(String(topDeck.cardId)), false);
  assert.equal(opponentSerialized.includes(String(topDeck.instanceId)), false);
});

test("no eligible top-card search reveal creates no decision and leaks no identity", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "event");

  const result = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "noEligibleCandidate");
  assert.equal(result.state, state);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state.revealedCards, []);
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p1)).includes(
      String(topDeck.cardId),
    ),
    false,
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      String(topDeck.cardId),
    ),
    false,
  );
});

test("malformed search reveal transient set rejects without mutation", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const entry = queueDrawForP1();
  const malformedSet: TransientCardSet = {
    id: "set:search-reveal:queue-entry-1" as TransientCardSet["id"],
    cards: [
      {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: p1,
        zone: topDeck.zone,
      },
      {
        instanceId:
          "extra-instance" as TransientCardSet["cards"][number]["instanceId"],
        cardId: topDeck.cardId,
        playerId: p1,
        zone: topDeck.zone,
      },
    ],
    origin: "topOfDeck",
    ownerId: p1,
    controllerId: p1,
    visibility: { type: "private", playerId: p1 },
    cleanupPolicy: "returnToOrigin",
  };

  const result = createSupportedSearchRevealChoiceDecisionFromTransientSet(
    state,
    entry,
    supportedSearch(),
    malformedSet,
  );

  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(result.error.type, "effectRuntimeError");
  assert.deepEqual(result.error.details, {
    reason: "unsupported-transient-set-state",
  });
  assert.equal(state.pendingDecision, undefined);
  assert.deepEqual(state.revealedCards, []);
});
