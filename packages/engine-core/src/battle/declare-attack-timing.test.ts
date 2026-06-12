import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { applyDeclareAttack, getDeclareAttackLegalActions } from "./actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import {
  passCounterStep,
  setupAttackState,
  withMultipleWhenAttackingDrawEffects,
  withOnKODrawEffect,
  withOnOpponentAttackDrawEffect,
  withWhenAttackingDrawEffect,
} from "./test-fixtures.js";
import { expectedEffectQueuedPayload } from "./effect-queued-test-helpers.js";
import {
  assertNoHiddenLeakInErrors,
  ensureDeckHasAtLeast,
  seedHiddenLeakSentinels,
} from "./declare-attack-timing-test-helpers.js";

test("ENG-023A: getLegalActions includes supported When Attacking attacker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  withWhenAttackingDrawEffect(state, p1State.leader);

  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("ENG-023A: non-attacking combat card When Attacking metadata does not make legal attack fail", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const nonAttackingCharacter = must(
    p1State.characters[0],
    "non-attacking character",
  );
  withWhenAttackingDrawEffect(state, nonAttackingCharacter);
  ensureDeckHasAtLeast(state, p1, 2);
  const beforeP2Life = p2State.life.length;

  const legal = getDeclareAttackLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );

  const opened = applyDeclareAttack(state, {
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

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "result p2").life.length,
    beforeP2Life - 1,
  );
});

test("ENG-023A: attacker When Attacking no-choice effect resolves after attackDeclared before damage", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  const definition = withWhenAttackingDrawEffect(state, attacker);
  const effect = must(definition.effects[0], "When Attacking effect");
  ensureDeckHasAtLeast(state, p1, 2);
  const beforeP1Deck = p1State.deck.length;
  const beforeP1Hand = p1State.hand.length;
  const beforeP2Life = p2State.life.length;

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(opened.state.players[p1], "result p1").deck.length,
    beforeP1Deck - 1,
  );
  assert.equal(
    must(opened.state.players[p1], "result p1").hand.length,
    beforeP1Hand + 1,
  );
  assert.equal(
    must(result.state.players[p2], "result p2").life.length,
    beforeP2Life - 1,
  );

  const events = [...opened.events, ...result.events];
  const attackDeclaredIndex = events.findIndex(
    (event) => event.type === "attackDeclared",
  );
  const effectQueuedIndex = events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const effectResolvedIndex = events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" && payload.effectBlockId === effect.id
    );
  });
  const damageIndex = events.findIndex((event) => event.type === "damageDealt");

  assert.notEqual(attackDeclaredIndex, -1);
  assert.notEqual(effectQueuedIndex, -1);
  assert.notEqual(effectResolvedIndex, -1);
  assert.notEqual(damageIndex, -1);
  assert.ok(attackDeclaredIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < effectResolvedIndex);
  assert.ok(effectResolvedIndex < damageIndex);

  const attackDeclared = must(
    events[attackDeclaredIndex],
    "attackDeclared event",
  );
  const effectQueued = must(events[effectQueuedIndex], "effectQueued");
  const queuedSource = {
    instanceId: attacker.instanceId,
    cardId: attacker.cardId,
    playerId: p1,
    zone: {
      zone: "leaderArea" as const,
      playerId: p1,
      slot: "leader" as const,
    },
  };
  assert.deepEqual(
    effectQueued.payload,
    expectedEffectQueuedPayload({
      queueEntryId: `queue-entry:${String(attackDeclared.id)}:${String(effect.id)}`,
      timingWindowId: `timing-window:${String(attackDeclared.id)}`,
      effectBlockId: effect.id,
      triggerEventId: attackDeclared.id,
      sourcePresencePolicy: "mustRemainInSameZone",
      orderingGroup: "turnPlayer",
      controllerId: p1,
      source: queuedSource,
      effectCategory: "auto",
      entryPoint: { type: "whenAttacking" },
      sourceCategory: "leader",
    }),
  );
  for (const event of opened.events) {
    assert.equal(event.createdAtStateSeq, opened.state.seq);
  }
});

