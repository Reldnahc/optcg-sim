import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, CardRef } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  assertRejectsWithoutMutation,
  cardRef,
  ensureActiveDonInCostArea,
  effectDefinition,
  installSupportedCounterEvent,
  setupAttackState,
  setupOpenedCounterStepPassDecision,
} from "./test-fixtures.js";

test("useCounter with an Event card fails closed with unsupported Counter Event error and no mutation", () => {
  const { openedState, counterCard } = setupOpenedCounterStepPassDecision();
  openedState.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "event",
    effectText: "[Counter] Draw 1 card.",
  });
  const before = JSON.stringify(openedState);

  const result = applyAction(openedState, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: must(openedState.battle, "battle").currentTarget,
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Counter Events are unsupported in the Counter Step.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(openedState), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("illegal Character Counter attempts fail closed without mutation", () => {
  const run = (
    mutate: (
      context: ReturnType<typeof setupOpenedCounterStepPassDecision>,
    ) => {
      cardInstanceId: CardInstance["instanceId"];
      target: CardRef;
    },
  ) => {
    const context = setupOpenedCounterStepPassDecision();
    const action = mutate(context);
    assertRejectsWithoutMutation(context.openedState, {
      type: "useCounter",
      cardInstanceId: action.cardInstanceId,
      target: action.target,
    });
  };

  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = {
      ...battle,
      currentTarget: {
        instanceId: "stale-target" as never,
        cardId: context.p2State.leader.cardId,
        playerId: p2,
      },
    };
    return {
      cardInstanceId: context.counterCard.instanceId,
      target: battle.currentTarget,
    };
  });
  run((context) => ({
    cardInstanceId: context.counterCard.instanceId,
    target: cardRef(context.p1State.leader, p1),
  }));
  run((context) => ({
    cardInstanceId: must(context.p1State.hand[0], "p1 hand").instanceId,
    target: must(context.openedState.battle, "battle").currentTarget,
  }));
  run((context) => {
    const p2State = must(context.openedState.players[p2], "p2");
    p2State.hand = p2State.hand.filter(
      (card) => card.instanceId !== context.counterCard.instanceId,
    );
    return {
      cardInstanceId: context.counterCard.instanceId,
      target: must(context.openedState.battle, "battle").currentTarget,
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.counterCard.cardId] =
      resolvedCard({
        cardId: context.counterCard.cardId,
        category: "leader",
        power: 5000,
        counter: 1000,
      });
    return {
      cardInstanceId: context.counterCard.instanceId,
      target: must(context.openedState.battle, "battle").currentTarget,
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.counterCard.cardId] =
      resolvedCard({
        cardId: context.counterCard.cardId,
        category: "character",
        power: 3000,
        counter: 0,
      });
    return {
      cardInstanceId: context.counterCard.instanceId,
      target: must(context.openedState.battle, "battle").currentTarget,
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.counterCard.cardId] =
      resolvedCard({
        cardId: context.counterCard.cardId,
        category: "event",
        counter: 1000,
      });
    return {
      cardInstanceId: context.counterCard.instanceId,
      target: must(context.openedState.battle, "battle").currentTarget,
    };
  });
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = { ...battle, step: "attack" };
    return {
      cardInstanceId: context.counterCard.instanceId,
      target: battle.currentTarget,
    };
  });
});

test("Character Counter rejects replacement processing without clearing decision", () => {
  const context = setupOpenedCounterStepPassDecision();
  context.openedState.replacementState.push({
    processId: "use-counter-replacement-process",
    type: "damage",
    usedReplacementIds: [],
    payload: { hidden: "replacement" },
  });
  const before = JSON.stringify(context.openedState);

  const result = applyAction(context.openedState, {
    type: "useCounter",
    cardInstanceId: context.counterCard.instanceId,
    target: must(context.openedState.battle, "battle").currentTarget,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.pendingDecision?.id, context.decision.id);
  assert.equal(result.state.battle?.step, "counter");
});

test("Character Counter rejects active Character current target without clearing decision", () => {
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

  const result = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: cardRef(target, p2),
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(opened.state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.pendingDecision?.id, decision.id);
  assert.equal(result.state.battle?.step, "counter");
});

test("counter-step pass rejects stale battle participants without mutation", () => {
  const run = (
    mutate: (
      state: ReturnType<typeof setupOpenedCounterStepPassDecision>,
    ) => void,
  ) => {
    const context = setupOpenedCounterStepPassDecision();
    mutate(context);
    const before = JSON.stringify(context.openedState);

    const result = applyAction(context.openedState, {
      type: "respondToDecision",
      decisionId: context.decision.id,
      response: { type: "cards", cards: [] },
    });

    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(context.openedState), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = {
      ...battle,
      attacker: {
        instanceId: "stale-attacker" as never,
        cardId: context.p1State.leader.cardId,
        playerId: p1,
      },
    };
  });
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = {
      ...battle,
      currentTarget: {
        instanceId: "stale-current-target" as never,
        cardId: context.p2State.leader.cardId,
        playerId: p2,
      },
    };
  });
});

