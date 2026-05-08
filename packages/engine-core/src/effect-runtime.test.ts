import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardSnapshot,
  CardId,
  DecisionId,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  SourcePresencePolicy,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { applyAction, getLegalActions } from "./index.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toEngineEventId,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toCardId = (value: string): CardId => value as CardId;
const toDecisionId = (value: string): DecisionId => value as DecisionId;
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

const publicCharacterTargetRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
  ...overrides,
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

test("empty effect runtime processing is a deterministic no-op", () => {
  const state = createActiveState();
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(result.errors, undefined);
  assert.equal(result.decisions, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.seq, before.seq);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
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

const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  category: "character" | "stage",
) => {
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed" as const,
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category,
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

const setupOnPlayDefinition = (
  state: ReturnType<typeof createActiveState>,
  played: CardInstance,
  definition: EffectDefinition,
  effectDefinitionId = "def-on-play",
): void => {
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[played.cardId] = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const setupOnKODefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effectDefinitionId = "def-on-ko",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 3000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "on-ko-rules",
      sourceTextHash: "on-ko-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const setupCustomEffectResolvedDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  eventName: string,
  effectDefinitionId = "def-effect-resolved",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "effect-resolved-rules",
      sourceTextHash: "effect-resolved-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "custom", event: eventName },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const queueingState = (): {
  state: ReturnType<typeof createActiveState>;
  played: CardInstance;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "hand source");
  const played = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  appendCardPlayedEvent(state, played, "character");
  return { state, played };
};

const targetSelectionQueueState = (
  request: TargetRequest = publicCharacterTargetRequest(),
): {
  state: ReturnType<typeof createActiveState>;
  entry: EffectQueueEntry;
  request: TargetRequest;
  targets: readonly CardInstance[];
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const firstTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "first target"),
    zone: "characterArea",
    index: 0,
  });
  const secondTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "second target"),
    zone: "characterArea",
    index: 1,
  });
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-target-selection",
      rulesVersion: "target-selection-rules",
      sourceTextHash: "target-selection-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("target-selection-effect");
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base effect"),
        id: effectBlockId,
        effect: { type: "ko", target: { type: "choose", request } },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-target-selection": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[firstTarget.cardId] = resolvedCard({
    cardId: firstTarget.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  state.cardManifest.cards[secondTarget.cardId] = resolvedCard({
    cardId: secondTarget.cardId,
    category: "character",
    cost: 4,
    power: 5000,
  });

  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-target-selection"),
    state: "pending",
    timingWindowId: toTimingWindowId("window-target-selection"),
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "target-selection-test" },
  };
  state.effectQueue = [entry];

  return { state, entry, request, targets: [firstTarget, secondTarget] };
};

const mixedOrderedDrawThenTargetState = (
  request: TargetRequest = publicCharacterTargetRequest(),
): {
  state: ReturnType<typeof createActiveState>;
  drawEntry: EffectQueueEntry;
  targetEntry: EffectQueueEntry;
} => {
  const { state, entry: targetEntry } = targetSelectionQueueState(request);
  const p1State = must(state.players[p1], "p1");
  const drawSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[2], "draw source"),
      cardId: toCardId("mixed-draw-source-card"),
    },
    zone: "characterArea",
    index: 1,
  });
  p1State.deck = [
    {
      ...must(p1State.hand[3], "mixed draw deck refill"),
      cardId: toCardId("mixed-draw-deck-card"),
      zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
    },
    {
      ...must(p1State.hand[4], "mixed draw deck buffer"),
      cardId: toCardId("mixed-draw-deck-buffer"),
      zone: { zone: "deck", playerId: p1, slot: "deck", index: 1 },
    },
  ];
  const drawSupport = resolvedCard({
    cardId: drawSource.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-mixed-draw",
      rulesVersion: "mixed-draw-rules",
      sourceTextHash: "mixed-draw-source",
    },
  });
  const drawDefinition = reviewedOnPlayDrawDefinition(
    drawSource.cardId,
    drawSupport.support,
  );
  const drawEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-mixed-draw"),
    timingWindowId: targetEntry.timingWindowId,
    generation: targetEntry.generation,
    controllerId: p1,
    source: {
      instanceId: drawSource.instanceId,
      cardId: drawSource.cardId,
      playerId: p1,
      zone: drawSource.zone,
    },
    sourceSnapshot: toSourceSnapshot(drawSource, p1, p1),
    effectBlockId: must(drawDefinition.effects[0], "draw effect").id,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "mixed-draw-target-test" },
  };
  const normalizedTargetEntry: EffectQueueEntry = {
    ...targetEntry,
    id: toQueueEntryId("queue-entry-mixed-target"),
    createdAtEventSeq: 2,
    causedBy: { type: "ruleProcess", name: "mixed-draw-target-test" },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-mixed-draw": drawDefinition,
  };
  state.cardManifest.cards[drawSource.cardId] = drawSupport;
  state.effectQueue = [drawEntry, normalizedTargetEntry];
  return { state, drawEntry, targetEntry: normalizedTargetEntry };
};

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

