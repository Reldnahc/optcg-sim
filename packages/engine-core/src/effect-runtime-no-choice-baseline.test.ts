import assert from "node:assert/strict";
import { test } from "vitest";

import {
  must,
  p1,
  processEffectRuntime,
  queueingState,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
} from "./effect-runtime-queue/test-support.js";

test("non-once-per-turn queued no-choice draw behavior is unchanged", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-non-once-baseline",
  );
  const queued = processEffectRuntime(state);
  const queueState = queued.state;
  const beforeDeck = must(queueState.players[p1], "p1 before").deck.length;
  const beforeHand = must(queueState.players[p1], "p1 before").hand.length;

  const result = processEffectRuntime(queueState);
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.oncePerTurn.length, 0);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP1.deck.length, beforeDeck - 1);
  assert.equal(afterP1.hand.length, beforeHand + 1);
  assert.deepEqual(result.events.map((event) => event.type).slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
});

test("queued no-choice draw state hash remains deterministic for identical input", () => {
  const run = () => {
    const { state, played } = queueingState();
    const supportCard = resolvedCard({
      cardId: played.cardId,
      category: "character",
    });
    setupOnPlayDefinition(
      state,
      played,
      reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
      "def-non-once-hash",
    );
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
  assert.equal(first.stateHash, second.stateHash);
});