test("ENG-060A: attacker When Attacking metadata remains usable with an unrelated On Play block", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  const definition = withWhenAttackingDrawEffect(state, attacker);
  const effect = must(definition.effects[0], "When Attacking effect");
  definition.effects = [
    effect,
    {
      ...effect,
      id: `${String(effect.id)}:on-play` as EffectDefinition["effects"][number]["id"],
      trigger: { type: "onPlay" },
    },
  ];
  ensureDeckHasAtLeast(state, p1, 2);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    opened.events.some((event) => event.type === "effectQueued"),
    true,
  );
});

test("ENG-060A: unsupported mixed When Attacking metadata does not block legal attack exposure", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const definition = withWhenAttackingDrawEffect(state, attacker);
  const effect = must(definition.effects[0], "When Attacking effect");
  definition.effects = [
    {
      ...effect,
      cost: { type: "restDon", count: 1 },
    },
    {
      ...effect,
      id: `${String(effect.id)}:on-play` as EffectDefinition["effects"][number]["id"],
      trigger: { type: "onPlay" },
    },
  ];

  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("ENG-060A: unsupported mixed When Attacking condition does not block legal attack exposure", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const definition = withWhenAttackingDrawEffect(state, attacker);
  const effect = must(definition.effects[0], "When Attacking effect");
  definition.effects = [
    {
      ...effect,
      condition: { type: "custom", check: "private-state" },
    },
    {
      ...effect,
      id: `${String(effect.id)}:on-play` as EffectDefinition["effects"][number]["id"],
      trigger: { type: "onPlay" },
    },
  ];

  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("ENG-060A: supported conditioned When Attacking legal exposure is not blocked by supported On K.O. metadata", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const definition = withWhenAttackingDrawEffect(state, attacker);
  const effect = must(definition.effects[0], "When Attacking effect");
  definition.effects = [
    {
      ...effect,
      condition: { type: "yourTurn" },
    },
    {
      ...effect,
      id: `${String(effect.id)}:on-ko` as EffectDefinition["effects"][number]["id"],
      trigger: { type: "onKO" },
      sourcePresencePolicy: "resolveFromDestinationZone",
    },
  ];

  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("ENG-060A: On K.O. battle metadata remains usable with an unrelated On Play block", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = must(p2State.characters[0], "defender character");
  const definition = withOnKODrawEffect(state, target);
  const effect = must(definition.effects[0], "On K.O. effect");
  definition.effects = [
    effect,
    {
      ...effect,
      id: `${String(effect.id)}:on-play` as EffectDefinition["effects"][number]["id"],
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
  ensureDeckHasAtLeast(state, p2, 2);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
});

test("ENG-023A: attacker When Attacking resolves before defender block decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "defender blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  const definition = withWhenAttackingDrawEffect(state, p1State.leader);
  const effect = must(definition.effects[0], "When Attacking effect");
  ensureDeckHasAtLeast(state, p1, 2);
  const beforeP1Hand = p1State.hand.length;

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
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  assert.equal(
    must(result.state.players[p1], "result p1").hand.length,
    beforeP1Hand + 1,
  );
  const resolvedIndex = result.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" && payload.effectBlockId === effect.id
    );
  });
  const decisionIndex = result.events.findIndex(
    (event) => event.type === "decisionCreated",
  );
  const damageIndex = result.events.findIndex(
    (event) => event.type === "damageDealt",
  );

  assert.notEqual(resolvedIndex, -1);
  assert.notEqual(decisionIndex, -1);
  assert.ok(resolvedIndex < decisionIndex);
  assert.equal(damageIndex, -1);
});

test("ENG-023A: multiple same-player attacker When Attacking effects resolve as independent supported blocks", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withMultipleWhenAttackingDrawEffects(
    state,
    p1State.leader,
  );
  const effectIds = definition.effects.map((effect) => effect.id);

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
  assert.deepEqual(
    result.events
      .filter((event) => event.type === "effectQueued")
      .map(
        (event) =>
          (event.payload as Partial<{ effectBlockId: string }>).effectBlockId,
      ),
    effectIds,
  );
});

