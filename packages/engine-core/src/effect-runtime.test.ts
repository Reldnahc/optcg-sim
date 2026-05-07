import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardSnapshot,
  CardId,
  CardSupportStatus,
  DeferredTriggerBucket,
  DecisionId,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  MatchCardManifest,
  ResolvedCard,
  InstanceId,
  PlayerId,
  PendingDecision,
  QueueEntryId,
  SourcePresencePolicy,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { applyAction } from "./index.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toEngineEventId,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import {
  detectPendingRuntimeWork,
  executeNoChoiceEffectPrimitive,
  isSupportedNoChoiceOnPlayDrawEffect,
  type EffectDefinitionLookupFailureReason,
  type OnPlayTriggerQueueingFailureReason,
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "./effect-runtime.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toCardId = (value: string): CardId => value as CardId;
const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;
const toEffectDefinition = (value: EffectDefinition): EffectDefinition => value;

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

const deferredTrigger = (): DeferredTriggerBucket => ({
  timingWindowId: toTimingWindowId("hidden-trigger-window"),
  generation: 2,
  triggerIds: ["hidden-life-card", "hidden-instance-1"],
  releasePolicy: "afterCurrentProcess",
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

const withPendingDecision = (playerId: PlayerId = p2): PendingDecision => ({
  id: toDecisionId("existing-decision"),
  type: "mulligan" as const,
  playerId,
  prompt: "Existing decision",
  causedBy: { type: "ruleProcess" as const, name: "existing-decision" },
  visibility: { type: "private" as const, playerId },
  options: ["keep", "mulligan"],
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

test("pending runtime work detector returns only content-agnostic kind and count", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());

  assert.deepEqual(detectPendingRuntimeWork(state), {
    kind: "effectQueue",
    count: 1,
  });
});

test("non-empty effect queue fails closed with deterministic unsupported details", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());

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
});

test("non-empty deferred triggers fail closed with deterministic unsupported details", () => {
  const state = createActiveState();
  state.deferredTriggers.push(deferredTrigger());

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-deferred-triggers",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "deferredTriggers",
        count: 1,
      },
    },
  ]);
});

test("deferred trigger sentinel takes precedence when both queue and deferred work exist", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());
  state.deferredTriggers.push(deferredTrigger());

  const result = processEffectRuntime(state);

  assert.ok(result.errors !== undefined);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.errors[0], {
    type: "effectRuntimeError",
    effectId: "unsupported-deferred-triggers",
    details: {
      reason: "unsupported-pending-runtime-work",
      kind: "deferredTriggers",
      count: 1,
    },
  });
});

test("unsupported effect queue diagnostics do not expose hidden card contents", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect(toCardId("hidden-life-card")));

  const serialized = JSON.stringify(processEffectRuntime(state).errors);

  assert.ok(!serialized.includes("hidden-life-card"));
  assert.ok(!serialized.includes("hidden-instance-1"));
  assert.ok(!serialized.includes("hidden-effect-block"));
});

test("unsupported deferred trigger diagnostics do not expose hidden card contents", () => {
  const state = createActiveState();
  state.deferredTriggers.push(deferredTrigger());

  const serialized = JSON.stringify(processEffectRuntime(state).errors);

  assert.ok(!serialized.includes("hidden-life-card"));
  assert.ok(!serialized.includes("hidden-instance-1"));
});

