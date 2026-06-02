import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  PlayerId,
  QueueEntryId,
} from "../effect-runtime-queue-processing-test-support.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  processEffectRuntime,
  filterStateForPlayer,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toTimingWindowId,
  queueDrawForP1,
  withCardInZone,
  toSourceSnapshot,
  setupOnPlayDefinition,
  setupCustomEffectResolvedDefinition,
  queueingState,
} from "../effect-runtime-queue-processing-test-support.js";

test("resolves multiple no-choice queued entries in deterministic ENG-010F order", () => {
  const run = () => {
    const state = createActiveState();
    const p1Source = must(must(state.players[p1], "p1").hand[0], "p1 source");
    const p2Source = must(must(state.players[p2], "p2").hand[0], "p2 source");
    const p1Played = withCardInZone({
      state,
      playerId: p1,
      card: p1Source,
      zone: "characterArea",
    });
    const p2Played = withCardInZone({
      state,
      playerId: p2,
      card: p2Source,
      zone: "characterArea",
    });
    const p1Resolved = resolvedCard({
      cardId: p1Played.cardId,
      category: "character",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-p1",
        rulesVersion: "queue-order-rules-p1",
        sourceTextHash: "queue-order-source-p1",
      },
    });
    const p2Resolved = resolvedCard({
      cardId: p2Played.cardId,
      category: "character",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-p2",
        rulesVersion: "queue-order-rules-p2",
        sourceTextHash: "queue-order-source-p2",
      },
    });
    const p1Definition = reviewedOnPlayDrawDefinition(
      p1Played.cardId,
      p1Resolved.support,
    );
    const p2Definition = reviewedOnPlayDrawDefinition(
      p2Played.cardId,
      p2Resolved.support,
    );
    state.cardManifest.effectDefinitionsVersion = "0.1.0";
    state.cardManifest.effectDefinitions = {
      "def-p1": p1Definition,
      "def-p2": p2Definition,
    };
    state.cardManifest.cards[p1Played.cardId] = p1Resolved;
    state.cardManifest.cards[p2Played.cardId] = p2Resolved;
    const p2State = must(state.players[p2], "p2");
    const p1State = must(state.players[p1], "p1");
    if (p1State.deck.length < 2 && p1State.hand.length >= 2) {
      const refillA = must(p1State.hand[0], "p1 refill a");
      const refillB = must(p1State.hand[1], "p1 refill b");
      state.players[p1] = {
        ...p1State,
        hand: p1State.hand.slice(2),
        deck: [
          {
            ...refillA,
            zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
          },
          {
            ...refillB,
            zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
          },
        ],
      };
    }
    if (p2State.deck.length < 2 && p2State.hand.length >= 2) {
      const refillA = must(p2State.hand[0], "p2 refill a");
      const refillB = must(p2State.hand[1], "p2 refill b");
      state.players[p2] = {
        ...p2State,
        hand: p2State.hand.slice(2),
        deck: [
          {
            ...refillA,
            zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
          },
          {
            ...refillB,
            zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
          },
        ],
      };
    }
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        id: toQueueEntryId("queue-entry-turn"),
        timingWindowId: toTimingWindowId("window-a"),
        generation: 0,
        orderingGroup: "turnPlayer",
        controllerId: p1,
        createdAtEventSeq: 9,
        source: {
          instanceId: p1Played.instanceId,
          cardId: p1Played.cardId,
          playerId: p1,
          zone: p1Played.zone,
        },
        sourceSnapshot: toSourceSnapshot(p1Played, p1, p1),
        effectBlockId: must(p1Definition.effects[0], "p1 effect").id,
        sourcePresencePolicy: "mustRemainInSameZone",
      },
      {
        ...queueDrawForP1(),
        id: toQueueEntryId("queue-entry-non-turn"),
        timingWindowId: toTimingWindowId("window-a"),
        generation: 0,
        orderingGroup: "nonTurnPlayer",
        controllerId: p2,
        createdAtEventSeq: 10,
        source: {
          instanceId: p2Played.instanceId,
          cardId: p2Played.cardId,
          playerId: p2,
          zone: p2Played.zone,
        },
        sourceSnapshot: toSourceSnapshot(p2Played, p2, p2),
        effectBlockId: must(p2Definition.effects[0], "p2 effect").id,
        sourcePresencePolicy: "mustRemainInSameZone",
      },
    ];
    return processEffectRuntime(state);
  };
  const result = run();
  const replay = run();
  const drawEvents = result.events.filter(
    (event) => event.type === "cardDrawn",
  );

  assert.equal(result.errors, undefined);
  assert.equal(replay.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(drawEvents.length, 2);
  assert.deepEqual(
    drawEvents.map(
      (event) => (event.payload as { playerId: PlayerId }).playerId,
    ),
    [p1, p2],
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    replay.events.map((event) => event.type),
  );
  assert.equal(result.stateHash, replay.stateHash);
});

