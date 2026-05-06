import assert from "node:assert/strict";
import { test } from "vitest";

import type {
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
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import {
  detectPendingRuntimeWork,
  executeNoChoiceEffectPrimitive,
  type EffectDefinitionLookupFailureReason,
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "./effect-runtime.js";

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

test("effect queue has deterministic precedence over deferred triggers", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());
  state.deferredTriggers.push(deferredTrigger());

  const result = processEffectRuntime(state);

  assert.ok(result.errors !== undefined);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.errors[0], {
    type: "effectRuntimeError",
    effectId: "unsupported-effect-queue",
    details: {
      reason: "unsupported-pending-runtime-work",
      kind: "effectQueue",
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
  const before = structuredClone(state);

  const result = executeNoChoiceEffectPrimitive(state, queueDrawForP1(), {
    type: "drawUpTo",
    count: 1,
    player: "self",
  } as never);

  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.equal(
    must(result.errors[0], "runtime error").type,
    "effectRuntimeError",
  );
  assert.deepEqual(result.state, before);
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