test("counter-step pass rejects unsupported life trigger damage without clearing decision", () => {
  const context = setupOpenedCounterStepPassDecision();
  const p2State = must(context.openedState.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  p2State.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: toCardId("counter-pass-trigger-life"),
    },
  };
  context.openedState.cardManifest.cards[
    toCardId("counter-pass-trigger-life")
  ] = {
    ...resolvedCard({
      cardId: toCardId("counter-pass-trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: draw 1 card",
  };
  const before = JSON.stringify(context.openedState);

  const result = applyAction(context.openedState, {
    type: "respondToDecision",
    decisionId: context.decision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.pendingDecision?.id, context.decision.id);
  assert.equal(result.state.battle?.step, "counter");
});

test("counter-step pass rejects replacement processing without clearing decision", () => {
  const context = setupOpenedCounterStepPassDecision();
  context.openedState.replacementState.push({
    processId: "counter-pass-replacement-process",
    type: "damage",
    usedReplacementIds: [],
    payload: { hidden: "replacement" },
  });
  const before = JSON.stringify(context.openedState);

  const result = applyAction(context.openedState, {
    type: "respondToDecision",
    decisionId: context.decision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(context.openedState), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.pendingDecision?.id, context.decision.id);
  assert.equal(result.state.battle?.step, "counter");
});

test("counter-step pass rejects active Character target without clearing decision", () => {
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

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(opened.state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.pendingDecision?.id, decision.id);
  assert.equal(result.state.battle?.step, "counter");
});

test("raw [Counter] Event text prevents auto-pass with unsupported Counter Event error and no mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    effectText: "[Counter] Draw 1 card.",
  });
  const before = JSON.stringify(state);

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

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Counter Events are unsupported in the Counter Step.",
    },
  ]);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("counter effect definition on defender Event prevents auto-pass with unsupported Counter Event error and no mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
  });
  state.cardManifest.effectDefinitions = {
    counterEvent: effectDefinition(counterEvent.cardId, { type: "counter" }),
  };
  const before = JSON.stringify(state);

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Counter Events are unsupported in the Counter Step.",
    },
  ]);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("counter trigger definition on defender Character still prevents unsupported counter window", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCharacter = must(p2State.hand[0], "counter character");
  state.cardManifest.cards[counterCharacter.cardId] = resolvedCard({
    cardId: counterCharacter.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  state.cardManifest.effectDefinitions = {
    counterCharacter: effectDefinition(counterCharacter.cardId, {
      type: "counter",
    }),
  };
  const before = JSON.stringify(state);

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported counter window handling.",
    },
  ]);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("unsupported implemented-dsl Counter Event shapes still fail closed", () => {
  const run = (
    mutate: (
      state: ReturnType<typeof setupAttackState>,
      counterEvent: CardInstance,
    ) => void,
  ) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    installSupportedCounterEvent(state, counterEvent, 1000);
    mutate(state, counterEvent);
    const before = JSON.stringify(state);

    const result = applyDeclareAttack(state, {
      type: "declareAttack",
      attacker: cardRef(p1State.leader, p1),
      target: cardRef(p2State.leader, p2),
    });

    assert.deepEqual(result.errors, [
      {
        type: "illegalAction",
        reason: "Counter Events are unsupported in the Counter Step.",
      },
    ]);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
    assert.deepEqual(result.events, []);
  };

  run((state, counterEvent) => {
    const definition = must(
      state.cardManifest.effectDefinitions?.[
        `${String(counterEvent.cardId)}:counter`
      ],
      "counter definition",
    );
    const effect = must(definition.effects[0], "counter effect");
    definition.effects = [
      {
        ...effect,
        conditionTiming: "resolution",
      },
    ];
  });

  run((state, counterEvent) => {
    state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      effectText: "[Counter] +1000.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: `${String(counterEvent.cardId)}:counter`,
        customHandlerIds: ["custom-counter"],
      },
    });
  });

  run((state, counterEvent) => {
    const definition = must(
      state.cardManifest.effectDefinitions?.[
        `${String(counterEvent.cardId)}:counter`
      ],
      "counter definition",
    );
    const effect = must(definition.effects[0], "counter effect");
    definition.effects = [
      {
        ...effect,
        effect: {
          type: "modifyPower",
          target: { type: "attackTarget" },
          value: 0,
          duration: { type: "thisBattle" },
        },
      },
    ];
  });
});

test("supported nonzero-cost Counter Event rejects forged payCost response without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterEvent(state, counterEvent, 1000);
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 1,
    effectText: "[Counter] +1000.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `${String(counterEvent.cardId)}:counter`,
    },
  });
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  const use = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(use.errors, undefined);
  const before = JSON.stringify(use.state);

  const forged = applyAction(use.state, {
    type: "respondToDecision",
    decisionId: must(use.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: ["missing-don" as never],
    },
  });

  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(forged.events, []);
  assert.equal(JSON.stringify(use.state), before);
  assert.equal(JSON.stringify(forged.state), before);
});

test("costed Counter Event without active DON is not legal and fails closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const characterCounter = must(p2State.hand[1], "character counter");
  installSupportedCounterEvent(state, counterEvent, 1000);
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 1,
    effectText: "[Counter] +1000.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `${String(counterEvent.cardId)}:counter`,
    },
  });
  state.cardManifest.cards[characterCounter.cardId] = resolvedCard({
    cardId: characterCounter.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  p2State.costArea = p2State.costArea.map((don) => ({
    ...don,
    state: "rested",
  }));

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    false,
  );
  const before = JSON.stringify(opened.state);

  const result = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Counter Event requires enough active DON!!.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(opened.state), before);
  assert.equal(JSON.stringify(result.state), before);
});
