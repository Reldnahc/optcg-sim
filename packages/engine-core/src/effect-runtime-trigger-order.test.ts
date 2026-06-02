import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardSnapshot,
  CardId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./state/canonical-state.js";
import { applyAction } from "./index.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";

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

const withCardInZone = (params: {
  state: ReturnType<typeof createActiveState>;
  playerId: PlayerId;
  card: CardInstance;
  zone: "characterArea" | "stageArea";
  index?: number;
}): CardInstance => {
  const { state, playerId, card, zone } = params;
  const index = params.index ?? 0;
  const placed: CardInstance =
    zone === "characterArea"
      ? {
          ...card,
          zone: { zone, playerId, slot: "character", index },
          attachedDon: [],
          state: "active",
          turnPlayed: state.turn.globalTurn,
        }
      : {
          ...card,
          zone: { zone, playerId, slot: "stage", index: 0 },
          attachedDon: [],
          state: "active",
        };
  const player = must(state.players[playerId], "player");
  if (zone === "characterArea") {
    player.characters = [...player.characters, placed];
  } else {
    player.stage = placed;
  }
  return placed;
};

const toSourceSnapshot = (
  card: CardInstance,
  ownerId: PlayerId,
  controllerId: PlayerId,
): CardSnapshot => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId,
  controllerId,
  zone: card.zone,
  category: card.zone.zone === "stageArea" ? "stage" : "character",
  colors: ["red"],
  keywords: [],
});

test("choice-required queued groups create chooseTriggerOrder decision and decisionCreated event", () => {
  const state = createActiveState();
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-a"),
      timingWindowId: toTimingWindowId("window-choice"),
      source: { ...queueDrawForP1().source, instanceId: toInstanceId("src-a") },
      sourceSnapshot: {
        ...queueDrawForP1().sourceSnapshot,
        instanceId: toInstanceId("src-a"),
      },
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-b"),
      timingWindowId: toTimingWindowId("window-choice"),
      source: { ...queueDrawForP1().source, instanceId: toInstanceId("src-b") },
      sourceSnapshot: {
        ...queueDrawForP1().sourceSnapshot,
        instanceId: toInstanceId("src-b"),
      },
    },
  ];
  const beforeQueue = structuredClone(state.effectQueue);
  const beforeSeq = state.seq;
  const beforeJournalLength = state.eventJournal.length;

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");
  const decisionCreated = result.events.find(
    (event) => event.type === "decisionCreated",
  );

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "chooseTriggerOrder");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(decision.triggerIds, [
    toQueueEntryId("queue-entry-a"),
    toQueueEntryId("queue-entry-b"),
  ]);
  assert.deepEqual(decision.constraints, { mustUseAll: true });
  assert.deepEqual(result.state.effectQueue, beforeQueue);
  assert.equal(result.state.seq, toStateSeq(beforeSeq + 1));
  assert.equal(result.events.length, 1);
  assert.ok(decisionCreated !== undefined);
  assert.equal(decisionCreated.visibility.type, "public");
  assert.deepEqual(decisionCreated.causedBy, {
    type: "ruleProcess",
    name: "effectRuntime:chooseTriggerOrder",
  });
  assert.deepEqual(decisionCreated.payload, {
    decisionId: decision.id,
    decisionType: "chooseTriggerOrder",
    playerId: p1,
  });
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
});

test("existing chooseTriggerOrder pending decision pauses runtime without recreating the decision", () => {
  const state = createActiveState();
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-a"),
      timingWindowId: toTimingWindowId("window-choice"),
      source: { ...queueDrawForP1().source, instanceId: toInstanceId("src-a") },
      sourceSnapshot: {
        ...queueDrawForP1().sourceSnapshot,
        instanceId: toInstanceId("src-a"),
      },
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-b"),
      timingWindowId: toTimingWindowId("window-choice"),
      source: { ...queueDrawForP1().source, instanceId: toInstanceId("src-b") },
      sourceSnapshot: {
        ...queueDrawForP1().sourceSnapshot,
        instanceId: toInstanceId("src-b"),
      },
    },
  ];
  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const before = structuredClone(paused.state);

  const result = processEffectRuntime(paused.state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, hashCanonicalStateValue(before));
});

