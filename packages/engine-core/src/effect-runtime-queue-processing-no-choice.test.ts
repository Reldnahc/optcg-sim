import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
} from "./effect-runtime-queue-processing-test-support.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  processEffectRuntime,
  toCardId,
  toInstanceId,
  toQueueEntryId,
  toTimingWindowId,
  queueDrawForP1,
  withCardInZone,
  toSourceSnapshot,
  setupOnPlayDefinition,
  setupOnKODefinition,
  queueingState,
} from "./effect-runtime-queue-processing-test-support.js";

test("resolves one queued supported On Play draw entry and removes it from effectQueue", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-queue-resolve-one",
  );
  const queued = processEffectRuntime(state);
  const beforeDeck = must(queued.state.players[p1], "p1").deck.length;
  const beforeHand = must(queued.state.players[p1], "p1").hand.length;

  const result = processEffectRuntime(queued.state);
  const afterP1 = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP1.deck.length, beforeDeck - 1);
  assert.equal(afterP1.hand.length, beforeHand + 1);
  const eventTypes = result.events.map((event) => event.type);
  assert.deepEqual(eventTypes.slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
  const resolvedEvent = result.events.find(
    (event) => event.type === "effectResolved",
  );
  const queuedEntry = must(queued.state.effectQueue[0], "queued entry");
  assert.ok(resolvedEvent !== undefined);
  assert.equal(resolvedEvent.createdAtStateSeq, result.state.seq);
  assert.deepEqual(resolvedEvent.payload, {
    queueEntryId: queuedEntry.id,
    timingWindowId: queuedEntry.timingWindowId,
    generation: queuedEntry.generation,
    effectBlockId: queuedEntry.effectBlockId,
    triggerEventId: queuedEntry.triggerEventId,
    sourcePresencePolicy: queuedEntry.sourcePresencePolicy,
    orderingGroup: queuedEntry.orderingGroup,
    status: "resolved",
  });
  assert.deepEqual(resolvedEvent.causedBy, {
    type: "effect",
    queueEntryId: queuedEntry.id,
    effectId: queuedEntry.effectBlockId,
  });
  const checkpointEvent = result.events.find(
    (event) => event.type === "ruleProcessingChecked",
  );
  assert.ok(checkpointEvent !== undefined);
  assert.equal(checkpointEvent.createdAtStateSeq, result.state.seq);
  assert.deepEqual(checkpointEvent.causedBy, {
    type: "effect",
    queueEntryId: queuedEntry.id,
    effectId: queuedEntry.effectBlockId,
  });
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
});

test("resolves queued supported draw from last-known source presence", () => {
  const state = createActiveState();
  const supportCard = resolvedCard({
    cardId: queueDrawForP1().source.cardId,
    category: "character",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    queueDrawForP1().source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "lki draw effect"),
        sourcePresencePolicy: "resolveFromLastKnownInformation",
      },
    ],
  };
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    source: {
      ...queueDrawForP1().source,
      instanceId: toInstanceId("source-no-longer-live"),
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: toInstanceId("source-no-longer-live"),
    },
  };
  setupOnPlayDefinition(
    state,
    {
      ...must(state.players[p1], "p1").leader,
      cardId: entry.source.cardId,
    },
    definition,
    "def-queue-lki-draw",
  );
  state.effectQueue = [entry];
  const beforeDeck = must(state.players[p1], "p1").deck.length;
  const beforeHand = must(state.players[p1], "p1").hand.length;

  const result = processEffectRuntime(state);
  const afterP1 = must(result.state.players[p1], "p1 result");
  const resolvedEvent = result.events.find(
    (event) => event.type === "effectResolved",
  );

  assert.equal(result.errors, undefined);
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
  assert.ok(resolvedEvent !== undefined);
  assert.deepEqual(resolvedEvent.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    orderingGroup: entry.orderingGroup,
    status: "resolved",
  });
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
});