test("queued On K.O. draw with unsupported source-presence policy fails closed without mutation", () => {
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
          sourcePresencePolicy: "noSourceRequired",
        },
      ],
    },
  };
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-on-ko-unsupported-policy"),
    timingWindowId: toTimingWindowId("timing-window-on-ko-unsupported-policy"),
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
    sourcePresencePolicy: "noSourceRequired",
  };
  state.effectQueue = [entry];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test("queued source-presence policy mismatch with effect definition fails closed without mutation or events", () => {
  const state = createActiveState();
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    sourcePresencePolicy: "noSourceRequired",
    source: {
      ...queueDrawForP1().source,
      instanceId: toInstanceId("not-live-for-policy-mismatch"),
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: toInstanceId("not-live-for-policy-mismatch"),
    },
  };
  const supportCard = resolvedCard({
    cardId: entry.source.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    {
      ...must(state.players[p1], "p1").leader,
      cardId: entry.source.cardId,
    },
    reviewedOnPlayDrawDefinition(entry.source.cardId, supportCard.support),
    "def-policy-mismatch",
  );
  state.effectQueue = [entry];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
  assert.equal(hashCanonicalStateValue(result.state), beforeHash);
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

test("resolves multiple no-choice queued entries in deterministic ENG-010F order", () => {
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

  const result = processEffectRuntime(state);
  const drawEvents = result.events.filter(
    (event) => event.type === "cardDrawn",
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(drawEvents.length, 2);
  assert.deepEqual(
    drawEvents.map(
      (event) => (event.payload as { playerId: PlayerId }).playerId,
    ),
    [p1, p2],
  );
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

test("supported queued target request creates selectTargets decision without resolving the effect", () => {
  const { state, entry, request, targets } = targetSelectionQueueState();
  const beforeQueue = structuredClone(state.effectQueue);
  const beforeSeq = state.seq;
  const beforeJournalLength = state.eventJournal.length;

  const result = processEffectRuntime(state);

  const decision = must(result.state.pendingDecision, "pending decision");
  const decisionCreated = result.events.find(
    (event) => event.type === "decisionCreated",
  );

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectTargets");
  assert.equal(
    decision.id,
    toDecisionId("decision:selectTargets:queue-entry-target-selection"),
  );
  assert.equal(decision.playerId, p1);
  assert.equal(decision.prompt, "Select targets.");
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  });
  assert.deepEqual(decision.request, request);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    targets.map((target) => target.instanceId),
  );
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.visibility),
    [{ type: "public" }, { type: "public" }],
  );
  assert.deepEqual(result.state.effectQueue, beforeQueue);
  assert.equal(result.state.seq, toStateSeq(beforeSeq + 1));
  assert.equal(result.events.length, 1);
  assert.ok(decisionCreated !== undefined);
  assert.equal(decisionCreated.visibility.type, "public");
  assert.deepEqual(decisionCreated.causedBy, decision.causedBy);
  assert.deepEqual(decisionCreated.payload, {
    decisionId: decision.id,
    decisionType: "selectTargets",
    playerId: p1,
  });
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
  assert.deepEqual(
    getLegalActions(result.state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "targets",
          targets: [must(decision.candidates[0], "first candidate").card],
        },
      },
    ],
  );
});

test("selectTargets decision creation is deterministic for identical queued target input", () => {
  const run = () => processEffectRuntime(targetSelectionQueueState().state);

  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.pendingDecision, second.state.pendingDecision);
  assert.equal(first.stateHash, second.stateHash);
});

test("unsupported queued target request fails closed without mutating state", () => {
  const { state } = targetSelectionQueueState(
    publicCharacterTargetRequest({ visibility: "privateToChooser" }),
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
  assert.equal(hashCanonicalStateValue(result.state), beforeHash);
});

test("ordered draw before target pause preserves prior runtime events in returned result", () => {
  const { state, drawEntry, targetEntry } = mixedOrderedDrawThenTargetState();
  const paused = processEffectRuntime(state);
  const pendingDecision = must(
    paused.state.pendingDecision,
    "choose order decision",
  );
  assert.equal(pendingDecision.type, "chooseTriggerOrder");
  const beforeJournalLength = paused.state.eventJournal.length;

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [drawEntry.id, targetEntry.id],
    },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "decisionCreated",
    ],
  );
  assert.equal(result.state.pendingDecision?.type, "selectTargets");
  assert.deepEqual(
    result.events
      .filter((event) => event.type === "effectResolved")
      .map(
        (event) =>
          (event.payload as { queueEntryId: QueueEntryId }).queueEntryId,
      ),
    [drawEntry.id],
  );
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.id),
    [targetEntry.id],
  );
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
});

