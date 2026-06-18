import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  DeferredTriggerBucket,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PendingDecision,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "../effect-runtime.js";

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

const deferredTrigger = (): DeferredTriggerBucket => ({
  timingWindowId: toTimingWindowId("hidden-trigger-window"),
  generation: 2,
  triggerIds: ["hidden-life-card", "hidden-instance-1"],
  releasePolicy: "afterCurrentProcess",
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

const queueingState = () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const handCard = must(player.hand[0], "hand card");
  const played = {
    ...handCard,
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    attachedDon: [],
    state: "active" as const,
    turnPlayed: state.turn.globalTurn,
  };
  state.players[p1] = {
    ...player,
    hand: player.hand.slice(1),
    characters: [played],
  };
  return { state, played };
};

const setupOnPlayDefinition = (
  state: ReturnType<typeof createActiveState>,
  played: { cardId: CardId },
  definition: ReturnType<typeof reviewedOnPlayDrawDefinition>,
  definitionId: string,
) => {
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    [definitionId]: definition,
  };
  state.cardManifest.cards[played.cardId] = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      rulesVersion: "0.1.0",
      sourceTextHash: "source-hash",
    },
  });
};

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
        gate: "queue-effect-definition",
        queueReason: "missing-card-definition",
      },
    },
  ]);
});

test("unsupported queue errors include effect definition context when card lookup fails", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());

  const result = processEffectRuntime(state);
  const firstError = result.errors?.[0] as
    | {
        type?: string;
        effectId?: string;
        details?: { gate?: string };
      }
    | undefined;

  assert.ok(firstError !== undefined);
  assert.equal(firstError.type, "effectRuntimeError");
  assert.equal(firstError.effectId, "unsupported-effect-queue");
  assert.equal(firstError.details?.gate, "queue-effect-definition");
  assert.equal(
    JSON.stringify(result.errors).includes("hidden-effect-block"),
    false,
  );
});

test("unsupported queue errors distinguish missing effect block", () => {
  const { state, played } = queueingState();
  const definitionId = "def-missing-effect-block";
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
      rulesVersion: "0.1.0",
      sourceTextHash: "source-hash",
    },
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    definitionId,
  );
  state.effectQueue = [
    {
      ...queuedEffect(played.cardId),
      effectBlockId: toEffectId("missing-effect-block"),
      source: {
        ...queuedEffect(played.cardId).source,
        zone: played.zone,
      },
      sourceSnapshot: {
        ...queuedEffect(played.cardId).sourceSnapshot,
        zone: played.zone,
        category: "character",
      },
      sourcePresencePolicy: "resolveFromLastKnownInformation",
    },
  ];

  const result = processEffectRuntime(state);
  const firstError = result.errors?.[0] as
    | {
        details?: {
          gate?: string;
          queueReason?: string;
        };
      }
    | undefined;

  assert.ok(firstError !== undefined);
  assert.ok(firstError.details !== undefined);
  assert.equal(firstError.details.gate, "queue-effect-definition");
  assert.equal(firstError.details.queueReason, "missing-effect-block");
});

test("unsupported queue diagnostics expose public queue identity", () => {
  const state = createActiveState();
  const publicEntry: EffectQueueEntry = {
    ...queuedEffect(),
    id: toQueueEntryId("public-queue-entry"),
    source: {
      ...queuedEffect().source,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
    },
    sourceSnapshot: {
      ...queuedEffect().sourceSnapshot,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
    },
    effectBlockId: toEffectId("public-effect-block"),
  };
  state.effectQueue.push(publicEntry);

  const result = processEffectRuntime(state);
  const firstError = result.errors?.[0] as
    | {
        details?: {
          queueEntryId?: string;
          effectId?: string;
        };
      }
    | undefined;

  assert.ok(firstError !== undefined);
  assert.ok(firstError.details !== undefined);
  assert.equal(firstError.details.queueEntryId, "public-queue-entry");
  assert.equal(firstError.details.effectId, "public-effect-block");
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

test.each([
  {
    name: "life",
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
  },
  {
    name: "hand",
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  },
  {
    name: "deck",
    zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
  },
] as const)(
  "unsupported queue diagnostics redact $name queue identity",
  ({ zone }) => {
    const state = createActiveState();
    const hiddenEntry = {
      ...queuedEffect(),
      source: { ...queuedEffect().source, zone },
      effectBlockId: "hidden-effect-block" as ReturnType<
        typeof queuedEffect
      >["effectBlockId"],
    };
    state.effectQueue.push(hiddenEntry);

    const result = processEffectRuntime(state);
    const serialized = JSON.stringify(result.errors);
    const firstError = result.errors?.[0] as { effectId?: string } | undefined;

    assert.ok(firstError !== undefined);
    assert.equal(firstError.effectId, "unsupported-effect-queue");
    assert.equal(serialized.includes("hidden-effect-block"), false);
    assert.equal(serialized.includes("queueEntryId"), false);
  },
);

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
