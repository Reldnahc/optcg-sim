import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardRef,
  DecisionId,
  Effect,
  GameState,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import { createSupportedSearchRevealChoiceDecision } from "./effect-runtime-search-reveal.js";
import { queueDrawForP1 } from "./effect-runtime-queue-processing-test-support.js";

type SearchEffect = Extract<Effect, { type: "search" }>;

const search = (
  request: Partial<SearchEffect["request"]> = {},
): SearchEffect => ({
  type: "search",
  request: {
    zone: "deck",
    player: "self",
    lookCount: 5,
    filter: {},
    min: 0,
    max: 1,
    destination: "hand",
    revealTo: "chooserOnly",
    remainingCards: {
      destination: "deck",
      position: "bottom",
      order: "ownerChoice",
    },
    shuffleAfter: false,
    ...request,
  },
});

const setDeck = (state: GameState, ids: readonly string[]) => {
  const player = must(state.players[p1], "p1");
  while (player.deck.length < ids.length) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  player.deck = player.deck.slice(0, ids.length);
  for (const [index, id] of ids.entries()) {
    const card = must(player.deck[index], "deck card");
    card.cardId = id as typeof card.cardId;
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({
        cardId: card.cardId,
        category: id.includes("event") ? "event" : "character",
      }),
      colors: [id.includes("blue") ? "blue" : "green"],
      types: [id.includes("type") ? "Navy" : "Pirate"],
      name: id.includes("excluded") ? "Excluded" : id,
    };
  }
  return player.deck;
};

const openSearch = (state: GameState, effect: SearchEffect) => {
  const entry = queueDrawForP1();
  state.effectQueue = [entry];
  const result = createSupportedSearchRevealChoiceDecision(
    state,
    entry,
    effect,
  );
  if (!result.ok || result.kind !== "decisionCreated") {
    assert.fail("expected search decision");
  }
  return result.state;
};

const selectDecision = (state: GameState) => {
  const decision = must(state.pendingDecision, "select decision");
  assert.equal(decision.type, "selectCards");
  return decision;
};

const orderDecision = (state: GameState) => {
  const decision = must(state.pendingDecision, "order decision");
  assert.equal(decision.type, "orderCards");
  return decision;
};

const choose = (decisionId: DecisionId, cards: readonly CardRef[]): Action => ({
  type: "respondToDecision",
  decisionId,
  response: { type: "cards", cards: [...cards] },
});

const order = (decisionId: DecisionId, cards: readonly CardRef[]): Action => ({
  type: "respondToDecision",
  decisionId,
  response: {
    type: "orderedIds",
    ids: cards.map((card) => String(card.instanceId)),
  },
});

test("chooser-only empty-filter top-five search keeps selected identity private and orders remainder", () => {
  const state = createActiveState();
  const looked = setDeck(state, [
    "topn-any-event",
    "topn-any-a",
    "topn-any-b",
    "topn-any-c",
    "topn-any-d",
  ]);
  const opened = openSearch(state, search());
  const select = selectDecision(opened);
  assert.equal(select.candidates.length, 5);
  const chosen = must(select.candidates[2], "chosen").card;

  const selected = applyAction(opened, choose(select.id, [chosen]));
  const view = filterStateForPlayer(selected.state, p2);
  assert.equal(JSON.stringify(view).includes(String(chosen.cardId)), false);
  const orderPending = orderDecision(selected.state);
  const resolved = applyAction(
    selected.state,
    order(orderPending.id, [...orderPending.cards].reverse()),
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p1], "p1").hand.at(-1)?.instanceId,
    looked[2]?.instanceId,
  );
  assert.deepEqual(
    must(resolved.state.players[p1], "p1").deck.map((card) => card.zone.index),
    [0, 1, 2, 3],
  );
});

