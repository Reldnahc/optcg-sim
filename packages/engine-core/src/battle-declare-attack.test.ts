import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, CardInstance, PlayerId } from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
import {
  applyDeclareAttack,
  getDeclareAttackLegalActions,
} from "./battle-actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  effectDefinition,
  setupAttackState,
  withMultipleWhenAttackingDrawEffects,
  withOnOpponentAttackDrawEffect,
  withWhenAttackingDrawEffect,
} from "./battle-actions-test-fixtures.js";

const ensureDeckHasAtLeast = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count: number,
) => {
  const player = must(state.players[playerId], "deck owner");
  if (player.deck.length >= count) {
    return;
  }
  const needed = count - player.deck.length;
  const moved = player.hand.slice(0, needed).map((card, index) => ({
    ...card,
    zone: {
      zone: "deck" as const,
      playerId,
      slot: "deck" as const,
      index: player.deck.length + index,
    },
  }));
  player.deck = [...player.deck, ...moved];
  player.hand = player.hand.slice(needed).map((card, index) => ({
    ...card,
    zone: { zone: "hand" as const, playerId, slot: "hand" as const, index },
  }));
};

test("getLegalActions includes Leader-to-Leader declareAttack for turn player", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");

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
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "result p2").life.length,
    beforeP2Life - 1,
  );
});

test("getLegalActions includes Character-to-rested-Character declareAttack and excludes active characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.characters.push({
    ...must(p2State.hand[0], "p2 hand active"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  });

  const attacker = must(p1State.characters[0], "attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  const activeTarget = must(p2State.characters[1], "active target");
  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === restedTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === activeTarget.instanceId,
    ),
    false,
  );
});

test("played-this-turn rush character can legally attack leader and rested character", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rush attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  attacker.turnPlayed = state.turn.globalTurn;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rush"],
  });
  state.cardManifest.cards[restedTarget.cardId] = resolvedCard({
    cardId: restedTarget.cardId,
    category: "character",
    power: 3000,
  });

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
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === restedTarget.instanceId,
    ),
    true,
  );
});

test("played-this-turn rush character attacks leader through battle action surface", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rush attacker");
  attacker.turnPlayed = state.turn.globalTurn;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rush"],
  });
  const beforeLife = p2State.life.length;

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 result").characters.find(
      (character) => character.instanceId === attacker.instanceId,
    )?.state,
    "rested",
  );
  assert.equal(
    must(result.state.players[p2], "p2 result").life.length,
    beforeLife - 1,
  );
  assert.equal(result.state.battle, undefined);
  assert.equal(
    result.events.some((event) => event.type === "attackDeclared"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
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

  const result = applyDeclareAttack(state, {
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

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "result p1").deck.length,
    beforeP1Deck - 1,
  );
  assert.equal(
    must(result.state.players[p1], "result p1").hand.length,
    beforeP1Hand + 1,
  );
  assert.equal(
    must(result.state.players[p2], "result p2").life.length,
    beforeP2Life - 1,
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
  const damageIndex = result.events.findIndex(
    (event) => event.type === "damageDealt",
  );

  assert.notEqual(attackDeclaredIndex, -1);
  assert.notEqual(effectQueuedIndex, -1);
  assert.notEqual(effectResolvedIndex, -1);
  assert.notEqual(damageIndex, -1);
  assert.ok(attackDeclaredIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < effectResolvedIndex);
  assert.ok(effectResolvedIndex < damageIndex);

  const attackDeclared = must(
    result.events[attackDeclaredIndex],
    "attackDeclared event",
  );
  const effectQueued = must(result.events[effectQueuedIndex], "effectQueued");
  assert.deepEqual(effectQueued.payload, {
    queueEntryId: `queue-entry:${String(attackDeclared.id)}:${String(effect.id)}`,
    timingWindowId: `timing-window:${String(attackDeclared.id)}`,
    generation: 0,
    effectBlockId: effect.id,
    triggerEventId: attackDeclared.id,
    sourcePresencePolicy: "mustRemainInSameZone",
    orderingGroup: "turnPlayer",
  });
  for (const event of result.events) {
    assert.equal(event.createdAtStateSeq, result.state.seq);
  }
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

test("ENG-023A: multiple same-player attacker When Attacking effects fail closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  withMultipleWhenAttackingDrawEffects(state, p1State.leader);
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

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.deepEqual(result.events, []);
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
  assert.deepEqual(effectQueued.payload, {
    queueEntryId: `queue-entry:${String(attackDeclared.id)}:onOpponentAttack:${String(effect.id)}`,
    timingWindowId: `timing-window:${String(attackDeclared.id)}:onOpponentAttack`,
    generation: 0,
    effectBlockId: effect.id,
    triggerEventId: attackDeclared.id,
    sourcePresencePolicy: "mustRemainInSameZone",
    orderingGroup: "nonTurnPlayer",
  });
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
  assert.equal(counterBattle.step, "counter");
  assert.equal(counterBattle.counterPower, 1000);
  assert.equal(
    countered.events.some((event) => event.type === "counterUsed"),
    true,
  );
});

test("ENG-023B: defender timing waits until Block Step response completes", () => {
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
    opened.events.some((event) => event.type === "effectQueued"),
    false,
  );
  assert.equal(
    must(opened.state.players[p2], "opened p2").hand.length,
    beforeP2Hand,
  );

  const declined = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "block decision").id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(declined.errors, undefined);
  assert.equal(
    must(declined.state.players[p2], "declined p2").hand.length,
    beforeP2Hand + 2,
  );
  assert.equal(
    must(declined.state.players[p2], "declined p2").deck.length,
    beforeP2Deck - 1,
  );
  const decisionResolvedIndex = declined.events.findIndex(
    (event) => event.type === "decisionResolved",
  );
  const effectQueuedIndex = declined.events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const effectResolvedIndex = declined.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" && payload.effectBlockId === effect.id
    );
  });
  const damageIndex = declined.events.findIndex(
    (event) => event.type === "damageDealt",
  );

  assert.notEqual(decisionResolvedIndex, -1);
  assert.notEqual(effectQueuedIndex, -1);
  assert.notEqual(effectResolvedIndex, -1);
  assert.notEqual(damageIndex, -1);
  assert.ok(decisionResolvedIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < effectResolvedIndex);
  assert.ok(effectResolvedIndex < damageIndex);
});

