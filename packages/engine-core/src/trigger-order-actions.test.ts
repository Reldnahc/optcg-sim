import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DecisionResponse,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import { createActiveState, p1, p2 } from "./action-test-fixtures.js";
import { hashCanonicalStateValue } from "./state/canonical-state.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const queued = (
  id: string,
  timingWindowId: string,
  generation: number,
  controllerId: PlayerId,
  orderingGroup: "turnPlayer" | "nonTurnPlayer",
): EffectQueueEntry => ({
  id: toQueueEntryId(id),
  state: "pending",
  timingWindowId: toTimingWindowId(timingWindowId),
  generation,
  controllerId,
  source: {
    instanceId: toInstanceId(`src-${id}`),
    cardId: "OP01-001" as never,
    playerId: controllerId,
    zone: {
      zone: "characterArea",
      playerId: controllerId,
      slot: "character",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId: toInstanceId(`src-${id}`),
    cardId: "OP01-001" as never,
    ownerId: controllerId,
    controllerId,
    zone: {
      zone: "characterArea",
      playerId: controllerId,
      slot: "character",
      index: 0,
    },
    category: "character",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId: toEffectId(`eff-${id}`),
  orderingGroup,
  createdAtEventSeq: 10,
  queuedAtStateSeq: toStateSeq(5),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "test" },
});

const setupChoiceState = () => {
  const state = createActiveState();
  state.effectQueue = [
    queued("queue-a", "window-a", 0, p1, "turnPlayer"),
    queued("queue-b", "window-a", 0, p1, "turnPlayer"),
    queued("queue-c", "window-a", 0, p2, "nonTurnPlayer"),
    queued("queue-d", "window-b", 0, p1, "turnPlayer"),
  ];
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose next trigger to resolve.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [toQueueEntryId("queue-a"), toQueueEntryId("queue-b")],
    constraints: { mustUseAll: true },
  };
  return state;
};

test("valid orderedIds response chooses only the next trigger from the selected trigger group", () => {
  const state = setupChoiceState();
  const before = structuredClone(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:choose-trigger-order"),
    response: {
      type: "orderedIds",
      ids: [toQueueEntryId("queue-b")],
    },
  });

  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 4,
      },
    },
  ]);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.id),
    [
      toQueueEntryId("queue-a"),
      toQueueEntryId("queue-b"),
      toQueueEntryId("queue-c"),
      toQueueEntryId("queue-d"),
    ],
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved"],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: toDecisionId("decision:choose-trigger-order"),
    decisionType: "chooseTriggerOrder",
    playerId: p1,
    responseType: "orderedIds",
  });
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "ruleProcessingChecked"),
    false,
  );
  assert.deepEqual(state, before);
});

test("invalid chooseTriggerOrder responses fail closed with no mutation or hash change", () => {
  const attempts = [
    {
      response: {
        type: "payment",
        optionId: "restDon",
      } satisfies DecisionResponse,
      reason: "Response type must be orderedIds for chooseTriggerOrder.",
    },
    {
      response: {
        type: "orderedIds",
        ids: [
          toQueueEntryId("queue-a"),
          toQueueEntryId("queue-a"),
          toQueueEntryId("queue-b"),
        ],
      } satisfies DecisionResponse,
      reason: "orderedIds must choose exactly one triggerId.",
    },
    {
      response: {
        type: "orderedIds",
        ids: [],
      } satisfies DecisionResponse,
      reason: "orderedIds must choose exactly one triggerId.",
    },
    {
      response: {
        type: "orderedIds",
        ids: [
          toQueueEntryId("queue-a"),
          toQueueEntryId("queue-b"),
          toQueueEntryId("queue-c"),
        ],
      } satisfies DecisionResponse,
      reason: "orderedIds must choose exactly one triggerId.",
    },
    {
      response: {
        type: "orderedIds",
        ids: [toQueueEntryId("queue-a"), toQueueEntryId("queue-z")],
      } satisfies DecisionResponse,
      reason: "orderedIds must choose exactly one triggerId.",
    },
    {
      response: {
        type: "orderedIds",
        ids: [toQueueEntryId("queue-z")],
      } satisfies DecisionResponse,
      reason: "orderedIds must choose exactly one triggerId.",
    },
  ];

  for (const attempt of attempts) {
    const state = setupChoiceState();
    const before = structuredClone(state);
    const beforeHash = hashCanonicalStateValue(state);
    const result = applyAction(state, {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:choose-trigger-order"),
      response: attempt.response,
    });

    assert.deepEqual(result.errors, [
      { type: "invalidDecisionResponse", reason: attempt.reason },
    ]);
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.state, before);
    assert.equal(result.stateHash, beforeHash);
  }
});

test("stale chooseTriggerOrder ids absent from current queue fail closed without mutation", () => {
  const state = setupChoiceState();
  state.effectQueue = state.effectQueue.filter(
    (entry) => entry.id !== toQueueEntryId("queue-b"),
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:choose-trigger-order"),
    response: {
      type: "orderedIds",
      ids: [toQueueEntryId("queue-b")],
    },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason:
        "chooseTriggerOrder triggerIds are stale for current effectQueue.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test("stale chooseTriggerOrder group membership drift fails closed without mutation", () => {
  const state = setupChoiceState();
  state.effectQueue.splice(
    2,
    0,
    queued("queue-x", "window-a", 0, p1, "turnPlayer"),
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:choose-trigger-order"),
    response: {
      type: "orderedIds",
      ids: [toQueueEntryId("queue-b")],
    },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason:
        "chooseTriggerOrder triggerIds are stale for current effectQueue.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});
