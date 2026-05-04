import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, MatchId, PlayerId } from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { createInitialState } from "./initial-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { respondToMulliganDecision, startMulliganFlow } from "./mulligan.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const createInput = () => ({
  matchId: toMatchId("match-1"),
  firstPlayerId: p1,
  rngSeed: "seed-mulligan",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
  },
  leaderLifeCounts: {
    [p1]: 2,
    [p2]: 2,
  },
  deckCardIds: {
    [p1]: [
      "p1-a",
      "p1-b",
      "p1-c",
      "p1-d",
      "p1-e",
      "p1-f",
      "p1-g",
      "p1-h",
      "p1-i",
      "p1-j",
      "p1-k",
      "p1-l",
    ].map(toCardId),
    [p2]: [
      "p2-a",
      "p2-b",
      "p2-c",
      "p2-d",
      "p2-e",
      "p2-f",
      "p2-g",
      "p2-h",
      "p2-i",
      "p2-j",
      "p2-k",
      "p2-l",
    ].map(toCardId),
  },
  donDeckCardIds: {
    [p1]: ["p1-don-1", "p1-don-2", "p1-don-3"].map(toCardId),
    [p2]: ["p2-don-1", "p2-don-2", "p2-don-3"].map(toCardId),
  },
  shuffleDecks: true,
});

test("first-player-then-second-player mulligan decision ordering", () => {
  const setup = createInitialState(createInput());
  const started = startMulliganFlow(setup);
  const startedDecisions = must(started.decisions, "started decisions");
  assert.equal(startedDecisions.length, 1);
  const initialDecision = must(startedDecisions[0], "initial decision");
  assert.equal(initialDecision.type, "mulligan");
  assert.equal(initialDecision.playerId, p1);
  assert.equal(started.state.pendingDecision?.playerId, p1);

  const resolvedFirst = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "pending decision").id,
    response: { type: "mulligan", keep: true },
  });
  const secondDecisions = must(resolvedFirst.decisions, "second decisions");
  const secondDecision = must(secondDecisions[0], "second decision");
  assert.equal(secondDecision.playerId, p2);
  assert.equal(resolvedFirst.state.pendingDecision?.playerId, p2);
});

test("keep behavior leaves opening hand and deck order unchanged", () => {
  const setup = createInitialState(createInput());
  const p1Setup = must(setup.players[p1], "p1 state");
  const setupHand = p1Setup.hand.map((card) => card.cardId);
  const setupDeck = p1Setup.deck.map((card) => card.cardId);

  const started = startMulliganFlow(setup);
  const resolvedFirst = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "pending decision").id,
    response: { type: "mulligan", keep: true },
  });
  const p1After = must(resolvedFirst.state.players[p1], "p1 state after keep");

  assert.deepEqual(
    p1After.hand.map((card) => card.cardId),
    setupHand,
  );
  assert.deepEqual(
    p1After.deck.map((card) => card.cardId),
    setupDeck,
  );
});

test("redraw-five behavior uses deterministic reshuffle", () => {
  const setupA = createInitialState(createInput());
  const setupB = createInitialState(createInput());
  const startedA = startMulliganFlow(setupA);
  const startedB = startMulliganFlow(setupB);

  const afterA = respondToMulliganDecision(startedA.state, {
    type: "respondToDecision",
    decisionId: must(startedA.state.pendingDecision, "pending decision A").id,
    response: { type: "mulligan", keep: false },
  });
  const afterB = respondToMulliganDecision(startedB.state, {
    type: "respondToDecision",
    decisionId: must(startedB.state.pendingDecision, "pending decision B").id,
    response: { type: "mulligan", keep: false },
  });

  const originalHand = must(setupA.players[p1], "p1 before").hand.map(
    (card) => card.cardId,
  );
  const handA = must(afterA.state.players[p1], "p1 after A").hand.map(
    (card) => card.cardId,
  );
  const handB = must(afterB.state.players[p1], "p1 after B").hand.map(
    (card) => card.cardId,
  );

  assert.equal(handA.length, 5);
  assert.deepEqual(handA, handB);
  assert.notDeepEqual(handA, originalHand);
});