test("top-N filter varies look count color type and excluded name", () => {
  const state = createActiveState();
  const looked = setDeck(state, [
    "topn-var-blue-type",
    "topn-var-good-type",
    "topn-var-excluded-type",
    "topn-var-event-type",
    "topn-var-good-type-late",
    "topn-var-outside",
  ]);
  const opened = openSearch(
    state,
    search({
      lookCount: 6,
      filter: {
        categories: ["character"],
        colorsAny: ["green"],
        typesAny: ["Navy"],
        nameNot: ["Excluded"],
      },
    }),
  );
  assert.deepEqual(
    selectDecision(opened).candidates.map(
      (candidate) => candidate.card.instanceId,
    ),
    [must(looked[1], "first match"), must(looked[4], "second match")].map(
      (card) => card.instanceId,
    ),
  );
});

test("zero eligible and no-selection paths bottom-order looked cards and resolve effect causality", () => {
  const state = createActiveState();
  setDeck(state, ["topn-zero-event", "topn-zero-blue", "topn-zero-other"]);
  const opened = openSearch(
    state,
    search({ lookCount: 3, filter: { categories: ["stage"] } }),
  );
  const pending = orderDecision(opened);
  const playerView = filterStateForPlayer(opened, p1);
  assert.deepEqual(playerView.pendingDecision?.causedBy, {
    type: "ruleProcess",
    name: "privateCausality",
  });

  const resolved = applyAction(
    opened,
    order(pending.id, [...pending.cards].reverse()),
  );
  const effectResolved = must(resolved.events.at(-1), "effectResolved");
  assert.equal(effectResolved.type, "effectResolved");
  assert.deepEqual(effectResolved.causedBy, pending.causedBy);
});

test("short deck filtered and any-card searches only look available cards", () => {
  const filtered = createActiveState();
  const filteredLooked = setDeck(filtered, ["short-good-type", "short-event"]);
  const filteredOpened = openSearch(
    filtered,
    search({ lookCount: 5, filter: { typesAny: ["Navy"] } }),
  );
  assert.deepEqual(
    selectDecision(filteredOpened).candidates.map(
      (candidate) => candidate.card.instanceId,
    ),
    [filteredLooked[0]?.instanceId],
  );

  const any = createActiveState();
  setDeck(any, ["short-any-a", "short-any-b"]);
  const anyOpened = openSearch(any, search({ lookCount: 5, filter: {} }));
  assert.equal(selectDecision(anyOpened).candidates.length, 2);
});

test("malformed duplicate and accepted remainder ordering are deterministic", () => {
  const state = createActiveState();
  setDeck(state, ["topn-det-a", "topn-det-b", "topn-det-c"]);
  const opened = openSearch(state, search({ lookCount: 3 }));
  const select = selectDecision(opened);
  const first = must(select.candidates[0], "first").card;
  for (const action of [
    choose(select.id, [first, first]),
    {
      type: "respondToDecision",
      decisionId: select.id,
      response: { type: "orderedIds", ids: [] },
    } as Action,
  ]) {
    const before = hashCanonicalStateValue(opened);
    const rejected = applyAction(opened, action);
    assert.equal(rejected.errors?.[0]?.type, "invalidDecisionResponse");
    assert.deepEqual(rejected.events, []);
    assert.equal(rejected.stateHash, before);
  }

  const selected = applyAction(opened, choose(select.id, [first]));
  const pending = orderDecision(selected.state);
  const beforeOrder = hashCanonicalStateValue(selected.state);
  const rejectedOrder = applyAction(selected.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "orderedIds", ids: ["missing"] },
  });
  assert.equal(rejectedOrder.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(rejectedOrder.stateHash, beforeOrder);

  const resolved = applyAction(
    selected.state,
    order(pending.id, [...pending.cards].reverse()),
  );
  assert.equal(resolved.errors, undefined);
  assert.notEqual(resolved.stateHash, beforeOrder);
  assert.equal(
    resolved.events.map((event) => event.type).join(","),
    "decisionResolved,effectResolved",
  );
});
