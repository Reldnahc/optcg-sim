import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../../action-test-fixtures.js";
import { executeNoChoiceEffectPrimitive } from "../../effect-runtime.js";
import { queueDrawForP1 } from "../../effect-runtime-queue/test-support.js";
import { executeDamagePrimitive } from "./execute.js";

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

test("self damage primitive damages the effect controller", () => {
  const state = createActiveState();
  const topLife = must(must(state.players[p1], "p1").life[0], "p1 top life");
  state.cardManifest.cards[topLife.card.cardId] = resolvedCard({
    cardId: topLife.card.cardId,
    category: "character",
  });
  const beforeP1Life = must(state.players[p1], "p1").life.length;
  const beforeP2Life = must(state.players[p2], "p2").life.length;

  const result = executeDamagePrimitive(state, queueDrawForP1(), {
    type: "damage",
    target: "leader",
    player: "self",
    count: 1,
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").life.length,
    beforeP1Life - 1,
  );
  assert.equal(
    must(result.state.players[p2], "p2 after").life.length,
    beforeP2Life,
  );
  assert.equal(result.state.pendingDecision?.playerId, p1);
  const damageEvent = must(
    result.events.find((event) => event.type === "damageDealt"),
    "damage event",
  );
  const payload = damageEvent.payload;
  assert.ok(isRecord(payload));
  assert.equal(payload["damagedPlayerId"], p1);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