test("unsupported ordered target after draw fails closed without keeping partial draw mutation", () => {
  const { state, drawEntry, targetEntry } = mixedOrderedDrawThenTargetState(
    publicCharacterTargetRequest({ visibility: "privateToChooser" }),
  );
  const paused = processEffectRuntime(state);
  const pendingDecision = must(
    paused.state.pendingDecision,
    "choose order decision",
  );
  assert.equal(pendingDecision.type, "chooseTriggerOrder");
  const beforeP1 = structuredClone(must(paused.state.players[p1], "p1"));

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [drawEntry.id, targetEntry.id],
    },
  });

  const afterP1 = must(result.state.players[p1], "p1 result");
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 2,
      },
    },
  ]);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved"],
  );
  assert.equal(afterP1.deck.length, beforeP1.deck.length);
  assert.equal(afterP1.hand.length, beforeP1.hand.length);
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.id),
    [drawEntry.id, targetEntry.id],
  );
  assert.equal(result.state.pendingDecision, undefined);
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
      ids: [toQueueEntryId("queue-entry-b"), toQueueEntryId("queue-entry-a")],
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
      ids: [toQueueEntryId("queue-entry-b"), toQueueEntryId("queue-entry-a")],
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

test("queued source-presence failure rejects without mutation or events", () => {
  const state = createActiveState();
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      source: {
        ...queueDrawForP1().source,
        instanceId: toInstanceId("missing-source"),
      },
      sourceSnapshot: {
        ...queueDrawForP1().sourceSnapshot,
        instanceId: toInstanceId("missing-source"),
      },
    },
  ];
  const before = structuredClone(state);

  const result = processEffectRuntime(state);
  const eventTypes = result.events.map((event) => event.type as string);

  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
  assert.equal(eventTypes.includes("effectResolved"), false);
  assert.equal(eventTypes.includes("effectCancelled"), false);
  assert.equal(eventTypes.includes("effectCanceled"), false);
});

test("queued entries with centralized source-presence policies still fail closed for unsupported work", () => {
  const sourcePresencePolicies: SourcePresencePolicy[] = [
    "resolveFromDestinationZone",
    "resolveFromLastKnownInformation",
    "noSourceRequired",
  ];
  const cases: Array<{
    name: string;
    setup: (state: ReturnType<typeof createActiveState>) => EffectQueueEntry;
  }> = [
    {
      name: "missing effect definition",
      setup: (state) => {
        const entry = {
          ...queueDrawForP1(),
          sourcePresencePolicy: "noSourceRequired" as const,
          effectBlockId: toEffectId("missing-no-source-required-effect"),
        };
        state.cardManifest.effectDefinitionsVersion = "0.1.0";
        state.cardManifest.effectDefinitions = {};
        state.cardManifest.cards[entry.source.cardId] = resolvedCard({
          cardId: entry.source.cardId,
          category: "character",
          support: {
            status: "implemented-dsl",
            effectDefinitionId: "missing-no-source-required-definition",
            rulesVersion: "missing-no-source-required-rules",
            sourceTextHash: "missing-no-source-required-source",
          },
        });
        return entry;
      },
    },
    {
      name: "unsupported no-choice primitive",
      setup: (state) => {
        const entry = {
          ...queueDrawForP1(),
          sourcePresencePolicy: "noSourceRequired" as const,
        };
        const supportCard = resolvedCard({
          cardId: entry.source.cardId,
          category: "character",
        });
        const definition = reviewedOnPlayDrawDefinition(
          entry.source.cardId,
          supportCard.support,
        );
        setupOnPlayDefinition(
          state,
          {
            ...must(state.players[p1], "p1").leader,
            cardId: entry.source.cardId,
          },
          {
            ...definition,
            effects: [
              {
                ...must(definition.effects[0], "noSourceRequired effect"),
                effect: {
                  type: "choice",
                  chooser: "self",
                  options: [],
                  min: 0,
                  max: 0,
                },
              },
            ],
          },
          "def-no-source-required-unsupported-primitive",
        );
        return entry;
      },
    },
  ];

  for (const policy of sourcePresencePolicies) {
    for (const testCase of cases) {
      const state = createActiveState();
      state.effectQueue = [
        {
          ...testCase.setup(state),
          sourcePresencePolicy: policy,
        },
      ];
      const before = structuredClone(state);
      const beforeHash = hashCanonicalStateValue(state);
      const assertionLabel = `${policy}: ${testCase.name}`;

      const first = processEffectRuntime(state);
      const second = processEffectRuntime(structuredClone(before));

      assert.deepEqual(first.events, [], assertionLabel);
      assert.deepEqual(first.errors, [
        {
          type: "effectRuntimeError",
          effectId: "unsupported-effect-queue",
          details: {
            reason: "unsupported-pending-runtime-work",
            kind: "effectQueue",
            count: 1,
          },
        },
      ]);
      assert.deepEqual(first.events, second.events, assertionLabel);
      assert.deepEqual(first.errors, second.errors, assertionLabel);
      assert.deepEqual(first.state, before, assertionLabel);
      assert.equal(hashCanonicalStateValue(first.state), beforeHash);
    }
  }
});

test("queued resolution keeps event journal and state hash stable for identical input", () => {
  const run = () => {
    const state = createActiveState();
    state.effectQueue = [queueDrawForP1()];
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
  assert.equal(first.stateHash, second.stateHash);
});
