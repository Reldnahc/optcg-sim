import assert from "node:assert/strict";
import { test } from "vitest";

import {
  must,
  p1,
  resolvedCard,
  toEngineEventId,
} from "../../action-test-fixtures.js";
import { createActiveState } from "../../action-test-fixtures.js";
import { processEffectRuntime } from "../../effect-runtime.js";
import {
  queueingState,
  setupOnPlayDefinition,
  toSourceSnapshot,
  toStateSeq,
} from "./test-support.js";
import { reviewedOnPlayDrawDefinition } from "../../action-test-fixtures.js";

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

test("queued On Play effects carry active text presentation from parser spans", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
    effectText: "[On Play] Draw 1 card.",
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
          presentation: {
            textKind: "effect",
            spanIds: ["span:on-play-body"],
          },
        },
      ],
    },
    "def-on-play-presentation",
  );
  state.cardManifest.cards[played.cardId] = {
    ...must(state.cardManifest.cards[played.cardId], "resolved source card"),
    effectText: "[On Play] Draw 1 card.",
    effectTextSourceMap: {
      textKind: "effect",
      sourceText: "[On Play] Draw 1 card.",
      spans: [
        {
          id: "span:on-play-body",
          role: "body",
          start: 10,
          end: 22,
          text: "Draw 1 card.",
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.effectQueue[0]?.presentation, {
    source: {
      instanceId: played.instanceId,
      cardId: played.cardId,
      playerId: p1,
      zone: played.zone,
    },
    textKind: "effect",
    activeSpanIds: ["span:on-play-body"],
  });
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
    state.cardManifest.cards[played.cardId] = {
      ...must(state.cardManifest.cards[played.cardId], "played card"),
      types: ["Navy"],
    };
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
  assert.deepEqual(firstEvent.payload, {
    queueEntryId: first.state.effectQueue[0]?.id,
    timingWindowId: first.state.effectQueue[0]?.timingWindowId,
    generation: 0,
    effectBlockId: "OP01-015:auto-on-play-1",
    triggerEventId: "event:3:1:cardPlayed",
    sourcePresencePolicy: "mustRemainInSameZone",
    orderingGroup: "turnPlayer",
    controllerId: p1,
    source: first.state.effectQueue[0]?.source,
    sourceCardId: first.state.effectQueue[0]?.source.cardId,
    effectCategory: "auto",
    entryPoint: { type: "onPlay" },
    sourceTypes: ["Navy"],
    sourceCategory: "character",
    presentation: first.state.effectQueue[0]?.presentation,
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
    presentation: {
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
      textKind: "effect",
      activeSpanIds: [],
    },
    causedBy: {
      type: "ruleProcess",
      name: "effectRuntime:onPlayTriggerQueueing",
    },
  });
});

test("effectResolved payload carries canonical source and entry point evidence", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-resolved-canonical",
  );
  state.cardManifest.cards[played.cardId] = {
    ...must(state.cardManifest.cards[played.cardId], "played card"),
    types: ["Navy"],
  };
  const queued = processEffectRuntime(state);
  const resolved = processEffectRuntime(queued.state);
  const queuedEntry = must(queued.state.effectQueue[0], "queued entry");
  const effectResolved = must(
    resolved.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );

  assert.deepEqual(effectResolved.payload, {
    queueEntryId: queuedEntry.id,
    timingWindowId: queuedEntry.timingWindowId,
    generation: 0,
    effectBlockId: queuedEntry.effectBlockId,
    triggerEventId: "event:3:1:cardPlayed",
    sourcePresencePolicy: "mustRemainInSameZone",
    orderingGroup: "turnPlayer",
    controllerId: p1,
    source: queuedEntry.source,
    sourceCardId: queuedEntry.source.cardId,
    effectCategory: "auto",
    entryPoint: { type: "onPlay" },
    sourceTypes: ["Navy"],
    sourceCategory: "character",
    presentation: queuedEntry.presentation,
    status: "resolved",
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

test("On Play reusable draw-then-trash sequence queues and reaches sequence decision flow", () => {
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
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "draw", count: 1, player: "self" },
              },
              {
                connector: "then",
                effect: {
                  type: "trashFromHand",
                  player: "self",
                  chooser: "self",
                  count: 1,
                },
              },
            ],
          },
        },
      ],
    },
    "def-on-play-sequence",
  );

  const queued = processEffectRuntime(state);
  const paused = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(paused.errors, undefined);
  assert.equal(
    queued.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
});

test("On Play reusable saved-reference sequence queues via shared sequence support", () => {
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
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: "saved:target",
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    zone: "characterArea",
                    player: "opponent",
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: false,
                    visibility: "public",
                    filter: {
                      categories: ["character"],
                      cost: { max: 3 },
                    },
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "ko",
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: "saved:target",
                    },
                    player: "opponent",
                    zone: "characterArea",
                    visibility: "publicOnly",
                    onFailure: "failClosed",
                  },
                },
              },
            ],
          },
        },
      ],
    },
    "def-on-play-saved-reference-sequence",
  );

  const queued = processEffectRuntime(state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(queued.events[0]?.type, "effectQueued");
});