test("ENG-023D: unsupported attacker When Attacking choice fails closed without mutation or hidden identity leakage", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withWhenAttackingDrawEffect(state, p1State.leader);
  const first = must(definition.effects[0], "When Attacking effect");
  definition.effects = [
    {
      ...first,
      effect: {
        type: "choice",
        chooser: "self",
        options: [],
        min: 0,
        max: 0,
      },
    },
  ];
  seedHiddenLeakSentinels(state);
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
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "unsupported-when-attacking-definition",
      },
    },
  ]);
  assert.deepEqual(result.events, []);
  assertNoHiddenLeakInErrors(result.errors);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("ENG-023B: defender On Your Opponent's Attack resolves before Counter Step pass decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withOnOpponentAttackDrawEffect(state, p2State.leader);
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  ensureDeckHasAtLeast(state, p2, 2);
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const beforeP2Deck = p2State.deck.length;
  const beforeP2Hand = p2State.hand.length;

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
  assert.equal(
    must(result.state.players[p2], "result p2").deck.length,
    beforeP2Deck - 1,
  );
  assert.equal(
    must(result.state.players[p2], "result p2").hand.length,
    beforeP2Hand + 1,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    false,
  );

  const attackDeclaredIndex = result.events.findIndex(
    (event) => event.type === "attackDeclared",
  );
  const effectQueuedIndex = result.events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const effectResolvedIndex = result.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" && payload.effectBlockId === effect.id
    );
  });
  const decisionCreatedIndex = result.events.findIndex(
    (event) => event.type === "decisionCreated",
  );

  assert.notEqual(attackDeclaredIndex, -1);
  assert.notEqual(effectQueuedIndex, -1);
  assert.notEqual(effectResolvedIndex, -1);
  assert.notEqual(decisionCreatedIndex, -1);
  assert.ok(attackDeclaredIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < effectResolvedIndex);
  assert.ok(effectResolvedIndex < decisionCreatedIndex);

  const attackDeclared = must(
    result.events[attackDeclaredIndex],
    "attackDeclared event",
  );
  const effectQueued = must(result.events[effectQueuedIndex], "effectQueued");
  const queuedSource = {
    instanceId: p2State.leader.instanceId,
    cardId: p2State.leader.cardId,
    playerId: p2,
    zone: {
      zone: "leaderArea" as const,
      playerId: p2,
      slot: "leader" as const,
    },
  };
  assert.deepEqual(
    effectQueued.payload,
    expectedEffectQueuedPayload({
      queueEntryId: `queue-entry:${String(attackDeclared.id)}:onOpponentAttack:${String(p2State.leader.instanceId)}:${String(effect.id)}`,
      timingWindowId: `timing-window:${String(attackDeclared.id)}:onOpponentAttack`,
      effectBlockId: effect.id,
      triggerEventId: attackDeclared.id,
      sourcePresencePolicy: "mustRemainInSameZone",
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
      source: queuedSource,
      effectCategory: "auto",
      entryPoint: { type: "onOpponentAttack" },
      sourceCategory: "leader",
    }),
  );
});

test("ENG-023B: character Counter is usable after attacker and defender attack timing resolve", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  withWhenAttackingDrawEffect(state, p1State.leader);
  withOnOpponentAttackDrawEffect(state, p2State.leader);
  ensureDeckHasAtLeast(state, p1, 2);
  ensureDeckHasAtLeast(state, p2, 2);
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

  const opened = applyDeclareAttack(state, {
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

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.battle?.step, "counter");
  const legalCounter = getLegalActions(opened.state, p2).find(
    (action) =>
      action.type === "useCounter" &&
      action.cardInstanceId === counterCard.instanceId,
  );
  assert.notEqual(legalCounter, undefined);

  const countered = applyAction(
    opened.state,
    must(legalCounter, "legal counter action"),
  );

  assert.equal(countered.errors, undefined);
  const counterBattle = must(countered.state.battle, "counter battle");
  const battleWithInternal = counterBattle as typeof counterBattle & {
    counterPower?: number;
  };
  assert.equal(counterBattle.step, "counter");
  assert.equal(battleWithInternal.counterPower, 1000);
  assert.equal(
    countered.events.some((event) => event.type === "counterUsed"),
    true,
  );
});