test("ENG-023B: multiple same-player defender attack timing effects fail closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  withOnOpponentAttackDrawEffect(state, p2State.leader, "def-opp-leader");
  withOnOpponentAttackDrawEffect(state, defenderCharacter, "def-opp-character");
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

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("played-this-turn rush character attacks rested character through battle action surface", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rush attacker");
  const target = must(p2State.characters[0], "rested target");
  attacker.turnPlayed = state.turn.globalTurn;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rush"],
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  const result = applyDeclareAttack(state, {
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

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2 result").characters.length,
    0,
  );
  assert.equal(
    must(result.state.players[p2], "p2 result").trash.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(result.state.battle, undefined);
  assert.equal(
    result.events.some((event) => event.type === "cardKOd"),
    true,
  );
});

test("played-this-turn rushCharacter character can attack rested characters but not leaders", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rushCharacter attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  attacker.turnPlayed = state.turn.globalTurn;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rushCharacter"],
  });
  state.cardManifest.cards[restedTarget.cardId] = resolvedCard({
    cardId: restedTarget.cardId,
    category: "character",
    power: 3000,
  });

  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    false,
  );
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === restedTarget.instanceId,
    ),
    true,
  );

  const accepted = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: restedTarget.instanceId,
      cardId: restedTarget.cardId,
      playerId: p2,
    },
  });
  assert.equal(accepted.errors, undefined);
  assert.equal(
    must(accepted.state.players[p2], "p2 result").trash.some(
      (card) => card.instanceId === restedTarget.instanceId,
    ),
    true,
  );
});

test("played-this-turn rushCharacter character cannot attack leader through battle action surface", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rushCharacter attacker");
  attacker.turnPlayed = state.turn.globalTurn;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rushCharacter"],
  });
  const before = JSON.stringify(state);

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("played-this-turn non-rush character remains unable to attack through legal actions and battle application", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "non-rush attacker");
  attacker.turnPlayed = state.turn.globalTurn;
  const before = JSON.stringify(state);

  const legal = getDeclareAttackLegalActions(state, p1);
  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId,
    ),
    false,
  );
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("implemented-dsl no-keyword combat bodies can attack as normal without effect definitions", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  state.cardManifest.cards[attacker.cardId] = {
    ...resolvedCard({
      cardId: attacker.cardId,
      category: "character",
      power: 7000,
    }),
    support: {
      cardId: attacker.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.cards[target.cardId] = {
    ...resolvedCard({
      cardId: target.cardId,
      category: "character",
      power: 3000,
    }),
    support: {
      cardId: target.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };

  const legal = getDeclareAttackLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === target.instanceId,
    ),
    true,
  );
});

