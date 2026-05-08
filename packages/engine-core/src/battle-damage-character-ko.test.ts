import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  effectDefinition,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";

test("equal-or-greater power K.O.s rested character and returns attached DON!! rested", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const don = must(p2State.donDeck[0], "p2 don");
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
    },
  ];
  target.attachedDon = [don.instanceId];
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
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
  assert.equal(must(result.state.players[p2], "p2").characters.length, 0);
  assert.equal(must(result.state.players[p2], "p2").trash.length >= 1, true);
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
});

test("banish attacker against rested character still K.O.s normally and returns attached DON!!", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const beforeLife = p2State.life.length;
  const don = must(p2State.donDeck[0], "p2 don");
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
    },
  ];
  target.attachedDon = [don.instanceId];
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["banish"],
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
  assert.equal(must(result.state.players[p2], "p2").characters.length, 0);
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
});

test("character K.O. reindexes surviving defender characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const survivor = must(p2State.hand[0], "second defender");
  p2State.characters.push({
    ...survivor,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "rested",
    attachedDon: [],
    turnPlayed: 1,
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  state.cardManifest.cards[survivor.cardId] = resolvedCard({
    cardId: survivor.cardId,
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

  const defender = must(result.state.players[p2], "p2");
  assert.equal(result.errors, undefined);
  assert.equal(defender.characters.length, 1);
  const remainingCharacter = must(defender.characters[0], "remaining defender");
  assert.equal(remainingCharacter.instanceId, survivor.instanceId);
  assert.deepEqual(remainingCharacter.zone, {
    zone: "characterArea",
    playerId: p2,
    slot: "character",
    index: 0,
  });
});

test("lower-power attack causes no K.O. and no life movement", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 2000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 7000,
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
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 1);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
});

test("reviewed supported On K.O. metadata resolves after battle K.O. events", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const beforeDeck = p2State.deck.length;
  const beforeHand = p2State.hand.length;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definition = effectDefinition(target.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const onKODefinition = {
    ...definition,
    effects: [
      {
        ...onKOEffect,
        sourcePresencePolicy: "resolveFromDestinationZone" as const,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-on-ko": onKODefinition,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    effectText: "[On K.O.] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-on-ko",
      rulesVersion: onKODefinition.metadata.rulesVersion,
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });

  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    step: "counter",
    damageCount: 1,
  };

  const result = resolveSupportedVanillaBattle(state);
  const replay = resolveSupportedVanillaBattle(structuredClone(state));

  assert.equal(result.errors, undefined);
  assert.equal(replay.errors, undefined);
  assert.deepEqual(replay.events, result.events);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(replay.state.effectQueue, []);
  assert.equal(replay.stateHash, result.stateHash);
  const cardKOdIndex = result.events.findIndex(
    (event) => event.type === "cardKOd",
  );
  const cardMovedIndex = result.events.findIndex(
    (event) => event.type === "cardMoved",
  );
  const effectQueuedIndex = result.events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const cardKOd = must(result.events[cardKOdIndex], "cardKOd event");
  const cardMoved = must(result.events[cardMovedIndex], "cardMoved event");
  const effectQueued = must(
    result.events[effectQueuedIndex],
    "effectQueued event",
  );
  const onKOResolved = result.events.find(
    (event) =>
      event.type === "effectResolved" &&
      (event.payload as { effectBlockId?: unknown }).effectBlockId ===
        onKOEffect.id,
  );
  const onKOResolvedIndex = result.events.findIndex(
    (event) => event === onKOResolved,
  );
  const nextP2 = must(result.state.players[p2], "p2");

  assert.equal(cardKOdIndex >= 0, true);
  assert.equal(cardMovedIndex > cardKOdIndex, true);
  assert.equal(effectQueuedIndex > cardMovedIndex, true);
  assert.equal(onKOResolvedIndex > effectQueuedIndex, true);
  assert.equal(
    result.events.map((event) => event.id).length,
    new Set(result.events.map((event) => event.id)).size,
  );
  assert.equal(
    result.events.filter((event) => event.type === "effectResolved").length,
    2,
  );
  const queuedId = `queue-entry:${String(cardKOd.id)}:${String(onKOEffect.id)}`;
  const timingWindowId = `timing-window:${String(cardKOd.id)}:onKO`;
  assert.deepEqual(effectQueued.payload, {
    queueEntryId: queuedId,
    timingWindowId,
    generation: 0,
    effectBlockId: onKOEffect.id,
    triggerEventId: cardKOd.id,
    sourcePresencePolicy: "resolveFromDestinationZone",
    orderingGroup: "nonTurnPlayer",
  });
  assert.deepEqual(effectQueued.causedBy, {
    type: "ruleProcess",
    name: "effectRuntime:onKOTriggerQueueing",
  });
  assert.ok(onKOResolved !== undefined);
  assert.deepEqual(onKOResolved.payload, {
    queueEntryId: queuedId,
    timingWindowId,
    generation: 0,
    effectBlockId: onKOEffect.id,
    triggerEventId: cardKOd.id,
    sourcePresencePolicy: "resolveFromDestinationZone",
    orderingGroup: "nonTurnPlayer",
    status: "resolved",
  });
  assert.equal(
    (cardMoved.payload as { instanceId?: unknown }).instanceId,
    target.instanceId,
  );
  assert.equal(nextP2.characters.length, 0);
  assert.equal(nextP2.trash[0]?.instanceId, target.instanceId);
  assert.equal(nextP2.deck.length, beforeDeck - 1);
  assert.equal(nextP2.hand.length, beforeHand + 1);
});

test("invalid supported battle runtime metadata on a non-K.O. combat participant fails closed", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const definition = effectDefinition(attacker.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const onKODefinition = {
    ...definition,
    effects: [
      {
        ...onKOEffect,
        sourcePresencePolicy: "resolveFromDestinationZone" as const,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-invalid-attacker-on-ko": onKODefinition,
  };
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    effectText: "[On K.O.] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-invalid-attacker-on-ko",
      rulesVersion: "mismatched-rules-version",
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    step: "counter",
    damageCount: 1,
  };
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported effect metadata.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});
