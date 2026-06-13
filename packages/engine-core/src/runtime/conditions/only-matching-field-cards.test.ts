import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  CardInstance,
  Condition,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

const condition = {
  type: "onlyMatchingFieldCards",
  zone: "characterArea",
  player: "self",
  filter: { categories: ["character"], typesAny: ["East Blue"] },
} satisfies Extract<Condition, { type: "onlyMatchingFieldCards" }>;

const addTypedCharacter = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  types: readonly string[],
  index = 0,
): CardInstance => {
  const character = withCardInZone({
    state,
    playerId,
    card,
    zone: "characterArea",
    index,
  });
  state.cardManifest.cards[character.cardId] = {
    ...resolvedCard({
      cardId: character.cardId,
      category: "character",
    }),
    types: [...types],
  };
  return character;
};

test("onlyMatchingFieldCards requires at least one matching field Character", () => {
  const emptyState = createActiveState();
  assert.deepEqual(
    evaluateQueuedEffectCondition(emptyState, queueDrawForP1(), condition),
    { supported: true, passed: false },
  );

  const matchingState = createActiveState();
  const matchingP1 = must(matchingState.players[p1], "matching p1");
  addTypedCharacter(
    matchingState,
    p1,
    must(matchingP1.hand[0], "matching character"),
    ["East Blue"],
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(matchingState, queueDrawForP1(), condition),
    { supported: true, passed: true },
  );

  const mixedState = createActiveState();
  const mixedP1 = must(mixedState.players[p1], "mixed p1");
  addTypedCharacter(
    mixedState,
    p1,
    must(mixedP1.hand[0], "mixed matching character"),
    ["East Blue"],
    0,
  );
  addTypedCharacter(
    mixedState,
    p1,
    must(mixedP1.hand[1], "mixed nonmatching character"),
    ["Straw Hat Crew"],
    1,
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(mixedState, queueDrawForP1(), condition),
    { supported: true, passed: false },
  );
});
