import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DecisionId,
  EffectQueueEntry,
  GameState,
  SelectTargetsDecision,
} from "@optcg/types";

import { createActiveState, p1, toStateSeq } from "../action-test-fixtures.js";
import {
  clearPendingDecision,
  effectQueueEntryForDecision,
} from "./continuation-gate.js";

const queueEntry = (): EffectQueueEntry => ({
  id: "queue-entry:1" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId: "timing-window:1" as EffectQueueEntry["timingWindowId"],
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
  effectBlockId: "effect:1" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "test" },
});

const stateWithDecision = (): GameState => {
  const state = createActiveState();
  const entry = queueEntry();
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: "decision:1" as DecisionId,
    type: "selectTargets",
    playerId: p1,
    prompt: "Select target.",
    candidates: [],
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "leaderArea",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
    visibility: { type: "private", playerId: p1 },
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
  } satisfies SelectTargetsDecision;
  return state;
};

test("effectQueueEntryForDecision returns the live queue entry for effect-caused decisions", () => {
  const state = stateWithDecision();
  const decision = state.pendingDecision;
  assert.equal(decision?.type, "selectTargets");

  const found = effectQueueEntryForDecision(state, decision);

  assert.ok(found.ok);
  assert.equal(found.entry.id, state.effectQueue[0]?.id);
});

test("effectQueueEntryForDecision rejects stale effect-caused decisions", () => {
  const state = stateWithDecision();
  const decision = state.pendingDecision;
  assert.equal(decision?.type, "selectTargets");
  state.effectQueue = [];

  const found = effectQueueEntryForDecision(state, decision);

  assert.ok(!found.ok);
  assert.equal(found.reason, "stale-effect-decision");
});

test("clearPendingDecision removes the pending decision without changing queue state", () => {
  const state = stateWithDecision();
  const cleared = clearPendingDecision(state);

  assert.equal(cleared.pendingDecision, undefined);
  assert.deepEqual(cleared.effectQueue, state.effectQueue);
});
