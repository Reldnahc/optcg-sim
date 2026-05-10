import assert from "node:assert/strict";
import { test } from "vitest";

import { createActiveState, must, p1 } from "./action-test-fixtures.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime.js";
import { queueDrawForP1 } from "./effect-runtime-queue-processing-test-support.js";

test("no-choice draw primitive remains unchanged for direct draw resolution", () => {
  const state = createActiveState();
  const topDeck = must(state.players[p1]?.deck[0], "top deck");
  const beforeDeck = must(state.players[p1], "p1").deck.length;
  const beforeHand = must(state.players[p1], "p1").hand.length;

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: 1,
    player: "self",
  });
  const nextP1 = must(result.state.players[p1], "next p1");

  assert.equal(result.errors, undefined);
  assert.equal(nextP1.deck.length, beforeDeck - 1);
  assert.equal(nextP1.hand.length, beforeHand + 1);
  assert.equal(
    must(nextP1.hand[nextP1.hand.length - 1], "drawn hand card").instanceId,
    topDeck.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardDrawn", "cardMoved", "cardMoved"],
  );
});