test("resolves A then already-pending B before turn-player C created by resolving A", () => {
  const createAbcState = () => {
    const state = createActiveState();
    state.turn.turnPlayerId = p1;
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const p1SourceA = must(p1State.hand[0], "p1 source a");
    const p1SourceC = must(p1State.hand[1], "p1 source c");
    const p2SourceB = must(p2State.hand[0], "p2 source b");
    const p1PlayedA = withCardInZone({
      state,
      playerId: p1,
      card: { ...p1SourceA, cardId: toCardId("abc-card-a") },
      zone: "characterArea",
      index: 0,
    });
    const p1PlayedC = withCardInZone({
      state,
      playerId: p1,
      card: { ...p1SourceC, cardId: toCardId("abc-card-c") },
      zone: "characterArea",
      index: 1,
    });
    const p2PlayedB = withCardInZone({
      state,
      playerId: p2,
      card: { ...p2SourceB, cardId: toCardId("abc-card-b") },
      zone: "characterArea",
      index: 0,
    });
    const p1ResolvedA = resolvedCard({
      cardId: p1PlayedA.cardId,
      category: "character",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-abc-a",
        rulesVersion: "abc-rules-a",
        sourceTextHash: "abc-source-a",
      },
    });
    const p2ResolvedB = resolvedCard({
      cardId: p2PlayedB.cardId,
      category: "character",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-abc-b",
        rulesVersion: "abc-rules-b",
        sourceTextHash: "abc-source-b",
      },
    });
    const aBaseDefinition = reviewedOnPlayDrawDefinition(
      p1PlayedA.cardId,
      p1ResolvedA.support,
    );
    const bBaseDefinition = reviewedOnPlayDrawDefinition(
      p2PlayedB.cardId,
      p2ResolvedB.support,
    );
    const aDefinition: EffectDefinition = {
      ...aBaseDefinition,
      effects: [
        {
          ...must(aBaseDefinition.effects[0], "base effect a"),
          id: toEffectId("effect-abc-a"),
        },
      ],
    };
    const bDefinition: EffectDefinition = {
      ...bBaseDefinition,
      effects: [
        {
          ...must(bBaseDefinition.effects[0], "base effect b"),
          id: toEffectId("effect-abc-b"),
        },
      ],
    };
    const aEffectId = must(aDefinition.effects[0], "effect a").id;
    const cBaseDefinition = setupCustomEffectResolvedDefinition(
      state,
      p1PlayedC,
      `effectResolved:${String(aEffectId)}`,
      "def-abc-c",
    );
    const cDefinition: EffectDefinition = {
      ...cBaseDefinition,
      effects: [
        {
          ...must(cBaseDefinition.effects[0], "base effect c"),
          id: toEffectId("effect-abc-c"),
        },
      ],
    };
    state.cardManifest.effectDefinitionsVersion = "0.1.0";
    state.cardManifest.effectDefinitions = {
      "def-abc-a": aDefinition,
      "def-abc-b": bDefinition,
      "def-abc-c": cDefinition,
    };
    state.cardManifest.cards[p1PlayedA.cardId] = p1ResolvedA;
    state.cardManifest.cards[p2PlayedB.cardId] = p2ResolvedB;
    state.players[p1] = {
      ...must(state.players[p1], "p1 with abc sources"),
      deck: [
        {
          ...must(p1State.hand[2], "p1 deck refill a"),
          zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
        },
        {
          ...must(p1State.hand[3], "p1 deck refill c"),
          zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
        },
      ],
    };
    state.players[p2] = {
      ...must(state.players[p2], "p2 with abc sources"),
      deck: [
        {
          ...must(p2State.hand[1], "p2 deck refill b"),
          zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
        },
        {
          ...must(p2State.hand[2], "p2 deck reserve"),
          zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
        },
      ],
    };
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        id: toQueueEntryId("queue-entry-a"),
        timingWindowId: toTimingWindowId("window-abc"),
        generation: 0,
        orderingGroup: "turnPlayer",
        controllerId: p1,
        createdAtEventSeq: 5,
        source: {
          instanceId: p1PlayedA.instanceId,
          cardId: p1PlayedA.cardId,
          playerId: p1,
          zone: p1PlayedA.zone,
        },
        sourceSnapshot: toSourceSnapshot(p1PlayedA, p1, p1),
        effectBlockId: aEffectId,
        sourcePresencePolicy: "mustRemainInSameZone",
      },
      {
        ...queueDrawForP1(),
        id: toQueueEntryId("queue-entry-b"),
        timingWindowId: toTimingWindowId("window-abc"),
        generation: 0,
        orderingGroup: "nonTurnPlayer",
        controllerId: p2,
        createdAtEventSeq: 6,
        source: {
          instanceId: p2PlayedB.instanceId,
          cardId: p2PlayedB.cardId,
          playerId: p2,
          zone: p2PlayedB.zone,
        },
        sourceSnapshot: toSourceSnapshot(p2PlayedB, p2, p2),
        effectBlockId: must(bDefinition.effects[0], "effect b").id,
        sourcePresencePolicy: "mustRemainInSameZone",
      },
    ];
    return {
      state,
      cEffectId: must(cDefinition.effects[0], "effect c").id,
    };
  };
  const run = () => {
    const setup = createAbcState();
    return {
      cEffectId: setup.cEffectId,
      result: processEffectRuntime(setup.state),
    };
  };

  const firstRun = run();
  const secondRun = run();
  const first = firstRun.result;
  const second = secondRun.result;
  const resolvedPayloads = first.events
    .filter((event) => event.type === "effectResolved")
    .map(
      (event) =>
        event.payload as {
          queueEntryId: QueueEntryId;
          generation: number;
          effectBlockId: EffectId;
          orderingGroup: EffectQueueEntry["orderingGroup"];
        },
    );
  const eventIds = first.events.map((event) => event.id);
  const viewForP1 = filterStateForPlayer(first.state, p1);
  const viewForP2 = filterStateForPlayer(first.state, p2);
  const serializedViews = [viewForP1, viewForP2].map((view) =>
    JSON.stringify(view),
  );
  const isStrictlyIncreasingBySeq = (
    events: readonly { seq: number }[],
  ): boolean =>
    events.every((event, index) => {
      const previous = events[index - 1];
      return previous === undefined || previous.seq < event.seq;
    });

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(
    first.state.effectQueue.map((entry) => entry.id),
    [],
  );
  assert.equal(resolvedPayloads.length, 3);
  assert.deepEqual(
    resolvedPayloads.slice(0, 2).map((payload) => payload.queueEntryId),
    [toQueueEntryId("queue-entry-a"), toQueueEntryId("queue-entry-b")],
  );
  assert.equal(resolvedPayloads[2]?.effectBlockId, firstRun.cEffectId);
  assert.deepEqual(
    resolvedPayloads.map((payload) => ({
      generation: payload.generation,
      orderingGroup: payload.orderingGroup,
    })),
    [
      { generation: 0, orderingGroup: "turnPlayer" },
      { generation: 0, orderingGroup: "nonTurnPlayer" },
      { generation: 1, orderingGroup: "turnPlayer" },
    ],
  );
  assert.deepEqual(
    first.events.map((event) => event.type),
    second.events.map((event) => event.type),
  );
  assert.deepEqual(
    first.events
      .filter((event) => event.type === "effectResolved")
      .map((event) => event.payload),
    second.events
      .filter((event) => event.type === "effectResolved")
      .map((event) => event.payload),
  );
  assert.equal(first.stateHash, second.stateHash);
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.deepEqual(
    first.events.map((event) => event.seq),
    [...first.events.map((event) => event.seq)].sort(
      (left, right) => left - right,
    ),
  );
  assert.equal(isStrictlyIncreasingBySeq(first.events), true);
  assert.equal(isStrictlyIncreasingBySeq(first.state.eventJournal), true);
  for (const serialized of serializedViews) {
    assert.equal(serialized.includes("queueEntryId"), false);
    assert.equal(serialized.includes("queue-entry-a"), false);
    assert.equal(serialized.includes("queue-entry-b"), false);
    assert.equal(serialized.includes('"effectQueue"'), false);
    assert.equal(serialized.includes("sourceSnapshot"), false);
    assert.equal(serialized.includes("triggerIds"), false);
    assert.equal(serialized.includes("orderedIds"), false);
    assert.equal(serialized.includes("def-abc-c"), false);
  }
});