test("choice-required decision creation is deterministic for identical input", () => {
  const run = () => {
    const state = createActiveState();
    state.effectQueue = [
      {
        ...queueDrawForP1(),
        id: toQueueEntryId("queue-entry-a"),
        timingWindowId: toTimingWindowId("window-choice"),
        source: {
          ...queueDrawForP1().source,
          instanceId: toInstanceId("src-a"),
        },
        sourceSnapshot: {
          ...queueDrawForP1().sourceSnapshot,
          instanceId: toInstanceId("src-a"),
        },
      },
      {
        ...queueDrawForP1(),
        id: toQueueEntryId("queue-entry-b"),
        timingWindowId: toTimingWindowId("window-choice"),
        source: {
          ...queueDrawForP1().source,
          instanceId: toInstanceId("src-b"),
        },
        sourceSnapshot: {
          ...queueDrawForP1().sourceSnapshot,
          instanceId: toInstanceId("src-b"),
        },
      },
    ];
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.pendingDecision, second.state.pendingDecision);
  assert.equal(first.stateHash, second.stateHash);
});

test("valid chooseTriggerOrder response resumes queue and preserves chosen order before non-turn bucket", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const p1Source = must(p1State.hand[0], "p1 source");
  const p2Source = must(p2State.hand[0], "p2 source");
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
      effectDefinitionId: "def-resume-p1",
      rulesVersion: "resume-rules-p1",
      sourceTextHash: "resume-source-p1",
    },
  });
  const p1Definition = reviewedOnPlayDrawDefinition(
    p1Played.cardId,
    p1Resolved.support,
  );
  const p2Resolved = resolvedCard({
    cardId: p2Played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-resume-p2",
      rulesVersion: "resume-rules-p2",
      sourceTextHash: "resume-source-p2",
    },
  });
  const p2Definition = reviewedOnPlayDrawDefinition(
    p2Played.cardId,
    p2Resolved.support,
  );
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-resume-p1": p1Definition,
    "def-resume-p2": p2Definition,
  };
  state.cardManifest.cards[p1Played.cardId] = p1Resolved;
  state.cardManifest.cards[p2Played.cardId] = p2Resolved;
  state.players[p1] = {
    ...must(state.players[p1], "p1 with source"),
    deck: [
      {
        ...must(p1State.hand[2], "p1 deck refill a"),
        zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
      },
      {
        ...must(p1State.hand[3], "p1 deck refill b"),
        zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
      },
      {
        ...must(p1State.hand[4], "p1 deck refill c"),
        zone: { zone: "deck", playerId: p1, slot: "deck", index: 2 },
      },
    ],
  };
  state.players[p2] = {
    ...must(state.players[p2], "p2 with source"),
    deck: [
      {
        ...must(p2State.hand[1], "p2 deck refill"),
        zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
      },
    ],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-a"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "turnPlayer",
      controllerId: p1,
      createdAtEventSeq: 5,
      source: {
        instanceId: p1Played.instanceId,
        cardId: p1Played.cardId,
        playerId: p1,
        zone: p1Played.zone,
      },
      sourceSnapshot: toSourceSnapshot(p1Played, p1, p1),
      effectBlockId: must(p1Definition.effects[0], "p1 effect a").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-b"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "turnPlayer",
      controllerId: p1,
      createdAtEventSeq: 6,
      source: {
        instanceId: p1Played.instanceId,
        cardId: p1Played.cardId,
        playerId: p1,
        zone: p1Played.zone,
      },
      sourceSnapshot: toSourceSnapshot(p1Played, p1, p1),
      effectBlockId: must(p1Definition.effects[0], "p1 effect b").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-c"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
      createdAtEventSeq: 7,
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

  const paused = processEffectRuntime(state);
  const pendingDecision = must(
    paused.state.pendingDecision,
    "pending decision",
  );
  const resumed = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [toQueueEntryId("queue-entry-b")],
    },
  });
  const resolvedPayloads = resumed.events
    .filter((event) => event.type === "effectResolved")
    .map((event) => event.payload as { queueEntryId: QueueEntryId });

  assert.equal(resumed.errors, undefined);
  assert.equal(resumed.state.pendingDecision, undefined);
  assert.equal(resumed.state.effectQueue.length, 0);
  assert.deepEqual(
    resolvedPayloads.map((payload) => payload.queueEntryId),
    [
      toQueueEntryId("queue-entry-b"),
      toQueueEntryId("queue-entry-a"),
      toQueueEntryId("queue-entry-c"),
    ],
  );
});