test("ENG-023C: attacker attack timing resolves before defender attack timing and Counter Step", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attackerDefinition = withWhenAttackingDrawEffect(
    state,
    p1State.leader,
    "def-eng-023c-when-attacking",
  );
  const defenderDefinition = withOnOpponentAttackDrawEffect(
    state,
    p2State.leader,
    "def-eng-023c-on-opponent-attack",
  );
  const attackerEffect = must(
    attackerDefinition.effects[0],
    "ENG-023C attacker effect",
  );
  const defenderEffect = must(
    defenderDefinition.effects[0],
    "ENG-023C defender effect",
  );
  ensureDeckHasAtLeast(state, p1, 2);
  ensureDeckHasAtLeast(state, p2, 2);
  const counterCard = must(p2State.hand[0], "ENG-023C counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const beforeP1Hand = p1State.hand.length;
  const beforeP2Hand = p2State.hand.length;

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
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  assert.equal(result.state.pendingDecision.playerId, p2);
  assert.equal(
    must(result.state.players[p1], "ENG-023C result p1").hand.length,
    beforeP1Hand + 1,
  );
  assert.equal(
    must(result.state.players[p2], "ENG-023C result p2").hand.length,
    beforeP2Hand + 1,
  );

  const effectEventIndex = (
    eventType: "effectQueued" | "effectResolved",
    effectBlockId: string,
  ) =>
    result.events.findIndex((event) => {
      const payload = event.payload as Partial<{ effectBlockId: string }>;
      return (
        event.type === eventType && payload.effectBlockId === effectBlockId
      );
    });
  const attackDeclaredIndex = result.events.findIndex(
    (event) => event.type === "attackDeclared",
  );
  const attackerQueuedIndex = effectEventIndex(
    "effectQueued",
    attackerEffect.id,
  );
  const attackerResolvedIndex = effectEventIndex(
    "effectResolved",
    attackerEffect.id,
  );
  const defenderQueuedIndex = effectEventIndex(
    "effectQueued",
    defenderEffect.id,
  );
  const defenderResolvedIndex = effectEventIndex(
    "effectResolved",
    defenderEffect.id,
  );
  const decisionCreatedIndex = result.events.findIndex(
    (event) => event.type === "decisionCreated",
  );
  const damageIndex = result.events.findIndex(
    (event) => event.type === "damageDealt",
  );

  assert.notEqual(attackDeclaredIndex, -1);
  assert.notEqual(attackerQueuedIndex, -1);
  assert.notEqual(attackerResolvedIndex, -1);
  assert.notEqual(defenderQueuedIndex, -1);
  assert.notEqual(defenderResolvedIndex, -1);
  assert.notEqual(decisionCreatedIndex, -1);
  assert.equal(damageIndex, -1);
  assert.ok(attackDeclaredIndex < attackerQueuedIndex);
  assert.ok(attackerQueuedIndex < attackerResolvedIndex);
  assert.ok(attackerResolvedIndex < defenderQueuedIndex);
  assert.ok(defenderQueuedIndex < defenderResolvedIndex);
  assert.ok(defenderResolvedIndex < decisionCreatedIndex);

  const attackDeclared = must(
    result.events[attackDeclaredIndex],
    "ENG-023C attackDeclared event",
  );
  const attackerQueued = must(
    result.events[attackerQueuedIndex],
    "ENG-023C attacker effectQueued",
  );
  const attackerQueuedSource = {
    instanceId: p1State.leader.instanceId,
    cardId: p1State.leader.cardId,
    playerId: p1,
    zone: {
      zone: "leaderArea" as const,
      playerId: p1,
      slot: "leader" as const,
    },
  };
  assert.deepEqual(
    attackerQueued.payload,
    expectedEffectQueuedPayload({
      queueEntryId: `queue-entry:${String(attackDeclared.id)}:${String(
        attackerEffect.id,
      )}`,
      timingWindowId: `timing-window:${String(attackDeclared.id)}`,
      effectBlockId: attackerEffect.id,
      triggerEventId: attackDeclared.id,
      sourcePresencePolicy: "mustRemainInSameZone",
      orderingGroup: "turnPlayer",
      controllerId: p1,
      source: attackerQueuedSource,
      effectCategory: "auto",
      entryPoint: { type: "whenAttacking" },
      sourceCategory: "leader",
    }),
  );
  const defenderQueued = must(
    result.events[defenderQueuedIndex],
    "ENG-023C defender effectQueued",
  );
  const defenderQueuedSource = {
    instanceId: p2State.leader.instanceId,
    cardId: p2State.leader.cardId,
    playerId: p2,
    zone: {
      zone: "leaderArea" as const,
      playerId: p2,
      slot: "leader" as const,
    },
  };
  assert.deepEqual(
    defenderQueued.payload,
    expectedEffectQueuedPayload({
      queueEntryId: `queue-entry:${String(
        attackDeclared.id,
      )}:onOpponentAttack:${String(p2State.leader.instanceId)}:${String(defenderEffect.id)}`,
      timingWindowId: `timing-window:${String(
        attackDeclared.id,
      )}:onOpponentAttack`,
      effectBlockId: defenderEffect.id,
      triggerEventId: attackDeclared.id,
      sourcePresencePolicy: "mustRemainInSameZone",
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
      source: defenderQueuedSource,
      effectCategory: "auto",
      entryPoint: { type: "onOpponentAttack" },
      sourceCategory: "leader",
    }),
  );
});

