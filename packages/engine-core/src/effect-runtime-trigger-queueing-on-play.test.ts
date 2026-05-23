import assert from "node:assert/strict";
import { test } from "vitest";

import {
  must,
  p1,
  resolvedCard,
  toEngineEventId,
} from "./action-test-fixtures.js";
import { createActiveState } from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  queueingState,
  setupOnPlayDefinition,
  toSourceSnapshot,
  toStateSeq,
} from "./effect-runtime-trigger-queueing-test-support.js";
import { reviewedOnPlayDrawDefinition } from "./action-test-fixtures.js";

test("queues one supported no-choice On Play draw effect from an accepted cardPlayed event", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-on-play-draw",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, "effectQueued");
  assert.equal(result.state.eventJournal.at(-1)?.type, "effectQueued");
});

test("queues supported On Play effect from a multi-effect definition with unrelated supported effects", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:when-attacking` as typeof onPlayEffect.id,
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-on-play-plus-when-attacking",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.state.effectQueue[0]?.effectBlockId, onPlayEffect.id);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
});

test("duplicate matching On Play effects still fail closed without mutation", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:duplicate` as typeof onPlayEffect.id,
        },
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:when-attacking` as typeof onPlayEffect.id,
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-duplicate-on-play",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-play-trigger-queueing",
      details: { reason: "multiple-on-play-effects" },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("unsupported relevant On Play effect still fails closed with unrelated supported effects", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        {
          ...onPlayEffect,
          cost: { type: "restDon", count: 1 },
        },
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:when-attacking` as typeof onPlayEffect.id,
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-unsupported-on-play-plus-when-attacking",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-play-trigger-queueing",
      details: { reason: "unsupported-on-play-definition" },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("unsupported same-entrypoint On Play effect fails closed beside a supported On Play effect", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:unsupported` as typeof onPlayEffect.id,
          cost: { type: "restDon", count: 1 },
        },
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:when-attacking` as typeof onPlayEffect.id,
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-supported-and-unsupported-on-play",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-play-trigger-queueing",
      details: { reason: "unsupported-on-play-definition" },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("effectQueued payload and queue metadata are deterministic across repeated runs", () => {
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
      "def-deterministic",
    );
    return processEffectRuntime(state);
  };
  const first = run();
  const second = run();

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.effectQueue, second.state.effectQueue);
  const firstEvent = must(first.events[0], "effectQueued event");
  assert.equal(firstEvent.createdAtStateSeq, first.state.seq);
  assert.deepEqual(firstEvent.causedBy, {
    type: "ruleProcess",
    name: "effectRuntime:onPlayTriggerQueueing",
  });
  assert.deepEqual(first.state.effectQueue[0], {
    id: "queue-entry:event:3:1:cardPlayed:OP01-015:auto-on-play-1",
    state: "pending",
    timingWindowId: "timing-window:event:3:1:cardPlayed",
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: first.state.effectQueue[0]?.source.instanceId,
      cardId: first.state.effectQueue[0]?.source.cardId,
      playerId: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
    },
    sourceSnapshot: toSourceSnapshot(
      must(first.state.players[p1]?.characters[0], "queued source"),
      p1,
      p1,
    ),
    triggerEventId: "event:3:1:cardPlayed",
    effectBlockId: "OP01-015:auto-on-play-1",
    orderingGroup: "turnPlayer",
    createdAtEventSeq:
      first.state.eventJournal[first.state.eventJournal.length - 2]?.seq,
    queuedAtStateSeq: toStateSeq(4),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: {
      type: "ruleProcess",
      name: "effectRuntime:onPlayTriggerQueueing",
    },
  });
});

test("no matching On Play effect leaves queue and events unchanged", () => {
  const { state, played } = queueingState();
  const baseCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    baseCard.support,
  );
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "onPlay effect"),
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-non-onplay",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state.effectQueue, before.effectQueue);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
});

test("event cardPlayed entries are ignored by On Play trigger queueing", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const eventInHand = must(p1State.hand[0], "event source");
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInHand.instanceId,
      cardId: eventInHand.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    createdAtStateSeq: state.seq,
  });
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state.effectQueue, before.effectQueue);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
});
