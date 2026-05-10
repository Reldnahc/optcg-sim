import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  TargetRequest,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";

const reviewedMainEventTargetKoRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 0,
  max: 1,
  allowFewerIfUnavailable: true,
  visibility: "public",
  ...overrides,
});

const reviewedMainEventTargetKoDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ReturnType<typeof resolvedCard>["support"],
  request: TargetRequest = reviewedMainEventTargetKoRequest(),
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "OP01-040:event-main-ko-1" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "main" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: { type: "ko", target: { type: "choose", request } },
    },
  ],
  metadata: {
    sourceTextHash: support.sourceTextHash,
    rulesVersion: support.rulesVersion,
    effectDefinitionsVersion: "0.1.0",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

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

test("queues one supported reviewed target KO Main Event from an Event cardPlayed event in trash", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-ko",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-main-event-ko": reviewedMainEventTargetKoDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };

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

test("Main Event queueing fails closed for unsupported target KO request shapes", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-private-ko",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-main-event-private-ko": reviewedMainEventTargetKoDefinition(
      implemented.cardId,
      implemented.support,
      reviewedMainEventTargetKoRequest({ visibility: "privateToChooser" }),
    ),
  };

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "main-event-trigger-queueing",
      details: { reason: "unsupported-main-event-definition" },
    },
  ]);
  assert.equal(result.state.effectQueue.length, 0);
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