test("ENG-023B: defender timing resolves before Block Step decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "defender blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  const definition = withOnOpponentAttackDrawEffect(state, p2State.leader);
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  ensureDeckHasAtLeast(state, p2, 2);
  const beforeP2Hand = p2State.hand.length;
  const beforeP2Deck = p2State.deck.length;

  const opened = applyDeclareAttack(state, {
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

  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.battle?.step, "block");
  assert.equal(
    must(opened.state.players[p2], "opened p2").hand.length,
    beforeP2Hand + 1,
  );
  assert.equal(
    must(opened.state.players[p2], "opened p2").deck.length,
    beforeP2Deck - 1,
  );

  const events = opened.events;
  const effectQueuedIndex = events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const effectResolvedIndex = events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" && payload.effectBlockId === effect.id
    );
  });
  const damageIndex = events.findIndex((event) => event.type === "damageDealt");
  const decisionCreatedIndex = events.findIndex(
    (event) => event.type === "decisionCreated",
  );

  assert.notEqual(effectQueuedIndex, -1);
  assert.notEqual(effectResolvedIndex, -1);
  assert.notEqual(decisionCreatedIndex, -1);
  assert.equal(damageIndex, -1);
  assert.ok(effectQueuedIndex < effectResolvedIndex);
  assert.ok(effectResolvedIndex < decisionCreatedIndex);
  const blockDecision = must(opened.state.pendingDecision, "block decision");
  assert.equal(blockDecision.type, "selectCards");
  assert.equal(blockDecision.playerId, p2);
});

test("ENG-023B: multiple same-player defender attack timing effects resolve as independent supported blocks", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  const leaderDefinition = withOnOpponentAttackDrawEffect(
    state,
    p2State.leader,
    "def-opp-leader",
  );
  const characterDefinition = withOnOpponentAttackDrawEffect(
    state,
    defenderCharacter,
    "def-opp-character",
  );
  const effectIds = [
    must(leaderDefinition.effects[0], "leader effect").id,
    must(characterDefinition.effects[0], "character effect").id,
  ];

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
  assert.deepEqual(
    result.events
      .filter((event) => event.type === "effectQueued")
      .map(
        (event) =>
          (event.payload as Partial<{ effectBlockId: string }>).effectBlockId,
      ),
    effectIds,
  );
});

test("ENG-023D: unsupported defender On Your Opponent's Attack custom effect fails closed without mutation or hidden identity leakage", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withOnOpponentAttackDrawEffect(state, p2State.leader);
  const first = must(definition.effects[0], "On Opponent Attack effect");
  definition.effects = [
    {
      ...first,
      effect: {
        type: "custom",
        handler: "hidden-defender-deck-card",
      },
    },
  ];
  seedHiddenLeakSentinels(state);
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
      type: "effectRuntimeError",
      effectId: "on-opponent-attack-trigger-queueing",
      details: {
        reason: "unsupported-on-opponent-attack-definition",
      },
    },
  ]);
  assert.deepEqual(result.events, []);
  assertNoHiddenLeakInErrors(result.errors);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});