test("redraw rebuilds life from reshuffled deck and keeps deterministic orientation", () => {
  const setupA = createInitialState(createInput());
  const setupB = createInitialState(createInput());

  const beforeLifeA = must(setupA.players[p1], "p1 before A").life.map(
    (lifeCard) => lifeCard.card.cardId,
  );
  const beforeLifeB = must(setupB.players[p1], "p1 before B").life.map(
    (lifeCard) => lifeCard.card.cardId,
  );
  assert.deepEqual(beforeLifeA, beforeLifeB);

  const startedA = startMulliganFlow(setupA);
  const startedB = startMulliganFlow(setupB);

  const afterA = respondToMulliganDecision(startedA.state, {
    type: "respondToDecision",
    decisionId: must(startedA.state.pendingDecision, "pending decision A").id,
    response: { type: "mulligan", keep: false },
  });
  const afterB = respondToMulliganDecision(startedB.state, {
    type: "respondToDecision",
    decisionId: must(startedB.state.pendingDecision, "pending decision B").id,
    response: { type: "mulligan", keep: false },
  });

  const lifeA = must(afterA.state.players[p1], "p1 after A").life.map(
    (lifeCard) => lifeCard.card.cardId,
  );
  const lifeB = must(afterB.state.players[p1], "p1 after B").life.map(
    (lifeCard) => lifeCard.card.cardId,
  );
  assert.equal(lifeA.length, beforeLifeA.length);
  assert.deepEqual(lifeA, lifeB);
  assert.notDeepEqual(lifeA, beforeLifeA);
  assert.deepEqual(lifeA, [toCardId("p1-i"), toCardId("p1-g")]);
});

test("rejects duplicate mulligan for same player", () => {
  const setup = createInitialState(createInput());
  const started = startMulliganFlow(setup);
  const firstDecisionId = must(started.state.pendingDecision, "pending").id;

  const resolvedFirst = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: firstDecisionId,
    response: { type: "mulligan", keep: true },
  });
  const duplicate = respondToMulliganDecision(resolvedFirst.state, {
    type: "respondToDecision",
    decisionId: firstDecisionId,
    response: { type: "mulligan", keep: false },
  });

  assert.equal(duplicate.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(duplicate.state.pendingDecision?.playerId, p2);
});

test("post-mulligan state passes invariants and stable hash", () => {
  const runFlow = () => {
    const setup = createInitialState(createInput());
    const started = startMulliganFlow(setup);
    const first = respondToMulliganDecision(started.state, {
      type: "respondToDecision",
      decisionId: must(started.state.pendingDecision, "first decision").id,
      response: { type: "mulligan", keep: false },
    });
    return respondToMulliganDecision(first.state, {
      type: "respondToDecision",
      decisionId: must(first.state.pendingDecision, "second decision").id,
      response: { type: "mulligan", keep: true },
    });
  };

  const finalA = runFlow();
  const finalB = runFlow();
  assert.equal(finalA.state.status.type, "active");
  assert.equal(finalA.state.pendingDecision, undefined);
  assert.equal(finalA.errors, undefined);
  assert.doesNotThrow(() => {
    assertGameStateInvariants(finalA.state);
  });
  assert.equal(finalA.stateHash, hashCanonicalStateValue(finalA.state));
  assert.equal(finalA.stateHash, finalB.stateHash);
});

test("accepted mulligan transitions emit events and append to eventJournal", () => {
  const setup = createInitialState(createInput());

  const started = startMulliganFlow(setup);
  assert.ok(started.events.length > 0);
  assert.ok(started.state.eventJournal.length > setup.eventJournal.length);
  assert.equal(started.events[0]?.type, "decisionCreated");

  const first = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "first decision").id,
    response: { type: "mulligan", keep: false },
  });
  const firstEventTypes = first.events.map((event) => event.type);
  assert.ok(firstEventTypes.includes("decisionResolved"));
  assert.ok(firstEventTypes.includes("decisionCreated"));
  assert.ok(firstEventTypes.includes("cardMoved"));
  assert.ok(
    first.state.eventJournal.length > started.state.eventJournal.length,
  );
  assert.equal(
    first.events.find((event) => event.type === "cardMoved")?.visibility.type,
    "replayOnly",
  );
});
