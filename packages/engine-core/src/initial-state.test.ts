import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, MatchId, PlayerId } from "@optcg/types";

import { assertGameStateInvariants } from "./invariants.js";
import { createInitialState } from "./initial-state.js";
import { hashCanonicalStateValue } from "./canonical-state.js";

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
  rngSeed: "seed-1",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
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
  shuffleDecks: false,
});

test("repeated pre-mulligan setup with same input and seed produces the same hash", () => {
  const input = createInput();
  const a = createInitialState(input);
  const b = createInitialState(input);
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("different explicit deck order changes resulting state hash", () => {
  const inputA = createInput();
  const inputB = createInput();
  inputB.deckCardIds[p1] = [
    ...must(inputB.deckCardIds[p1], "p1 deck"),
  ].reverse();

  const a = createInitialState(inputA);
  const b = createInitialState(inputB);
  assert.notEqual(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("opening hands and remaining deck order match deterministic setup policy", () => {
  const input = createInput();
  const state = createInitialState(input);

  const p1State = must(state.players[p1], "p1 state");
  assert.deepEqual(
    p1State.hand.map((card) => card.cardId),
    must(input.deckCardIds[p1], "p1 deck").slice(0, 5),
  );
  assert.deepEqual(
    p1State.deck.map((card) => card.cardId),
    must(input.deckCardIds[p1], "p1 deck").slice(10),
  );
});

test("life orientation matches spec canonical top-life behavior", () => {
  const input = createInput();
  const state = createInitialState(input);
  const p1State = must(state.players[p1], "p1 state");

  const topFiveInDeckOrder = must(input.deckCardIds[p1], "p1 deck").slice(
    5,
    10,
  );
  assert.deepEqual(
    p1State.life.map((lifeCard) => lifeCard.card.cardId),
    [...topFiveInDeckOrder].reverse(),
  );
  assert.equal(p1State.life.at(-1)?.card.cardId, topFiveInDeckOrder[0]);
});

test("setup state passes ENG-002A invariants", () => {
  const state = createInitialState(createInput());
  assert.doesNotThrow(() => {
    assertGameStateInvariants(state);
  });
});

test("returned setup output is type-level documented as pre-mulligan setup status", () => {
  const state = createInitialState(createInput());
  assert.equal(state.status.type, "setup");
});
