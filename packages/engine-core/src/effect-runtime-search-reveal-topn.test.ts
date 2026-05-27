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
import type { EffectQueueEntry } from "./effect-runtime-queue-processing-test-support.js";
import {
  processEffectRuntime,
  queueDrawForP1,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "./effect-runtime-queue-processing-test-support.js";

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

test("trash-rest search moves unselected looked cards to trash without ordering remainder", () => {
  const state = createActiveState();
  const looked = setDeck(state, [
    "topn-trash-a",
    "topn-trash-b",
    "topn-trash-c",
    "topn-trash-tail",
  ]);
  const opened = openSearch(
    state,
    search({
      lookCount: 3,
      remainingCards: { destination: "trash" },
    }),
  );
  const select = selectDecision(opened);
  const chosen = must(select.candidates[1], "chosen").card;

  const resolved = applyAction(opened, choose(select.id, [chosen]));
  const player = must(resolved.state.players[p1], "p1");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(player.hand.at(-1)?.instanceId, looked[1]?.instanceId);
  assert.deepEqual(
    player.trash.slice(0, 2).map((card) => card.instanceId),
    [looked[0]?.instanceId, looked[2]?.instanceId],
  );
  assert.deepEqual(
    player.deck.map((card) => card.instanceId),
    [looked[3]?.instanceId],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardTrashed",
      "effectResolved",
    ],
  );
});

