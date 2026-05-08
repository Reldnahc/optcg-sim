import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { createActiveState, must, p1 } from "./action-test-fixtures.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const queuedEffect = (
  cardId: CardId = toCardId("hidden-life-card"),
): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry-1"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window-1"),
  generation: 1,
  controllerId: p1,
  source: {
    instanceId: toInstanceId("hidden-instance-1"),
    cardId,
    playerId: p1,
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId("hidden-instance-1"),
    cardId,
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
    category: "event",
    colors: ["red"],
    cost: 1,
    keywords: [],
  },
  effectBlockId: toEffectId("hidden-effect-block"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 4,
  queuedAtStateSeq: toStateSeq(7),
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  causedBy: { type: "ruleProcess", name: "hidden-trigger" },
});

const queueDrawForP1 = (): EffectQueueEntry => ({
  ...queuedEffect(toCardId("OP01-015")),
  source: {
    instanceId: toInstanceId("source-instance"),
    cardId: toCardId("OP01-015"),
    playerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId("source-instance"),
    cardId: toCardId("OP01-015"),
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
    category: "leader",
    colors: ["red"],
    cost: 1,
    keywords: [],
  },
  controllerId: p1,
  effectBlockId: toEffectId("OP01-015:auto-on-play-1"),
});

test("direct draw primitive executes draw 1 from deck top into hand", () => {
  const state = createActiveState();
  const topDeck = state.players[p1]?.deck[0];
  assert.ok(topDeck !== undefined);
  const beforeDeck = state.players[p1]?.deck.length ?? 0;
  const beforeHand = state.players[p1]?.hand.length ?? 0;

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: 1,
    player: "self",
  });
  const resultP1 = must(result.state.players[p1], "result p1");

  assert.equal(result.errors, undefined);
  assert.equal(resultP1.deck.length, beforeDeck - 1);
  assert.equal(resultP1.hand.length, beforeHand + 1);
  assert.equal(
    must(resultP1.hand[resultP1.hand.length - 1], "last p1 hand card")
      .instanceId,
    topDeck.instanceId,
  );
  assert.equal(result.events.length, 3);
  const firstEvent = must(result.events[0], "first draw event");
  assert.equal(firstEvent.type, "cardDrawn");
  assert.equal(firstEvent.visibility.type, "public");
});

test("direct draw primitive preserves deck order when drawing multiple cards", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "player p1");
  const handZero = must(p1State.hand[0], "p1 hand[0]");
  const handOne = must(p1State.hand[1], "p1 hand[1]");
  const first = {
    ...handZero,
    zone: {
      zone: "deck" as const,
      playerId: p1,
      slot: "deck" as const,
      index: 0,
    },
  };
  const secondDeck = {
    ...handOne,
    zone: {
      zone: "deck" as const,
      playerId: p1,
      slot: "deck" as const,
      index: 1,
    },
  };
  state.players[p1] = {
    ...p1State,
    deck: [first, secondDeck],
    hand: p1State.hand.slice(2),
  };
  const top = must(state.players[p1]?.deck[0], "top deck");
  const second = must(state.players[p1]?.deck[1], "second deck");

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: 2,
    player: "self",
  });

  const hand = result.state.players[p1]?.hand ?? [];
  const lastTwo = hand.slice(-2);
  assert.equal(lastTwo[0]?.instanceId, top.instanceId);
  assert.equal(lastTwo[1]?.instanceId, second.instanceId);
});

test("direct draw visibility keeps identity private in public events and present in private events", () => {
  const state = createActiveState();

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: 1,
    player: "self",
  });
  const publicMoved = result.events.find(
    (event) => event.type === "cardMoved" && event.visibility.type === "public",
  );
  const privateMoved = result.events.find(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );
  assert.ok(publicMoved !== undefined);
  assert.ok(privateMoved !== undefined);
  const publicPayload = JSON.stringify(publicMoved.payload);
  const privatePayload = JSON.stringify(privateMoved.payload);

  assert.ok(
    !publicPayload.includes("instanceId") && !publicPayload.includes("cardId"),
  );
  assert.ok(privatePayload.includes("instanceId"));
  assert.ok(privatePayload.includes("cardId"));
});

test("direct draw count zero is a no-op", () => {
  const state = createActiveState();
  const before = structuredClone(state);

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: 0,
    player: "self",
  });

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
});

test("direct draw from empty deck is a no-op without deck-out ownership", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "player p1");
  state.players[p1] = { ...p1State, deck: [] };

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: 1,
    player: "self",
  });
  const resultP1 = must(result.state.players[p1], "result p1");
  const stateP1 = must(state.players[p1], "state p1");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(resultP1.hand.length, stateP1.hand.length);
});

test("direct unsupported effect shapes fail closed without mutation or events", () => {
  const state = createActiveState();
  const cases = [
    { type: "drawUpTo", count: 1, player: "self" },
    { type: "custom", handler: "unsupported-handler" },
    {
      type: "replacement",
      when: { type: "cardWouldBeKOd", target: "self" },
      instead: { type: "draw", count: 1, player: "self" },
    },
    {
      type: "modifyPower",
      target: "self",
      value: 1000,
      duration: "thisBattle",
    },
  ] as const;

  for (const effect of cases) {
    const before = structuredClone(state);
    const result = executeNoChoiceEffectPrimitive(
      state,
      queueDrawForP1(),
      effect as never,
    );

    assert.deepEqual(result.events, []);
    assert.ok(result.errors !== undefined);
    assert.equal(
      must(result.errors[0], "runtime error").type,
      "effectRuntimeError",
    );
    assert.deepEqual(result.state, before);
  }
});

test("direct invalid draw count and unsupported player ref fail closed without mutation", () => {
  const state = createActiveState();
  const before = structuredClone(state);

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "draw",
    count: -1,
    player: "mystery" as never,
  });

  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});
