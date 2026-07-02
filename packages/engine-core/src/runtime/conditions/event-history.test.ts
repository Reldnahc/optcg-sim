import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  toEngineEventId,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

test("eventHistory condition counts matching cardPlayed events from this turn", () => {
  const state = createActiveState();
  const eventCard = must(must(state.players[p1], "p1").hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 3,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:event-history-current:cardPlayed"),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventCard.instanceId,
      cardId: eventCard.cardId,
      category: "event",
      turnNumber: state.turn.globalTurn,
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { categories: ["event"], baseCost: { op: "gte", value: 3 } },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: true },
  );
});

test("eventHistory condition ignores matching cardPlayed events from another turn", () => {
  const state = createActiveState();
  const eventCard = must(must(state.players[p1], "p1").hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 4,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:event-history-old:cardPlayed"),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventCard.instanceId,
      cardId: eventCard.cardId,
      category: "event",
      turnNumber: state.turn.globalTurn - 1,
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { categories: ["event"], baseCost: { op: "gte", value: 3 } },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: false },
  );
});

test("eventHistory condition fails closed for unsupported filters", () => {
  const state = createActiveState();

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { currentPower: { op: "gte", value: 1000 } },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: false },
  );
});