test("implemented-dsl combat bodies fail closed when an effect definition exists on a combat card", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  state.cardManifest.cards[attacker.cardId] = {
    ...resolvedCard({
      cardId: attacker.cardId,
      category: "character",
      power: 7000,
      printedKeywords: ["rush"],
    }),
    support: {
      cardId: attacker.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    onPlayDraw: effectDefinition(attacker.cardId, { type: "onPlay" }),
  };
  const before = JSON.stringify(state);

  const legal = getDeclareAttackLegalActions(state, p1);
  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(
    legal.some((action) => action.type === "declareAttack"),
    false,
  );
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("unsupported printed combat keywords do not enable played-this-turn character attacks", () => {
  const run = (printedKeywords: ["blocker" | "unblockable"]) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const attacker = must(p1State.characters[0], "unsupported attacker");
    attacker.turnPlayed = state.turn.globalTurn;
    state.cardManifest.cards[attacker.cardId] = {
      ...resolvedCard({
        cardId: attacker.cardId,
        category: "character",
        power: 7000,
      }),
      printedKeywords,
    };
    const before = JSON.stringify(state);

    const legal = getDeclareAttackLegalActions(state, p1);
    const result = applyDeclareAttack(state, {
      type: "declareAttack",
      attacker: {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: p1,
      },
      target: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
    });

    assert.equal(
      legal.some(
        (action) =>
          action.type === "declareAttack" &&
          action.attacker.instanceId === attacker.instanceId,
      ),
      false,
    );
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
    assert.deepEqual(result.events, []);
  };

  run(["blocker"]);
  run(["unblockable"]);
});

test("existing battle suppresses declareAttack legal actions and rejects applyAction", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 1,
  };

  assert.deepEqual(getDeclareAttackLegalActions(state, p1), []);

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
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("declareAttack rejection cases do not mutate input state", () => {
  const base = setupAttackState();
  const p1State = must(base.players[p1], "p1");
  const p2State = must(base.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
    actionOverride?: {
      attacker?: {
        instanceId: CardInstance["instanceId"];
        cardId: CardId;
        playerId: PlayerId;
      };
      target?: {
        instanceId: CardInstance["instanceId"];
        cardId: CardId;
        playerId: PlayerId;
      };
    },
  ) => {
    const state = setupAttackState();
    mutate(state);
    const before = JSON.stringify(state);
    const result = applyDeclareAttack(state, {
      type: "declareAttack",
      attacker: actionOverride?.attacker ?? {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: p1,
      },
      target: actionOverride?.target ?? {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
      },
    });
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };

  run((state) => {
    state.turn.phase = "draw";
  });
  run(() => {}, {
    attacker: {
      instanceId: must(base.players[p2], "p2 for attacker").leader.instanceId,
      cardId: must(base.players[p2], "p2 for attacker").leader.cardId,
      playerId: p2,
    },
  });
  run((state) => {
    must(state.players[p1], "rest p1").leader.state = "rested";
  });
  run((state) => {
    state.turn.globalTurn = 1;
    state.turn.playerTurnCounts[p1] = 1;
    state.turn.playerTurnCounts[p2] = 0;
  });
  run(
    (state) => {
      const character = must(
        must(state.players[p1], "p1 char").characters[0],
        "char",
      );
      character.turnPlayed = state.turn.globalTurn;
    },
    {
      attacker: {
        instanceId: must(
          must(base.players[p1], "p1 char ref").characters[0],
          "p1 char ref card",
        ).instanceId,
        cardId: must(
          must(base.players[p1], "p1 char ref").characters[0],
          "p1 char ref card",
        ).cardId,
        playerId: p1,
      },
    },
  );
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["doubleAttack"],
    };
  });
  run(() => {}, {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: toCardId("forged-attacker"),
      playerId: p1,
    },
  });
  run(() => {}, {
    target: {
      instanceId: target.instanceId,
      cardId: toCardId("forged-target"),
      playerId: p2,
    },
  });
});
