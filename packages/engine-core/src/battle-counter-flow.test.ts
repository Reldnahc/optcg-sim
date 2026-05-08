import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  cardRef,
  setupAttackState,
  setupOpenedCounterStepPassDecision,
} from "./battle-actions-test-fixtures.js";

test("banish attacker with defender Character Counter metadata opens counter-step pass decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.battle?.step, "counter");
  assert.equal(result.state.pendingDecision?.playerId, p2);
});

test("no-counter attack auto-passes counter step and resolves damage without pending decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const beforeLife = p2State.life.length;

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLife - 1,
  );
  assert.equal(
    result.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
});

test("Character Counter metadata in defender hand opens counter-step pass decision", () => {
  const { opened, p2State, decision } = setupOpenedCounterStepPassDecision();

  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(
    must(opened.state.players[p2], "p2").life.length,
    p2State.life.length,
  );
  assert.deepEqual(decision, {
    id: decision.id,
    type: "selectCards",
    playerId: p2,
    prompt: "Pass Counter Step.",
    causedBy: decision.causedBy,
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "nonTurnPlayer",
      player: "nonTurnPlayer",
      zone: "hand",
      filter: { categories: ["character"] },
      min: 0,
      max: 0,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: [],
    defaultResponse: { type: "cards", cards: [] },
  });
  assert.deepEqual(
    opened.events
      .filter((event) => event.type === "decisionCreated")
      .map((event) => event.payload),
    [
      {
        decisionId: decision.id,
        decisionType: "selectCards",
        playerId: p2,
      },
    ],
  );
});

test("counter-step legal actions expose defender pass and Character Counters without leaking to attacker", () => {
  const { opened, counterCard, decision } =
    setupOpenedCounterStepPassDecision();

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "useCounter",
      cardInstanceId: counterCard.instanceId,
      target: must(opened.state.battle, "battle").currentTarget,
    },
  ]);
  assert.deepEqual(getLegalActions(opened.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("counter-step legal actions suppress pass for unsupported continuation", () => {
  const context = setupOpenedCounterStepPassDecision();
  const p2State = must(context.openedState.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  p2State.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: toCardId("counter-legal-trigger-life"),
    },
  };
  context.openedState.cardManifest.cards[
    toCardId("counter-legal-trigger-life")
  ] = {
    ...resolvedCard({
      cardId: toCardId("counter-legal-trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: draw 1 card",
  };
  const before = JSON.stringify(context.openedState);

  assert.deepEqual(getLegalActions(context.openedState, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "useCounter",
      cardInstanceId: context.counterCard.instanceId,
      target: must(context.openedState.battle, "battle").currentTarget,
    },
  ]);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(context.openedState.pendingDecision?.id, context.decision.id);
  assert.equal(context.openedState.battle?.step, "counter");
});

test("counter-step legal actions suppress Character Counter during replacement processing", () => {
  const context = setupOpenedCounterStepPassDecision();
  context.openedState.replacementState.push({
    processId: "legal-counter-replacement-process",
    type: "damage",
    usedReplacementIds: [],
    payload: { hidden: "replacement" },
  });
  const before = JSON.stringify(context.openedState);

  assert.deepEqual(getLegalActions(context.openedState, p2), [
    { type: "concede", playerId: p2 },
  ]);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(context.openedState.pendingDecision?.id, context.decision.id);
  assert.equal(context.openedState.battle?.step, "counter");
});

test("counter-step legal actions suppress Character Counter for active Character current target", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(target, p2),
  });
  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "pending decision");
  const openedTarget = must(
    must(opened.state.players[p2], "opened p2").characters.find(
      (character) => character.instanceId === target.instanceId,
    ),
    "opened target",
  );
  openedTarget.state = "active";
  const before = JSON.stringify(opened.state);

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
  ]);
  assert.equal(JSON.stringify(opened.state), before);
  assert.equal(opened.state.pendingDecision?.id, decision.id);
  assert.equal(opened.state.battle?.step, "counter");
});

test("counter-step pass emits deterministic decisionResolved sequence and resumes damage", () => {
  const { opened, p2State, decision } = setupOpenedCounterStepPassDecision();
  const beforeLife = p2State.life.length;

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLife - 1,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "damageDealt",
      "lifeTaken",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    playerId: p2,
  });
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("Character Counter moves from hand to trash, emits deterministic events, and keeps Counter Step open", () => {
  const { opened, counterCard, decision } =
    setupOpenedCounterStepPassDecision();
  const target = must(opened.state.battle, "battle").currentTarget;

  const result = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.id, decision.id);
  assert.equal(result.state.battle?.step, "counter");
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === counterCard.instanceId,
    ),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterCard.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    result.events.map((event) => ({
      type: event.type,
      payload: event.payload,
      visibility: event.visibility,
    })),
    [
      {
        type: "counterUsed",
        payload: {
          playerId: p2,
          instanceId: counterCard.instanceId,
          cardId: counterCard.cardId,
          target,
          value: 1000,
        },
        visibility: { type: "public" },
      },
      {
        type: "cardMoved",
        payload: {
          instanceId: counterCard.instanceId,
          cardId: counterCard.cardId,
          from: counterCard.zone,
          to: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
          reason: "counter",
        },
        visibility: { type: "public" },
      },
      {
        type: "cardTrashed",
        payload: {
          playerId: p2,
          instanceId: counterCard.instanceId,
          cardId: counterCard.cardId,
          reason: "counter",
        },
        visibility: { type: "public" },
      },
    ],
  );

  const replay = applyAction(structuredClone(opened.state), {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("Character Counter power changes Damage Step outcome after pass", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 4000,
  });
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 2000,
  });
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(target, p2),
  });
  assert.equal(opened.errors, undefined);
  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: cardRef(target, p2),
  });
  assert.equal(countered.errors, undefined);
  assert.equal(countered.state.battle?.counterPower, 2000);

  const result = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(countered.state.pendingDecision, "pending decision").id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(JSON.stringify(result.state).includes("counterPower"), false);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardKOd"),
    false,
  );
});

test("multiple Character Counters stack before pass", () => {
  const { opened, counterCard } = setupOpenedCounterStepPassDecision();
  const p2State = must(opened.state.players[p2], "p2");
  const secondCounter = must(p2State.hand[1], "second counter");
  opened.state.cardManifest.cards[secondCounter.cardId] = resolvedCard({
    cardId: secondCounter.cardId,
    category: "character",
    power: 3000,
    counter: 2000,
  });
  const target = must(opened.state.battle, "battle").currentTarget;

  const first = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target,
  });
  assert.equal(first.errors, undefined);
  const second = applyAction(first.state, {
    type: "useCounter",
    cardInstanceId: secondCounter.instanceId,
    target,
  });

  assert.equal(second.errors, undefined);
  assert.equal(second.state.battle?.counterPower, 3000);
  assert.equal(
    second.state.pendingDecision?.id,
    opened.state.pendingDecision?.id,
  );
  assert.equal(
    must(second.state.players[p2], "p2").trash.filter((card) =>
      [counterCard.instanceId, secondCounter.instanceId].includes(
        card.instanceId,
      ),
    ).length,
    2,
  );
});