test("resolves queued supported On K.O. draw from trash destination presence", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = setupOnKODefinition(state, source);
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashedSource];
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-on-ko-trash"),
    timingWindowId: toTimingWindowId("timing-window-on-ko-trash"),
    controllerId: p2,
    source: {
      instanceId: trashedSource.instanceId,
      cardId: trashedSource.cardId,
      playerId: p2,
      zone: trashedSource.zone,
    },
    sourceSnapshot: {
      ...toSourceSnapshot(trashedSource, p2, p2),
      power: 3000,
    },
    effectBlockId: onKOEffect.id,
    orderingGroup: "nonTurnPlayer",
    sourcePresencePolicy: "resolveFromDestinationZone",
  };
  state.effectQueue = [entry];
  const beforeDeck = p2State.deck.length;
  const beforeHand = p2State.hand.length;

  const result = processEffectRuntime(state);
  const afterP2 = must(result.state.players[p2], "p2 result");
  const resolvedEvent = result.events.find(
    (event) => event.type === "effectResolved",
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP2.deck.length, beforeDeck - 1);
  assert.equal(afterP2.hand.length, beforeHand + 1);
  assert.deepEqual(result.events.map((event) => event.type).slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
  assert.ok(resolvedEvent !== undefined);
  assert.deepEqual(resolvedEvent.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: "resolveFromDestinationZone",
    orderingGroup: entry.orderingGroup,
    status: "resolved",
  });
});

test("resolves queued supported On K.O. draw from last-known source snapshot", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = setupOnKODefinition(state, source);
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...onKOEffect,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
        },
      ],
    },
  };
  p2State.characters = [];
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-on-ko-lki"),
    timingWindowId: toTimingWindowId("timing-window-on-ko-lki"),
    controllerId: p2,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p2,
      zone: source.zone,
    },
    sourceSnapshot: {
      ...toSourceSnapshot(source, p2, p2),
      power: 3000,
    },
    effectBlockId: onKOEffect.id,
    orderingGroup: "nonTurnPlayer",
    sourcePresencePolicy: "resolveFromLastKnownInformation",
  };
  state.effectQueue = [entry];
  const beforeDeck = p2State.deck.length;
  const beforeHand = p2State.hand.length;

  const result = processEffectRuntime(state);
  const afterP2 = must(result.state.players[p2], "p2 result");
  const resolvedEvent = result.events.find(
    (event) => event.type === "effectResolved",
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP2.deck.length, beforeDeck - 1);
  assert.equal(afterP2.hand.length, beforeHand + 1);
  assert.ok(resolvedEvent !== undefined);
  assert.deepEqual(resolvedEvent.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    orderingGroup: entry.orderingGroup,
    status: "resolved",
  });
});

test("non-Life Trigger no-zone queued effects resolve without Life Trigger trash cleanup", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const cardId = toCardId("non-life-no-zone-source");
  const noZone = {
    zone: "noZone" as const,
    playerId: p1,
    slot: "temporary" as const,
  };
  const supportCard = resolvedCard({
    cardId,
    category: "character",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    cardId,
    supportCard.support,
  );
  const customEffect = {
    ...must(baseDefinition.effects[0], "non-Life Trigger no-zone effect"),
    trigger: { type: "custom" as const, event: "nonLifeNoZone" },
    sourcePresencePolicy: "noSourceRequired" as const,
  };
  setupOnPlayDefinition(
    state,
    { ...must(state.players[p1], "p1").leader, cardId },
    {
      ...baseDefinition,
      effects: [customEffect],
    },
    "def-non-life-no-zone",
  );
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry:non-life:no-zone"),
    timingWindowId: toTimingWindowId("timing-window:non-life:no-zone"),
    source: {
      instanceId: toInstanceId("non-life-no-zone-instance"),
      cardId,
      playerId: p1,
      zone: noZone,
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: toInstanceId("non-life-no-zone-instance"),
      cardId,
      zone: noZone,
      category: "character",
    },
    effectBlockId: customEffect.id,
    sourcePresencePolicy: "noSourceRequired",
    causedBy: { type: "ruleProcess", name: "non-life-no-zone" },
  };
  state.effectQueue = [entry];
  const beforeP1 = must(state.players[p1], "p1 before");
  const beforeDeck = beforeP1.deck.length;
  const beforeHand = beforeP1.hand.length;

  const result = processEffectRuntime(state);
  const afterP1 = must(result.state.players[p1], "p1 result");
  const eventTypes = result.events.map((event) => event.type);
  const serializedEvents = JSON.stringify(result.events);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP1.deck.length, beforeDeck - 1);
  assert.equal(afterP1.hand.length, beforeHand + 1);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === entry.source.instanceId),
    false,
  );
  assert.equal(eventTypes.includes("effectResolved"), true);
  assert.equal(eventTypes.includes("cardTrashed"), false);
  assert.equal(serializedEvents.includes("lifeTriggerResolved"), false);
});
