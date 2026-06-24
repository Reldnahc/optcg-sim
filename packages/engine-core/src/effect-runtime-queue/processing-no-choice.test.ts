import assert from "node:assert/strict";
import { test } from "vitest";

import type { Trigger } from "@optcg/types";

import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
} from "./test-support.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  processEffectRuntime,
  toCardId,
  toEffectId,
  toInstanceId,
  toQueueEntryId,
  toTimingWindowId,
  queueDrawForP1,
  withCardInZone,
  toSourceSnapshot,
  setupOnPlayDefinition,
  setupOnKODefinition,
  queueingState,
} from "./test-support.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

const expectedEffectResolvedPayload = (
  entry: EffectQueueEntry,
  entryPoint: Trigger,
  sourceCategory = entry.sourceSnapshot.category,
): unknown => ({
  queueEntryId: entry.id,
  timingWindowId: entry.timingWindowId,
  generation: entry.generation,
  effectBlockId: entry.effectBlockId,
  ...(entry.triggerEventId === undefined
    ? {}
    : { triggerEventId: entry.triggerEventId }),
  sourcePresencePolicy: entry.sourcePresencePolicy,
  orderingGroup: entry.orderingGroup,
  controllerId: entry.controllerId,
  source: entry.source,
  sourceCardId: entry.sourceSnapshot.cardId,
  effectCategory: "auto",
  entryPoint,
  sourceTypes: [],
  sourceCategory,
  ...(entry.presentation === undefined
    ? {}
    : { presentation: entry.presentation }),
  status: "resolved",
});

const eventStatuses = (
  events: readonly { readonly payload: unknown; readonly type: string }[],
): unknown[] =>
  events
    .filter((event) => event.type === "effectResolved")
    .map((event) => (event.payload as { readonly status?: unknown }).status);

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
  assert.equal(result.state.pendingDecision, undefined);
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
  assert.deepEqual(
    resolvedEvent.payload,
    expectedEffectResolvedPayload(queuedEntry, { type: "onPlay" }),
  );
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
  assert.equal(eventTypes.includes("decisionCreated"), false);
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
  assert.deepEqual(
    resolvedEvent.payload,
    expectedEffectResolvedPayload(entry, { type: "onPlay" }, "character"),
  );
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
  assert.deepEqual(
    resolvedEvent.payload,
    expectedEffectResolvedPayload(entry, { type: "onKO" }),
  );
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
  assert.deepEqual(
    resolvedEvent.payload,
    expectedEffectResolvedPayload(entry, { type: "onKO" }),
  );
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

test("condition yourTurn true resolves queued draw deterministically", () => {
  const run = () => {
    const state = createActiveState();
    state.turn.turnPlayerId = p1;
    const source = must(state.players[p1], "p1").leader;
    const supportCard = resolvedCard({
      cardId: source.cardId,
      category: "leader",
    });
    const base = reviewedOnPlayDrawDefinition(
      source.cardId,
      supportCard.support,
    );
    const effect = must(base.effects[0], "effect");
    setupOnPlayDefinition(
      state,
      source,
      {
        ...base,
        effects: [
          {
            ...effect,
            id: toEffectId("your-turn-true"),
            condition: { type: "yourTurn" },
          },
        ],
      },
      "def-queue-your-turn-true",
    );
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
        sourceSnapshot: toSourceSnapshot(source, p1, p1),
        effectBlockId: toEffectId("your-turn-true"),
        sourcePresencePolicy: "mustRemainInSameZone",
      },
    ];
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.equal(first.state.effectQueue.length, 0);
  assert.deepEqual(first.events.map((event) => event.type).slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
  assert.deepEqual(first.events, second.events);
  assert.equal(first.stateHash, second.stateHash);
});

test("condition yourTurn false removes queued entry without mutation side effects", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("your-turn-false"),
          condition: { type: "yourTurn" },
        },
      ],
    },
    "def-queue-your-turn-false",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: toEffectId("your-turn-false"),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const before = structuredClone(state);

  const result = processEffectRuntime(state);
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectResolved"],
  );
  assert.deepEqual(eventStatuses(result.events), ["conditionFailed"]);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    afterP1.hand.length,
    must(before.players[p1], "p1 before").hand.length,
  );
  assert.equal(
    afterP1.deck.length,
    must(before.players[p1], "p1 before").deck.length,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("attachedDonCount self live source true comparator resolves queued draw", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const attached = must(p1State.hand[1], "attached don source");
  source.attachedDon = [attached.instanceId];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("attached-don-gte"),
          condition: {
            type: "attachedDonCount",
            target: { type: "self" },
            op: "gte",
            value: 1,
          },
        },
      ],
    },
    "def-attached-don-conditions",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-attached-don-true"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: toEffectId("attached-don-gte"),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeDeck - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    beforeHand + 1,
  );
  assert.deepEqual(result.events.map((event) => event.type).slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
});

test("attachedDonCount self live source false comparator skips queued draw", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const attached = must(p1State.hand[1], "attached don source");
  source.attachedDon = [attached.instanceId];
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("attached-don-gt"),
          condition: {
            type: "attachedDonCount",
            target: { type: "self" },
            op: "gt",
            value: 1,
          },
        },
      ],
    },
    "def-attached-don-condition-false",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-attached-don-false"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: toEffectId("attached-don-gt"),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(must(result.state.players[p1], "p1").deck.length, beforeDeck);
  assert.equal(must(result.state.players[p1], "p1").hand.length, beforeHand);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectResolved"],
  );
  assert.deepEqual(eventStatuses(result.events), ["conditionFailed"]);
});