test("deck-out from queued draw is detected at queue rule-processing checkpoint", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-queue-resolve-deckout",
  );
  const queued = processEffectRuntime(state);
  const p1State = must(queued.state.players[p1], "p1");
  queued.state.players[p1] = { ...p1State, deck: [] };

  const result = processEffectRuntime(queued.state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.status.type, "completed");
  assert.ok(
    result.events.some((event) => event.type === "ruleProcessingChecked"),
  );
  assert.ok(result.events.some((event) => event.type === "gameEnded"));
});

test("terminal queue rule-processing checkpoint suppresses effect-resolved follow-up triggers", () => {
  const { state, played } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const triggerSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "p1 trigger source"),
      cardId: toCardId("deckout-trigger-source"),
    },
    zone: "characterArea",
    index: 1,
  });
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const resolvedEffectId = must(definition.effects[0], "draw effect").id;
  setupOnPlayDefinition(
    state,
    played,
    definition,
    "def-queue-resolve-terminal-before-follow-up",
  );
  setupCustomEffectResolvedDefinition(
    state,
    triggerSource,
    `effectResolved:${String(resolvedEffectId)}`,
    "def-terminal-follow-up",
  );
  const queued = processEffectRuntime(state);
  const queuedP1State = must(queued.state.players[p1], "queued p1");
  queued.state.players[p1] = { ...queuedP1State, deck: [] };

  const result = processEffectRuntime(queued.state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.status.type, "completed");
  assert.deepEqual(result.state.effectQueue, []);
  assert.ok(result.events.some((event) => event.type === "gameEnded"));
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (
          event.payload as {
            effectBlockId?: EffectId;
          }
        ).effectBlockId === toEffectId("deckout-trigger-source:auto-on-play-1"),
    ),
    false,
  );
});