test("effect queue failure does not mutate state or replace an existing pending decision", () => {
  const state = createActiveState();
  const pendingDecision = withPendingDecision();
  state.pendingDecision = pendingDecision;
  state.effectQueue.push(queuedEffect());
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.equal(result.state, state);
  assert.equal(result.state.pendingDecision, pendingDecision);
  assert.equal(result.state.seq, before.seq);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
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

test("deferred trigger failure does not mutate state or replace an existing pending decision", () => {
  const state = createActiveState();
  const pendingDecision = withPendingDecision();
  state.pendingDecision = pendingDecision;
  state.deferredTriggers.push(deferredTrigger());
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.equal(result.state, state);
  assert.equal(result.state.pendingDecision, pendingDecision);
  assert.equal(result.state.seq, before.seq);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
});

test("supported queued draw with non-empty deferred triggers fails closed as deferred trigger sentinel", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-mixed-queue-deferred",
  );
  const queued = processEffectRuntime(state);
  queued.state.deferredTriggers.push(deferredTrigger());
  const before = structuredClone(queued.state);

  const result = processEffectRuntime(queued.state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-deferred-triggers",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "deferredTriggers",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("empty processing preserves an existing pending decision without replacing it", () => {
  const state = createActiveState();
  const pendingDecision = withPendingDecision();
  state.pendingDecision = pendingDecision;

  const result = processEffectRuntime(state);

  assert.equal(result.state, state);
  assert.equal(result.state.pendingDecision, pendingDecision);
  assert.deepEqual(result.decisions, [pendingDecision]);
});

const createManifest = (
  card: ResolvedCard,
  definitionById?: Record<string, EffectDefinition>,
): MatchCardManifest => {
  const manifest: MatchCardManifest = {
    manifestHash: "manifest-effect-runtime",
    source: "manual-test",
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "0.1.0",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    cards: { [card.cardId]: card },
    createdAt: "2026-05-05T00:00:00.000Z",
  };
  if (definitionById !== undefined) {
    manifest.effectDefinitions = definitionById;
  }
  return manifest;
};

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

const appendAttackDeclaredEvent = (
  state: ReturnType<typeof createActiveState>,
  attacker: CardInstance,
) => {
  const target = must(must(state.players[p2], "p2").leader, "p2 leader");
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:attackDeclared`),
    seq: state.eventJournal.length + 1,
    type: "attackDeclared" as const,
    payload: {
      attacker: {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: attacker.zone.playerId,
        zone: attacker.zone,
      },
      target: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      },
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

const setupOnOpponentAttackDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effectDefinitionId = "def-on-opponent-attack",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "on-opponent-attack-rules",
      sourceTextHash: "on-opponent-attack-source",
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
        trigger: { type: "onOpponentAttack" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
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

const setupWhenAttackingDefinition = (
  state: ReturnType<typeof createActiveState>,
  attacker: CardInstance,
  effectDefinitionId = "def-when-attacking",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "when-attacking-rules",
      sourceTextHash: "when-attacking-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    attacker.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "whenAttacking" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[attacker.cardId] = supportCard;
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

const attackQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  attacker: CardInstance;
  definition: EffectDefinition;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "hand source");
  const attacker = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  const definition = setupWhenAttackingDefinition(state, attacker);
  appendAttackDeclaredEvent(state, attacker);
  return { state, attacker, definition };
};

const opponentAttackQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  attacker: CardInstance;
  target: CardInstance;
  definition: EffectDefinition;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  const definition = setupOnOpponentAttackDefinition(state, target);
  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
      zone: attacker.zone,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    step: "counter",
    damageCount: 1,
  };
  appendAttackDeclaredEvent(state, attacker);
  return { state, attacker, target, definition };
};

const expectLookupFailure = (
  result: ReturnType<typeof resolveImplementedDslEffectDefinition>,
  reason: EffectDefinitionLookupFailureReason,
  supportStatus: CardSupportStatus,
): void => {
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.type, "effectRuntimeError");
  assert.equal(result.error.effectId, "effect-definition-lookup");
  assert.deepEqual(result.error.details, {
    reason,
    supportStatus,
  });
};

const expectOnPlayQueueingFailure = (
  result: ReturnType<typeof processEffectRuntime>,
  reason: OnPlayTriggerQueueingFailureReason,
): void => {
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-play-trigger-queueing",
      details: { reason },
    },
  ]);
};

test("resolves implemented-dsl support to a reviewed On Play draw definition", () => {
  const cardId = toCardId("OP01-015");
  const card = resolvedCard({
    cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "op01-015.v2026-01-16.reviewed.on-play-draw-1",
      rulesVersion: "2026-01-16",
      sourceTextHash: "sha256:test-op01-015",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(cardId, card.support);
  const effectDefinitionId =
    card.support.effectDefinitionId ?? "missing-effect-definition-id";
  const manifest = createManifest(card, { [effectDefinitionId]: definition });

  const result = resolveImplementedDslEffectDefinition(card, manifest);

  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.definition, definition);
});

test("fails when implemented-dsl support omits effect definition id", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-016"),
    category: "character",
    support: { status: "implemented-dsl" },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card),
  );
  expectLookupFailure(
    result,
    "missing-effect-definition-id",
    "implemented-dsl",
  );
});

test("fails when manifest omits the effect definition registry", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-017"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "missing-registry",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card),
  );
  expectLookupFailure(result, "missing-effect-definition", "implemented-dsl");
});

test("fails when effect definition id is missing from manifest registry", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-032"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "missing-definition",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(result, "missing-effect-definition", "implemented-dsl");
});

test("fails when definition card id mismatches support card id", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-018"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-mismatch-card",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(toCardId("OP01-999"), card.support),
    cardId: toCardId("OP01-999"),
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-mismatch-card": definition }),
  );
  expectLookupFailure(result, "definition-card-id-mismatch", "implemented-dsl");
});

test("fails when definition implementation status mismatches support status", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-019"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-status-mismatch",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    implementationStatus: "unsupported",
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-status-mismatch": definition }),
  );
  expectLookupFailure(result, "definition-status-mismatch", "implemented-dsl");
});

test("fails when support cardDataVersion mismatches manifest cardDataVersion", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-020"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-carddata",
      cardDataVersion: "other-version",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(card.cardId, card.support);
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-carddata": definition }),
  );
  expectLookupFailure(
    result,
    "support-card-data-version-mismatch",
    "implemented-dsl",
  );
});

test("fails when support rulesVersion mismatches definition metadata rulesVersion", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-021"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-rules-version",
      rulesVersion: "support-rules",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      rulesVersion: "definition-rules",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-rules-version": definition }),
  );
  expectLookupFailure(result, "rules-version-mismatch", "implemented-dsl");
});

test("fails when support sourceTextHash mismatches definition metadata sourceTextHash", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-022"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-source-hash",
      sourceTextHash: "support-hash",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      sourceTextHash: "definition-hash",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-source-hash": definition }),
  );
  expectLookupFailure(result, "source-text-hash-mismatch", "implemented-dsl");
});

test("fails when definition effectDefinitionsVersion mismatches manifest version", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-023"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-effects-version",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      effectDefinitionsVersion: "other-version",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-effects-version": definition }),
  );
  expectLookupFailure(result, "definition-version-mismatch", "implemented-dsl");
});

test("fails when support metadata is untested", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-024"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-untested-support",
      tested: false,
    },
  });
  const definition = reviewedOnPlayDrawDefinition(card.cardId, card.support);
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-untested-support": definition }),
  );
  expectLookupFailure(result, "untested-support-metadata", "implemented-dsl");
});

test("fails when definition metadata is untested", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-025"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-untested-definition",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      ...reviewedOnPlayDrawDefinition(card.cardId, card.support).metadata,
      tested: false,
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-untested-definition": definition }),
  );
  expectLookupFailure(
    result,
    "untested-definition-metadata",
    "implemented-dsl",
  );
});

test("fails when definition metadata is unreviewed", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-026"),
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-unreviewed",
    },
  });
  const definition = toEffectDefinition({
    ...reviewedOnPlayDrawDefinition(card.cardId, card.support),
    metadata: {
      sourceTextHash: card.support.sourceTextHash,
      rulesVersion: card.support.rulesVersion,
      effectDefinitionsVersion: "0.1.0",
      tested: true,
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, { "def-unreviewed": definition }),
  );
  expectLookupFailure(
    result,
    "unreviewed-definition-metadata",
    "implemented-dsl",
  );
});

test("fails for vanilla cards when support unexpectedly includes an effect definition id", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-027"),
    category: "character",
    support: {
      status: "vanilla-confirmed",
      effectDefinitionId: "unexpected-effect-id",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "unexpected-vanilla-effect-definition",
    "vanilla-confirmed",
  );
});

test("fails for vanilla cards without DSL support metadata", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-033"),
    category: "character",
    support: {
      status: "vanilla-confirmed",
    },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "unsupported-support-status",
    "vanilla-confirmed",
  );
});

test("fails for unsupported cards", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-028"),
    category: "character",
    support: { status: "unsupported" },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(result, "unsupported-support-status", "unsupported");
});

test("fails for banned-in-simulator cards", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-029"),
    category: "character",
    support: { status: "banned-in-simulator" },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "unsupported-support-status",
    "banned-in-simulator",
  );
});

test("fails for implemented-custom cards", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-030"),
    category: "character",
    support: { status: "implemented-custom", customHandlerIds: ["handler-1"] },
  });
  const result = resolveImplementedDslEffectDefinition(
    card,
    createManifest(card, {}),
  );
  expectLookupFailure(
    result,
    "implemented-custom-status",
    "implemented-custom",
  );
});

test("lookup helper does not mutate manifest or card inputs", () => {
  const card = resolvedCard({
    cardId: toCardId("OP01-031"),
    category: "character",
    support: { status: "implemented-dsl", effectDefinitionId: "def-immutable" },
  });
  const definition = reviewedOnPlayDrawDefinition(card.cardId, card.support);
  const manifest = createManifest(card, { "def-immutable": definition });
  const beforeManifest = structuredClone(manifest);
  const beforeCard = structuredClone(card);

  resolveImplementedDslEffectDefinition(card, manifest);

  assert.deepEqual(manifest, beforeManifest);
  assert.deepEqual(card, beforeCard);
});

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

test("attackDeclared source presence failure rejects When Attacking queueing without mutation or events", () => {
  const { state, attacker } = attackQueueingState();
  const player = must(state.players[p1], "p1");
  player.characters = player.characters.filter(
    (character) => character.instanceId !== attacker.instanceId,
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("attackDeclared stale attacker zone rejects When Attacking queueing without mutation or events", () => {
  const { state, attacker } = attackQueueingState();
  const event = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = event.payload as {
    attacker: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
    target: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
  };
  event.payload = {
    ...payload,
    attacker: {
      ...payload.attacker,
      zone: { ...attacker.zone, index: (attacker.zone.index ?? 0) + 1 },
    },
  };
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("attackDeclared stale target zone rejects On Your Opponent's Attack queueing without mutation or events", () => {
  const { state, target } = opponentAttackQueueingState();
  const event = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = event.payload as {
    attacker: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
    target: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
  };
  event.payload = {
    ...payload,
    target: {
      ...payload.target,
      zone: { ...target.zone, index: (target.zone.index ?? 0) + 1 },
    },
  };
  const before = structuredClone(state);

  const result = processDefenderOpponentAttackTiming(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-opponent-attack-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("missing, stale, or mismatched source presence fails closed without queue mutation or events", () => {
  const scenarios = ["missing", "stale", "mismatch"] as const;
  for (const scenario of scenarios) {
    const { state, played } = queueingState();
    const baseCard = resolvedCard({
      cardId: played.cardId,
      category: "character",
    });
    setupOnPlayDefinition(
      state,
      played,
      reviewedOnPlayDrawDefinition(played.cardId, baseCard.support),
      `def-${scenario}`,
    );
    if (scenario === "missing") {
      const player = must(state.players[p1], "p1");
      player.characters = [];
    } else if (scenario === "stale") {
      const player = must(state.players[p1], "p1");
      const c0 = must(player.characters[0], "c0");
      player.characters = [
        { ...c0, instanceId: toInstanceId("different-instance") },
      ];
    } else {
      const event = must(
        state.eventJournal[state.eventJournal.length - 1],
        "cardPlayed",
      );
      event.payload = {
        ...(event.payload as object),
        cardId: toCardId("OP99-999"),
      };
    }
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    expectOnPlayQueueingFailure(result, "source-presence-failed");
    assert.deepEqual(result.state.effectQueue, before.effectQueue);
    assert.deepEqual(result.state.eventJournal, before.eventJournal);
  }
});

test("unsupported effect metadata and shapes fail closed without partial mutation or events", () => {
  const cases: Array<{
    name: string;
    expectedReason: OnPlayTriggerQueueingFailureReason;
    definition: (d: EffectDefinition) => EffectDefinition;
  }> = [
    {
      name: "optional",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [{ ...must(d.effects[0], "onPlay effect"), optional: true }],
      }),
    },
    {
      name: "cost",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [
          {
            ...must(d.effects[0], "onPlay effect"),
            cost: { type: "restSelf" },
          },
        ],
      }),
    },
    {
      name: "condition",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [
          {
            ...must(d.effects[0], "onPlay effect"),
            condition: { type: "yourTurn" },
          },
        ],
      }),
    },
    {
      name: "unsupported-shape",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [
          {
            ...must(d.effects[0], "onPlay effect"),
            effect: {
              type: "choice",
              chooser: "self",
              options: [],
              min: 0,
              max: 0,
            },
          },
        ],
      }),
    },
    {
      name: "multiple-on-play",
      expectedReason: "multiple-on-play-effects",
      definition: (d) => {
        const first = must(d.effects[0], "onPlay effect");
        return {
          ...d,
          effects: [
            first,
            { ...first, id: "OP01-015:auto-on-play-2" as EffectId },
          ],
        };
      },
    },
  ];

  for (const testCase of cases) {
    const { state, played } = queueingState();
    const baseCard = resolvedCard({
      cardId: played.cardId,
      category: "character",
    });
    const baseDefinition = reviewedOnPlayDrawDefinition(
      played.cardId,
      baseCard.support,
    );
    setupOnPlayDefinition(
      state,
      played,
      testCase.definition(baseDefinition),
      `def-${testCase.name}`,
    );
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    expectOnPlayQueueingFailure(result, testCase.expectedReason);
    assert.deepEqual(
      result.state.effectQueue,
      before.effectQueue,
      testCase.name,
    );
    assert.deepEqual(
      result.state.eventJournal,
      before.eventJournal,
      testCase.name,
    );
  }
});

test("unreviewed On Play definition metadata fails closed without queue mutation or events", () => {
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
      metadata: {
        sourceTextHash: definition.metadata.sourceTextHash,
        rulesVersion: definition.metadata.rulesVersion,
        effectDefinitionsVersion: definition.metadata.effectDefinitionsVersion,
        tested: true,
      },
    },
    "def-unreviewed-on-play",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "effect-definition-lookup",
      details: {
        reason: "unreviewed-definition-metadata",
        supportStatus: "implemented-dsl",
      },
    },
  ]);
  assert.deepEqual(result.state.effectQueue, before.effectQueue);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
});

test("public no-choice draw trigger support remains limited to same-zone source presence", () => {
  const baseCard = resolvedCard({
    cardId: toCardId("OP01-015"),
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    toCardId("OP01-015"),
    baseCard.support,
  );
  const sameZoneEffect = must(definition.effects[0], "same-zone effect");
  const lkiEffect: EffectDefinition["effects"][number] = {
    ...sameZoneEffect,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
  };

  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(sameZoneEffect), true);
  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(lkiEffect), false);
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

test("queued source snapshot preserves CardInstance owner/controller", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.hand[0], "p2 hand source");
  const placed = withCardInZone({
    state,
    playerId: p2,
    card: source,
    zone: "characterArea",
  });
  const controlledByP2OwnedByP1: CardInstance = {
    ...placed,
    owner: p1,
    controller: p2,
  };
  p2State.characters = [controlledByP2OwnedByP1];
  appendCardPlayedEvent(state, controlledByP2OwnedByP1, "character");

  const supportCard = resolvedCard({
    cardId: controlledByP2OwnedByP1.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    controlledByP2OwnedByP1,
    reviewedOnPlayDrawDefinition(
      controlledByP2OwnedByP1.cardId,
      supportCard.support,
    ),
    "def-snapshot-owner-controller",
  );

  const result = processEffectRuntime(state);
  const queued = must(result.state.effectQueue[0], "queued entry");

  assert.equal(result.errors, undefined);
  assert.equal(queued.sourceSnapshot.ownerId, p1);
  assert.equal(queued.sourceSnapshot.controllerId, p2);
});

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