test("attachedDonCount fails closed for non-self target and source-snapshot-only lookup attempts", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("attached-don-non-self"),
          condition: {
            type: "attachedDonCount",
            target: { type: "myLeader" },
            op: "gte",
            value: 0,
          },
        },
        {
          ...effect,
          id: toEffectId("attached-don-lki"),
          condition: {
            type: "attachedDonCount",
            target: { type: "self" },
            op: "gte",
            value: 0,
          },
        },
      ],
    },
    "def-attached-don-fail-closed",
  );
  const nonSelfState = structuredClone(state);
  nonSelfState.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("attached-don-non-self"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  const nonSelfBefore = structuredClone(nonSelfState);

  const nonSelf = processEffectRuntime(nonSelfState);

  assert.deepEqual(nonSelf.state, nonSelfBefore);
  assert.deepEqual(nonSelf.events, []);
  assert.equal(must(nonSelf.errors, "errors")[0]?.type, "effectRuntimeError");

  const lkiState = structuredClone(state);
  lkiState.effectQueue = [
    {
      ...queueDrawForP1(),
      effectBlockId: toEffectId("attached-don-lki"),
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      source: {
        instanceId: toInstanceId("missing-live-source"),
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: {
        ...toSourceSnapshot(source, p1, p1),
        instanceId: toInstanceId("missing-live-source"),
      },
    },
  ];
  const lkiBefore = structuredClone(lkiState);

  const lki = processEffectRuntime(lkiState);

  assert.deepEqual(lki.state, lkiBefore);
  assert.deepEqual(lki.events, []);
  assert.equal(must(lki.errors, "errors")[0]?.type, "effectRuntimeError");
});

test("unsupported conditions fail closed deterministically", () => {
  const run = () => {
    const state = createActiveState();
    const source = must(state.players[p1], "p1").leader;
    const supportCard = resolvedCard({
      cardId: source.cardId,
      category: "leader",
    });
    const base = reviewedOnPlayDrawDefinition(
      source.cardId,
      supportCard.support,
    );
    const effect = must(base.effects[0], "effect");
    setupOnPlayDefinition(
      state,
      source,
      {
        ...base,
        effects: [
          {
            ...effect,
            id: toEffectId("unsupported-condition"),
            condition: { type: "custom", check: "unsupported-condition" },
          },
        ],
      },
      "def-unsupported-condition",
    );
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        effectBlockId: toEffectId("unsupported-condition"),
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
        sourceSnapshot: toSourceSnapshot(source, p1, p1),
        sourcePresencePolicy: "mustRemainInSameZone",
      },
    ];
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.deepEqual(first.events, []);
  assert.equal(must(first.errors, "errors")[0]?.type, "effectRuntimeError");
  assert.deepEqual(first.state, second.state);
  assert.equal(first.stateHash, second.stateHash);
});

test("condition false on first queued entry skips it and still resolves later supported entry", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  state.turn.turnPlayerId = p2;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("queue-cond-false-first"),
          condition: { type: "yourTurn" },
        },
        { ...effect, id: toEffectId("queue-cond-false-second") },
      ],
    },
    "def-queue-cond-false-first",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-cond-false-first"),
      effectBlockId: toEffectId("queue-cond-false-first"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
      createdAtEventSeq: 1,
      generation: 1,
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-cond-false-second"),
      effectBlockId: toEffectId("queue-cond-false-second"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
      createdAtEventSeq: 2,
      generation: 2,
    },
  ];

  const run = () => processEffectRuntime(structuredClone(state));
  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.equal(first.state.effectQueue.length, 0);
  assert.deepEqual(first.events.map((event) => event.type).slice(0, 5), [
    "effectResolved",
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
  ]);
  assert.deepEqual(eventStatuses(first.events).slice(0, 2), [
    "conditionFailed",
    "resolved",
  ]);
  assert.deepEqual(first.events, second.events);
  assert.equal(first.stateHash, second.stateHash);
});

test("unsupported condition on first queued entry fail-closes and does not resolve later entries", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const effect = must(base.effects[0], "effect");
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: toEffectId("queue-unsupported-first"),
          condition: { type: "custom", check: "unsupported-condition" },
        },
        { ...effect, id: toEffectId("queue-supported-second") },
      ],
    },
    "def-queue-unsupported-first",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-unsupported-first"),
      effectBlockId: toEffectId("queue-unsupported-first"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
      createdAtEventSeq: 1,
      generation: 1,
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-supported-second"),
      effectBlockId: toEffectId("queue-supported-second"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
      createdAtEventSeq: 2,
      generation: 2,
    },
  ];

  const run = () => processEffectRuntime(structuredClone(state));
  const first = run();
  const second = run();

  assert.deepEqual(first.events, []);
  assert.equal(must(first.errors, "errors")[0]?.type, "effectRuntimeError");
  assert.deepEqual(first.state, second.state);
  assert.equal(first.stateHash, second.stateHash);
});