test("trash-rest search with no eligible candidate trashes all looked cards", () => {
  const state = createActiveState();
  const looked = setDeck(state, [
    "topn-trash-none-a",
    "topn-trash-none-b",
    "topn-trash-none-tail",
  ]);
  const entry = queueDrawForP1();
  state.effectQueue = [entry];

  const result = createSupportedSearchRevealChoiceDecision(
    state,
    entry,
    search({
      lookCount: 2,
      filter: { categories: ["stage"] },
      remainingCards: { destination: "trash" },
    }),
  );
  const player = must(result.state.players[p1], "p1");

  assert.equal(result.ok, true);
  assert.equal(result.kind, "noEligibleCandidate");
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(
    player.trash.slice(0, 2).map((card) => card.instanceId),
    [looked[0]?.instanceId, looked[1]?.instanceId],
  );
  assert.deepEqual(
    player.deck.map((card) => card.instanceId),
    [looked[2]?.instanceId],
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardTrashed", "cardMoved", "cardTrashed"],
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

test("top-N filter supports exact-name and disjunctive category search predicates", () => {
  const state = createActiveState();
  const looked = setDeck(state, [
    "topn-or-sanji",
    "topn-or-event",
    "topn-or-other",
    "topn-or-outside",
  ]);
  state.cardManifest.cards[must(looked[0], "sanji card").cardId] = {
    ...must(
      state.cardManifest.cards[must(looked[0], "sanji card").cardId],
      "sanji manifest",
    ),
    name: "Sanji",
    category: "character",
  };

  const opened = openSearch(
    state,
    search({
      lookCount: 3,
      filter: {
        anyOf: [{ names: ["Sanji"] }, { categories: ["event"] }],
      },
    }),
  );

  assert.deepEqual(
    selectDecision(opened).candidates.map(
      (candidate) => candidate.card.instanceId,
    ),
    [must(looked[0], "name match"), must(looked[1], "event match")].map(
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

test("lookCount one with bothPlayers and remainder policy reveals selected card publicly without order decision", () => {
  const state = createActiveState();
  setDeck(state, ["topn-one-public-hit"]);
  const opened = openSearch(
    state,
    search({
      lookCount: 1,
      revealTo: "bothPlayers",
      filter: { categories: ["character"] },
    }),
  );
  const select = selectDecision(opened);
  const chosen = must(select.candidates[0], "chosen").card;

  const selected = applyAction(opened, choose(select.id, [chosen]));
  assert.equal(selected.errors, undefined);
  assert.deepEqual(
    selected.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "cardRevealed", "effectResolved"],
  );
  assert.equal(selected.state.pendingDecision, undefined);
  assert.equal(must(selected.state.players[p1], "p1").deck.length, 0);
  assert.equal(
    must(selected.state.players[p1], "p1").hand.at(-1)?.instanceId,
    chosen.instanceId,
  );
  const publicReveal = selected.events.find(
    (event) =>
      event.type === "cardRevealed" && event.visibility.type === "public",
  );
  assert.notEqual(publicReveal, undefined);
});

test("chooser-only lookCount one with decline keeps selected identity private and resolves without ordering", () => {
  const state = createActiveState();
  setDeck(state, ["topn-one-private-only"]);
  const opened = openSearch(
    state,
    search({
      lookCount: 1,
      revealTo: "chooserOnly",
      filter: {},
    }),
  );
  const select = selectDecision(opened);
  const declined = applyAction(opened, choose(select.id, []));
  assert.equal(declined.errors, undefined);
  assert.deepEqual(
    declined.events.map((event) => event.type),
    ["decisionResolved", "effectResolved"],
  );
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(
    JSON.stringify(filterStateForPlayer(declined.state, p2)).includes(
      "topn-one-private-only",
    ),
    false,
  );
});

test("public selected reveal does not depend on selectCards prompt text", () => {
  const state = createActiveState();
  setDeck(state, ["topn-prompt-independent"]);
  const opened = openSearch(
    state,
    search({
      lookCount: 1,
      revealTo: "bothPlayers",
      filter: {},
    }),
  );
  const decision = must(opened.pendingDecision, "pending");
  if (decision.type !== "selectCards") {
    assert.fail("expected selectCards decision");
  }
  decision.prompt = "Mutated prompt text";
  const chosen = must(decision.candidates[0], "chosen").card;

  const selected = applyAction(opened, choose(decision.id, [chosen]));
  assert.equal(selected.errors, undefined);
  const publicRevealCount = selected.events.filter(
    (event) =>
      event.type === "cardRevealed" && event.visibility.type === "public",
  ).length;
  assert.equal(publicRevealCount, 1);
});

test("lookCount one no-match with bottom remainder policy resolves without order decision", () => {
  const state = createActiveState();
  setDeck(state, ["topn-one-nomatch-event"]);
  const entry = queueDrawForP1();
  state.effectQueue = [entry];
  const result = createSupportedSearchRevealChoiceDecision(
    state,
    entry,
    search({
      lookCount: 1,
      revealTo: "bothPlayers",
      filter: { categories: ["stage"] },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.kind, "noEligibleCandidate");
  const opened = result.state;
  assert.equal(opened.pendingDecision, undefined);
  assert.equal(
    JSON.stringify(filterStateForPlayer(opened, p2)).includes(
      "topn-one-nomatch-event",
    ),
    false,
  );
  const resolved = applyAction(opened, { type: "concede", playerId: p1 });
  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["gameEnded"],
  );
});

test("queued lookCount one no-match with bottom remainder resolves exactly once without order decision", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const topDeck = must(p1State.deck[0], "top deck");
  topDeck.cardId = toCardId("queue-search-no-match-event");
  state.cardManifest.cards[topDeck.cardId] = {
    ...resolvedCard({
      cardId: topDeck.cardId,
      category: "event",
    }),
  };
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-queue-topone-no-match",
      rulesVersion: "queue-topone-no-match-rules",
      sourceTextHash: "queue-topone-no-match-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const searchEffectId = toEffectId("queue-topone-no-match-effect");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-queue-topone-no-match": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: searchEffectId,
          condition: { type: "yourTurn" },
          effect: {
            type: "search",
            request: {
              zone: "deck",
              player: "self",
              lookCount: 1,
              filter: { categories: ["stage"] },
              min: 0,
              max: 1,
              destination: "hand",
              revealTo: "bothPlayers",
              remainingCards: {
                destination: "deck",
                position: "bottom",
                order: "ownerChoice",
              },
              shuffleAfter: false,
            },
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.turn.turnPlayerId = p1;
  const queueEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-topone-no-match"),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: searchEffectId,
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  state.effectQueue = [queueEntry];
  const beforeSeq = state.seq;
  const beforeJournalLength = state.eventJournal.length;

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "effectResolved"],
  );
  assert.equal(
    result.events.filter((event) => event.type === "effectResolved").length,
    1,
  );
  assert.equal(result.state.seq, beforeSeq + 2);
  assert.equal(result.state.eventJournal.length, beforeJournalLength + 2);
  assert.equal(
    result.state.eventJournal.filter((event) => event.type === "effectResolved")
      .length,
    1,
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      String(topDeck.cardId),
    ),
    false,
  );
});
