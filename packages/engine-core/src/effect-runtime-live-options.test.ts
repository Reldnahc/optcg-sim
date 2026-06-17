import assert from "node:assert/strict";
import { test } from "vitest";

import {
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  queueingState,
  setupOnPlayDefinition,
} from "./runtime/trigger-queueing/test-support.js";

test("live runtime trigger queueing preserves omitted state hash", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-live-runtime-on-play",
  );

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("live runtime no-choice resolution preserves omitted state hash", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-live-runtime-no-choice",
  );

  const queued = processEffectRuntime(state);
  const beforeDeck = must(queued.state.players[p1], "p1").deck.length;
  const result = processEffectRuntime(queued.state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeDeck - 1,
  );
  assert.equal(result.stateHash, "");
});
