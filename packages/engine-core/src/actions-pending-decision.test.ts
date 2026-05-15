import assert from "node:assert/strict";
import { test } from "vitest";

import type { Action } from "@optcg/types";

import { createInitialState } from "./initial-state.js";
import { startMulliganFlow } from "./mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
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
  toEffectId,
  toQueueEntryId,
} from "./action-dispatcher-test-support.js";
import { hashCanonicalStateValue } from "./canonical-state.js";

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

test("respondToDecision rejects stale decision id for pending chooseOptionalActivation without mutation", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  state.pendingDecision = {
    id: toDecisionId("decision:choose-optional-activation"),
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Activate optional effect?",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-optional-activation"),
      effectId: toEffectId("effect-optional-activation"),
    },
    visibility: { type: "private", playerId: p1 },
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId: toEffectId("effect-optional-activation"),
    options: ["activate", "decline"],
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-optional"),
    response: { type: "optionalActivation", choice: "activate" },
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
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

const setupChooseQuantityDecisionState = () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:choose-quantity"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose quantity.",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-choose-quantity"),
      effectId: toEffectId("effect-choose-quantity"),
    },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 1,
    max: 3,
  };
  return state;
};

test("getLegalActions exposes chooseQuantity responses only for decision player", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = state.pendingDecision?.id;

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 1 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 2 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 3 },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions rejects malformed chooseQuantity bounds and mode", () => {
  const state = setupChooseQuantityDecisionState();
  const malformedDecisions: NonNullable<typeof state.pendingDecision>[] = [
    { ...must(state.pendingDecision, "pending decision"), mode: "bogus" },
    { ...must(state.pendingDecision, "pending decision"), min: 2, max: 1 },
    {
      ...must(state.pendingDecision, "pending decision"),
      mode: "exact",
      min: 1,
      max: 3,
    },
  ] as NonNullable<typeof state.pendingDecision>[];

  for (const pendingDecision of malformedDecisions) {
    const candidateState = { ...state, pendingDecision };

    assert.deepEqual(getLegalActions(candidateState, p1), [
      { type: "concede", playerId: p1 },
    ]);
  }
});

test("respondToDecision accepts valid chooseQuantity response and resolves decision with sequence increment", () => {
  const state = setupChooseQuantityDecisionState();
  const decision = must(state.pendingDecision, "pending decision");
  const before = structuredClone(state);
  const beforeSeq = state.seq;
  const beforeActionSeq = state.actionSeq;
  const beforeJournalLength = state.eventJournal.length;

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.seq, beforeSeq + 1);
  assert.equal(result.state.actionSeq, beforeActionSeq + 1);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved"],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: decision.type,
    playerId: decision.playerId,
    responseType: "chooseQuantity",
  });
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  assert.equal(state.pendingDecision?.id, before.pendingDecision?.id);
});

test("respondToDecision rejects malformed chooseQuantity responses without mutation", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const before = JSON.stringify(state);

  const invalidResponses: Extract<Action, { type: "respondToDecision" }>[] = [
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "orderedIds", ids: [] },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 0 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 4 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 1.5 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: -1 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity" } as Extract<
        Action,
        { type: "respondToDecision" }
      >["response"],
    },
    {
      type: "respondToDecision",
      decisionId,
    } as Extract<Action, { type: "respondToDecision" }>,
    {
      type: "respondToDecision",
      decisionId,
      response: null,
    } as unknown as Extract<Action, { type: "respondToDecision" }>,
  ];

  for (const action of invalidResponses) {
    const result = applyAction(state, action);
    assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
    assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  }
});

test("respondToDecision rejects malformed or wrong-player chooseQuantity envelope without mutation", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const before = JSON.stringify(state);

  const malformedPlayerResult = applyAction(state, {
    type: "respondToDecision",
    decisionId,
    playerId: 1,
    response: { type: "chooseQuantity", quantity: 2 },
  } as Action);
  assert.equal(
    malformedPlayerResult.errors?.[0]?.type,
    "invalidDecisionResponse",
  );
  assert.equal(JSON.stringify(malformedPlayerResult.state), before);

  const wrongPlayerResult = applyAction(state, {
    type: "respondToDecision",
    decisionId,
    playerId: p2,
    response: { type: "chooseQuantity", quantity: 2 },
  } as Action);
  assert.equal(wrongPlayerResult.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(JSON.stringify(wrongPlayerResult.state), before);
});

test("public legal actions for chooseQuantity expose decision id only and stale id is deterministic", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const ownerView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.equal(ownerView.pendingDecision?.type, "chooseQuantity");
  assert.deepEqual(ownerView.legalActions, [
    { type: "concede", playerId: p1 },
    { type: "respondToDecision", decisionId },
  ]);
  assert.deepEqual(opponentView.legalActions, [
    { type: "concede", playerId: p2 },
  ]);

  const before = JSON.stringify(state);
  const staleResult = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-choose-quantity"),
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.deepEqual(staleResult.errors, [
    {
      type: "illegalAction",
      reason: "Decision id does not match current pending decision.",
    },
  ]);
  assert.deepEqual(staleResult.events, []);
  assert.equal(JSON.stringify(staleResult.state), before);
  assert.equal(
    staleResult.stateHash,
    hashCanonicalStateValue(staleResult.state),
  );
});

test("respondToDecision preserves deterministic replay surfaces for accepted and stale chooseQuantity flows", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const acceptedAction: Action = {
    type: "respondToDecision",
    decisionId,
    response: { type: "chooseQuantity", quantity: 2 },
  };
  const staleAction: Action = {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-choose-quantity"),
    response: { type: "chooseQuantity", quantity: 2 },
  };

  const firstAccepted = applyAction(structuredClone(state), acceptedAction);
  const secondAccepted = applyAction(structuredClone(state), acceptedAction);
  const firstStale = applyAction(structuredClone(state), staleAction);
  const secondStale = applyAction(structuredClone(state), staleAction);

  assert.equal(firstAccepted.errors, undefined);
  assert.deepEqual(firstAccepted.events, secondAccepted.events);
  assert.equal(firstAccepted.stateHash, secondAccepted.stateHash);
  assert.deepEqual(
    firstAccepted.state.eventJournal,
    secondAccepted.state.eventJournal,
  );
  assert.deepEqual(firstStale.errors, secondStale.errors);
  assert.deepEqual(firstStale.events, []);
  assert.deepEqual(firstStale.events, secondStale.events);
  assert.equal(firstStale.stateHash, secondStale.stateHash);
  assert.deepEqual(
    firstStale.state.eventJournal,
    secondStale.state.eventJournal,
  );
});
