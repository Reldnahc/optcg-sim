import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  DeferredTriggerBucket,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  PendingDecision,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { createActiveState, p1, p2 } from "./action-test-fixtures.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "./effect-runtime.js";

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
