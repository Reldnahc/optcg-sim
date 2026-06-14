import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  p1,
  resolvedCard,
  toStateSeq,
} from "../../action-test-fixtures.js";
import {
  appendAdmittedTriggerEntries,
  canAdmitTriggerQueueEntry,
} from "./admission.js";

const entry = (id: string, effectBlockId = "effect:1"): EffectQueueEntry => ({
  id: `queue-entry:${id}` as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId: `timing-window:${id}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: p1,
  source: {
    instanceId: "source:1" as EffectQueueEntry["source"]["instanceId"],
    cardId: "CARD-001" as EffectQueueEntry["source"]["cardId"],
    playerId: p1,
    zone: { zone: "leaderArea", playerId: p1 },
  },
  sourceSnapshot: {
    instanceId: "source:1" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "CARD-001" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "leaderArea", playerId: p1 },
    category: "leader",
    colors: [],
    keywords: [],
  },
  effectBlockId: effectBlockId as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "test" },
});

const effect = (oncePerTurn = false): EffectDefinition["effects"][number] => ({
  id: "effect:1" as EffectDefinition["effects"][number]["id"],
  category: "auto",
  trigger: { type: "onPlay" },
  sourcePresencePolicy: "mustRemainInSameZone",
  ...(oncePerTurn ? { oncePerTurn: true } : {}),
  effect: { type: "draw", count: 1, player: "self" },
});

test("trigger queue admission rejects entries when runtime work is pending", () => {
  const state = createActiveState();
  state.effectQueue = [entry("existing")];

  assert.equal(
    canAdmitTriggerQueueEntry(state, entry("new"), effect()).ok,
    false,
  );
});

test("trigger queue admission rejects already-used once-per-turn entries", () => {
  const state = createActiveState();
  const candidate = entry("new");
  state.oncePerTurn = [
    {
      cardInstanceId: candidate.source.instanceId,
      effectId: candidate.effectBlockId,
      turnNumber: state.turn.globalTurn,
      usedAtStateSeq: state.seq,
    },
  ];

  assert.equal(
    canAdmitTriggerQueueEntry(state, candidate, effect(true)).ok,
    false,
  );
});

test("append admitted trigger entries appends queue and effectQueued events together", () => {
  const state = createActiveState();
  const candidate = entry("new");
  const resolved = resolvedCard({
    cardId: candidate.source.cardId,
    category: "leader",
  });

  const result = appendAdmittedTriggerEntries(state, [
    { entry: candidate, effectBlock: effect(), resolved },
  ]);

  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, "effectQueued");
});

test("append admitted trigger entries filters same-batch once-per-turn duplicates", () => {
  const state = createActiveState();
  const first = entry("first");
  const second = entry("second");
  const resolved = resolvedCard({
    cardId: first.source.cardId,
    category: "leader",
  });

  assert.equal(canAdmitTriggerQueueEntry(state, first, effect(true)).ok, true);
  assert.equal(canAdmitTriggerQueueEntry(state, second, effect(true)).ok, true);

  const result = appendAdmittedTriggerEntries(state, [
    { entry: first, effectBlock: effect(true), resolved },
    { entry: second, effectBlock: effect(true), resolved },
  ]);

  assert.deepEqual(
    result.state.effectQueue.map((queued) => queued.id),
    [first.id],
  );
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, "effectQueued");
});