test("resume pauses again when a later same-player bucket still needs chooseTriggerOrder", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const p1Source = must(p1State.hand[0], "p1 source");
  const p2Source = must(p2State.hand[0], "p2 source");
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
      effectDefinitionId: "def-resume-pause-p1",
      rulesVersion: "resume-pause-rules-p1",
      sourceTextHash: "resume-pause-source-p1",
    },
  });
  const p1Definition = reviewedOnPlayDrawDefinition(
    p1Played.cardId,
    p1Resolved.support,
  );
  const p2Resolved = resolvedCard({
    cardId: p2Played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-resume-pause-p2",
      rulesVersion: "resume-pause-rules-p2",
      sourceTextHash: "resume-pause-source-p2",
    },
  });
  const p2Definition = reviewedOnPlayDrawDefinition(
    p2Played.cardId,
    p2Resolved.support,
  );
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-resume-pause-p1": p1Definition,
    "def-resume-pause-p2": p2Definition,
  };
  state.cardManifest.cards[p1Played.cardId] = p1Resolved;
  state.cardManifest.cards[p2Played.cardId] = p2Resolved;
  state.players[p1] = {
    ...must(state.players[p1], "p1 pause with source"),
    deck: [
      {
        ...must(p1State.hand[2], "p1 pause deck refill a"),
        zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
      },
      {
        ...must(p1State.hand[3], "p1 pause deck refill b"),
        zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
      },
      {
        ...must(p1State.hand[4], "p1 pause deck refill c"),
        zone: { zone: "deck", playerId: p1, slot: "deck", index: 2 },
      },
    ],
  };
  state.players[p2] = {
    ...must(state.players[p2], "p2 pause with source"),
    deck: [
      {
        ...must(p2State.hand[1], "p2 pause deck refill a"),
        zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
      },
      {
        ...must(p2State.hand[2], "p2 pause deck refill b"),
        zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
      },
    ],
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-a"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "turnPlayer",
      controllerId: p1,
      source: {
        instanceId: p1Played.instanceId,
        cardId: p1Played.cardId,
        playerId: p1,
        zone: p1Played.zone,
      },
      sourceSnapshot: toSourceSnapshot(p1Played, p1, p1),
      effectBlockId: must(p1Definition.effects[0], "p1 pause effect a").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-b"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "turnPlayer",
      controllerId: p1,
      source: {
        instanceId: p1Played.instanceId,
        cardId: p1Played.cardId,
        playerId: p1,
        zone: p1Played.zone,
      },
      sourceSnapshot: toSourceSnapshot(p1Played, p1, p1),
      effectBlockId: must(p1Definition.effects[0], "p1 pause effect b").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-c"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
      source: {
        instanceId: p2Played.instanceId,
        cardId: p2Played.cardId,
        playerId: p2,
        zone: p2Played.zone,
      },
      sourceSnapshot: toSourceSnapshot(p2Played, p2, p2),
      effectBlockId: must(p2Definition.effects[0], "p2 pause effect c").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-d"),
      timingWindowId: toTimingWindowId("window-a"),
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
      source: {
        instanceId: p2Played.instanceId,
        cardId: p2Played.cardId,
        playerId: p2,
        zone: p2Played.zone,
      },
      sourceSnapshot: toSourceSnapshot(p2Played, p2, p2),
      effectBlockId: must(p2Definition.effects[0], "p2 pause effect d").id,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];

  const paused = processEffectRuntime(state);
  const resumed = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: must(paused.state.pendingDecision, "first decision").id,
    response: {
      type: "orderedIds",
      ids: [toQueueEntryId("queue-entry-b")],
    },
  });

  assert.equal(resumed.errors, undefined);
  const secondDecision = must(
    resumed.state.pendingDecision,
    "second chooseTriggerOrder decision",
  );
  assert.equal(secondDecision.type, "chooseTriggerOrder");
  assert.deepEqual(secondDecision.triggerIds, [
    toQueueEntryId("queue-entry-c"),
    toQueueEntryId("queue-entry-d"),
  ]);
  assert.deepEqual(
    resumed.state.effectQueue.map((entry) => entry.id),
    [toQueueEntryId("queue-entry-c"), toQueueEntryId("queue-entry-d")],
  );
  assert.equal(
    resumed.events.some((event) => event.type === "decisionResolved"),
    true,
  );
  assert.equal(
    resumed.events.some((event) => event.type === "decisionCreated"),
    true,
  );
});
