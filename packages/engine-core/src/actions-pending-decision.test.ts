import assert from "node:assert/strict";
import { test } from "vitest";

import { createInitialState } from "./initial-state.js";
import { startMulliganFlow } from "./mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import {
  setupFullCharacterPlayState,
  setupMainPlayState,
} from "./play-card-test-fixtures.js";
import {
  toDecisionId,
  toQueueEntryId,
} from "./action-dispatcher-test-support.js";

test("getLegalActions suppresses phase actions while a decision is pending", () => {
  const setup = createInitialState(createInput());
  const pending = startMulliganFlow(setup).state;
  pending.status = { type: "active" };
  pending.turn.phase = "main";

  assert.deepEqual(getLegalActions(pending, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions keeps play-card payment and overflow responses unchanged when runtime queues are empty", () => {
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
  const paymentLegal = getLegalActions(opened.state, p1);

  assert.equal(
    paymentLegal.filter((action) => action.type === "respondToDecision").length,
    3,
  );
  assert.deepEqual(paymentLegal[0], { type: "concede", playerId: p1 });

  const {
    state: overflowState,
    newCharacter,
    existingCharacters,
  } = setupFullCharacterPlayState(0);
  const overflowOpened = applyAction(overflowState, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const overflowLegal = getLegalActions(overflowOpened.state, p1);

  assert.equal(
    overflowLegal.filter((action) => action.type === "respondToDecision")
      .length,
    existingCharacters.length,
  );
  assert.deepEqual(overflowLegal[0], { type: "concede", playerId: p1 });
});

test("pending decisions reject non-concession applyAction requests without mutation", () => {
  const setup = createInitialState(createInput());
  const state = startMulliganFlow(setup).state;
  state.status = { type: "active" };
  state.turn.phase = "main";
  const before = JSON.stringify(state);

  const result = applyAction(state, { type: "endMainPhase" });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("respondToDecision rejects stale decision id for pending chooseTriggerOrder without mutation", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose trigger resolution order.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [toQueueEntryId("queue-a"), toQueueEntryId("queue-b")],
    constraints: { mustUseAll: true },
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale"),
    response: { type: "orderedIds", ids: ["queue-b", "queue-a"] },
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Decision id does not match current pending decision.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("getLegalActions exposes chooseTriggerOrder response only for the decision player", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose trigger resolution order.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [toQueueEntryId("queue-a"), toQueueEntryId("queue-b")],
    constraints: { mustUseAll: true },
  };

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:choose-trigger-order"),
      response: { type: "orderedIds", ids: ["queue-a", "queue-b"] },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions exposes confirmLifeTrigger respondToDecision only to decision player", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const lifeCard = must(p2State.life[0], "top life").card;
  state.pendingDecision = {
    id: toDecisionId("decision:life-trigger"),
    type: "confirmLifeTrigger",
    playerId: p2,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      playerId: p2,
      zone: lifeCard.zone,
    },
    options: ["activateTrigger", "addToHand"],
  };

  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:life-trigger"),
      response: { type: "lifeTrigger", choice: "activateTrigger" },
    },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:life-trigger"),
      response: { type: "lifeTrigger", choice: "addToHand" },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});
