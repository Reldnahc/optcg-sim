import assert from "node:assert/strict";
import { test } from "vitest";

import { createInitialState } from "./initial-state.js";
import { startMulliganFlow } from "./mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  createInput,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { setupMainPlayState } from "./play-card/test-fixtures.js";
import {
  makeMainPhaseLegalActionState,
  queuedEffect,
  toTimingWindowId,
} from "./action-dispatcher-test-support.js";

test("getLegalActions suppresses ordinary main-phase actions while effect queue work is pending", () => {
  const state = makeMainPhaseLegalActionState();
  state.effectQueue.push(queuedEffect("queue-a"));

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions suppresses ordinary main-phase actions while deferred triggers are pending", () => {
  const state = makeMainPhaseLegalActionState();
  state.deferredTriggers.push({
    timingWindowId: toTimingWindowId("hidden-window-a"),
    generation: 1,
    triggerIds: ["hidden-trigger-a"],
    releasePolicy: "afterCurrentProcess",
  });

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions keeps pending-decision responses while runtime work is pending", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  opened.state.effectQueue.push(queuedEffect("pending-decision"));

  const legal = getLegalActions(opened.state, p1);

  assert.equal(
    legal.some((action) => action.type === "respondToDecision"),
    true,
  );
  assert.equal(
    legal.some((action) => action.type === "endMainPhase"),
    false,
  );
  assert.equal(
    legal.some((action) => action.type === "attachDon"),
    false,
  );
  assert.equal(
    legal.some((action) => action.type === "playCard"),
    false,
  );
  assert.equal(
    legal.some((action) => action.type === "declareAttack"),
    false,
  );
});

test("getLegalActions does not mutate state or replace pending decisions while runtime work is pending", () => {
  const state = makeMainPhaseLegalActionState();
  const pendingDecision = startMulliganFlow(createInitialState(createInput()))
    .state.pendingDecision;
  assert.ok(pendingDecision !== undefined);
  state.pendingDecision = pendingDecision;
  state.effectQueue.push(queuedEffect("mutation"));
  const before = structuredClone(state);

  getLegalActions(state, p1);

  assert.equal(state.pendingDecision, pendingDecision);
  assert.deepEqual(state, before);
});

test("getLegalActions output is content-agnostic for hidden runtime work", () => {
  const withFirstQueue = makeMainPhaseLegalActionState();
  withFirstQueue.effectQueue.push(queuedEffect("first-hidden"));
  const withSecondQueue = makeMainPhaseLegalActionState();
  withSecondQueue.effectQueue.push(queuedEffect("second-hidden"));

  assert.deepEqual(
    getLegalActions(withFirstQueue, p1),
    getLegalActions(withSecondQueue, p1),
  );

  const withFirstDeferred = makeMainPhaseLegalActionState();
  withFirstDeferred.deferredTriggers.push({
    timingWindowId: toTimingWindowId("first-hidden-window"),
    generation: 1,
    triggerIds: ["hidden-trigger-one"],
    releasePolicy: "afterCurrentProcess",
  });
  const withSecondDeferred = makeMainPhaseLegalActionState();
  withSecondDeferred.deferredTriggers.push({
    timingWindowId: toTimingWindowId("second-hidden-window"),
    generation: 1,
    triggerIds: ["hidden-trigger-two"],
    releasePolicy: "afterCurrentProcess",
  });

  assert.deepEqual(
    getLegalActions(withFirstDeferred, p1),
    getLegalActions(withSecondDeferred, p1),
  );
});

test("pending runtime work rejects ordinary applyAction requests without mutation", () => {
  const state = makeMainPhaseLegalActionState();
  state.effectQueue.push(queuedEffect("apply-action"));
  const before = JSON.stringify(state);

  const result = applyAction(state, { type: "endMainPhase" });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Phase actions are illegal while effect runtime work is pending.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("pending runtime work still allows concession and pending-decision responses", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const pending = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  }).state;
  pending.effectQueue.push(queuedEffect("decision-response"));
  const decision = must(pending.pendingDecision, "pending decision");
  const pendingP1 = must(pending.players[p1], "pending p1");

  const response = applyAction(pending, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        must(pendingP1.costArea[0], "don0").instanceId,
        must(pendingP1.costArea[1], "don1").instanceId,
      ],
    },
  });
  assert.equal(response.errors, undefined);

  const conceded = applyAction(pending, { type: "concede", playerId: p1 });
  assert.equal(conceded.errors, undefined);
  assert.deepEqual(conceded.state.status, { type: "completed", winner: p2 });
});
