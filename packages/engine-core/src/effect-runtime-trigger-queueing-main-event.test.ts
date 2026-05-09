import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";

const setupMainEventQueueingState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "event source");
  const eventInTrash: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p1State.trash = [eventInTrash];

  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-draw",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": reviewedMainEventDrawDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInTrash.instanceId,
      cardId: eventInTrash.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    createdAtStateSeq: state.seq,
  });
  return { state, eventInTrash };
};

test("queues one supported no-choice Main Event draw effect from an Event cardPlayed event in trash", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queue entry");
  assert.equal(entry.controllerId, p1);
  assert.equal(entry.source.instanceId, eventInTrash.instanceId);
  assert.deepEqual(entry.source.zone, eventInTrash.zone);
  assert.equal(entry.sourcePresencePolicy, "resolveFromDestinationZone");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
});

test("Main Event queueing fails closed when the played Event source is no longer in trash", () => {
  const { state } = setupMainEventQueueingState();
  const p1State = must(state.players[p1], "p1");
  p1State.trash = [];

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "main-event-trigger-queueing",
      details: { reason: "source-presence-failed" },
    },
  ]);
  assert.equal(result.state.effectQueue.length, 0);
});

test("Main Event queueing fails closed when the trash source no longer matches the cardPlayed payload", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const p1State = must(state.players[p1], "p1");
  p1State.trash = [
    {
      ...eventInTrash,
      cardId: must(p1State.hand[0], "replacement card").cardId,
    },
  ];

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "main-event-trigger-queueing",
      details: { reason: "source-presence-failed" },
    },
  ]);
  assert.equal(result.state.effectQueue.length, 0);
});
