import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction } from "./actions.js";
import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
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
} from "./battle-actions-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const applySupportedLifeTriggerAttack = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life");
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  const definition = effectDefinition(lifeCardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  const supported = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
  state.cardManifest.cards[lifeCardId] = {
    ...resolvedCard({
      cardId: lifeCardId,
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: draw 1 card",
    support: {
      cardId: lifeCardId,
      status: "implemented-dsl",
      effectDefinitionId: "def-life-trigger",
      tested: true,
      rulesVersion: supported.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: supported.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-trigger": supported,
  };

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
  return { result, lifeCardId };
};
test("banish attacker dealing leader damage moves top life to trash instead of hand", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const expectedLifeCard = must(p2State.life[0], "top life").card.instanceId;
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    false,
  );
});

test("banish leader damage reindexes life and trash zones deterministically", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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

  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(result.errors, undefined);
  assert.deepEqual(
    nextP2.life.map((lifeCard) => lifeCard.card.zone),
    nextP2.life.map((_, index) => ({
      zone: "life",
      playerId: p2,
      slot: "life",
      index,
    })),
  );
  assert.deepEqual(
    nextP2.trash.map((card) => card.zone),
    nextP2.trash.map((_, index) => ({
      zone: "trash",
      playerId: p2,
      slot: "trash",
      index,
    })),
  );
});

test("banish public cardMoved event does not expose life card identity and private event does", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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

  const publicCardMoved = result.events.find(
    (event) => event.type === "cardMoved" && event.visibility.type === "public",
  );
  const privateCardMoved = result.events.find(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );

  assert.ok(publicCardMoved !== undefined);
  assert.equal(
    "instanceId" in (publicCardMoved.payload as Record<string, unknown>),
    false,
  );
  assert.equal(
    "cardId" in (publicCardMoved.payload as Record<string, unknown>),
    false,
  );
  assert.ok(privateCardMoved !== undefined);
  assert.equal(privateCardMoved.visibility.type, "private");
  assert.equal(privateCardMoved.visibility.playerId, p2);
  assert.equal(
    "instanceId" in (privateCardMoved.payload as Record<string, unknown>),
    true,
  );
});

test("banish damage on trigger life card does not create life trigger decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: toCardId("trigger-life") },
  };
  state.cardManifest.cards[toCardId("trigger-life")] = {
    ...resolvedCard({
      cardId: toCardId("trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: do a thing",
  };
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

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
  assert.equal(result.decisions, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.cardId === toCardId("trigger-life"),
    ),
    true,
  );
});

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

test("banish attacker with pending runtime queue or deferred trigger fails closed without mutation", () => {
  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
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
    state.cardManifest.cards[p1State.leader.cardId] = {
      ...resolvedCard({
        cardId: p1State.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
    };
    mutate(state);
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.deepEqual(result.errors, [
      {
        type: "illegalAction",
        reason:
          "Battle requires unsupported trigger or replacement processing.",
      },
    ]);
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  run((state) => {
    state.effectQueue = [{ id: "queued-effect-banish" } as never];
  });
  run((state) => {
    state.deferredTriggers = [{ timingWindowId: "window-banish" } as never];
  });
});

test("banish attacker with replacement metadata fails closed without mutation", () => {
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
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  state.replacementState.push({
    processId: "replacement-process-banish",
    type: "damage",
    usedReplacementIds: [],
    payload: { hidden: "contents" },
  });
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported trigger or replacement processing.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("banish attacker with unsupported blocker metadata fails closed without mutation", () => {
  const runBlockStep = () => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.cardManifest.cards[p1State.leader.cardId] = {
      ...resolvedCard({
        cardId: p1State.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
    };
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
      step: "block",
      damageCount: 1,
    };
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  const runBlockerMetadata = () => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.cardManifest.cards[p1State.leader.cardId] = {
      ...resolvedCard({
        cardId: p1State.leader.cardId,
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
    };
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
      blocker: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
    };
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  };

  runBlockStep();
  runBlockerMetadata();
});

test("applyAction declareAttack creates life trigger decision for supported trigger life damage", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life");
  const beforeLifeCount = p2State.life.length;
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  const definition = effectDefinition(lifeCardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  const supported = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
  state.cardManifest.cards[lifeCardId] = {
    ...resolvedCard({
      cardId: lifeCardId,
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: draw 1 card",
    support: {
      cardId: lifeCardId,
      status: "implemented-dsl",
      effectDefinitionId: "def-life-trigger",
      tested: true,
      rulesVersion: supported.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: supported.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-trigger": supported,
  };

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
  const pendingDecision = must(
    result.state.pendingDecision,
    "pending decision",
  );
  assert.equal(pendingDecision.type, "confirmLifeTrigger");
  assert.deepEqual(pendingDecision.options, ["activateTrigger", "addToHand"]);
  assert.equal(pendingDecision.playerId, p2);
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(
    nextP2.hand.some((card) => card.cardId === lifeCardId),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.cardId === lifeCardId),
    false,
  );
  assert.equal(
    nextP2.life.some((lifeCard) => lifeCard.card.cardId === lifeCardId),
    false,
  );
  assert.equal(pendingDecision.card.cardId, lifeCardId);
  assert.equal(pendingDecision.card.zone, undefined);
  assert.equal(nextP2.life.length, beforeLifeCount - 1);
  assert.equal(
    filterStateForPlayer(result.state, p1).opponent.life.count,
    beforeLifeCount - 1,
  );
  assert.equal(
    filterStateForPlayer(result.state, p2).self.life.count,
    beforeLifeCount - 1,
  );
  const opponentView = filterStateForPlayer(result.state, p1);
  assert.equal(
    JSON.stringify(opponentView.events).includes("confirmLifeTrigger"),
    false,
  );
  assert.equal(
    JSON.stringify(opponentView.events).includes(String(pendingDecision.id)),
    false,
  );
  assert.equal(
    JSON.stringify(opponentView.events).includes(String(lifeCardId)),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "lifeTaken"),
    true,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        event.visibility.type === "private" &&
        (event.payload as { cardId?: string }).cardId === lifeCardId,
    ),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "decisionCreated"),
    true,
  );
});

test("respondToDecision addToHand declines life trigger and moves taken card to hand hidden", () => {
  const opened = applySupportedLifeTriggerAttack();
  const pendingDecision = must(
    opened.result.state.pendingDecision,
    "pending life trigger decision",
  );
  const beforeHandCount = must(opened.result.state.players[p2], "p2").hand
    .length;

  const result = applyAction(opened.result.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });
  const replay = applyAction(structuredClone(opened.result.state), {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.equal(result.errors, undefined);
  assert.equal(replay.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.deepEqual(result.events, replay.events);
  assert.equal(result.stateHash, replay.stateHash);
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(nextP2.hand.length, beforeHandCount + 1);
  const movedCard = must(nextP2.hand[0], "moved life trigger card");
  assert.equal(movedCard.cardId, opened.lifeCardId);
  assert.equal(movedCard.zone.zone, "hand");
  assert.equal(
    nextP2.trash.some((card) => card.cardId === opened.lifeCardId),
    false,
  );
  assert.equal(result.state.revealedCards.length, 0);
  const firstEvent = must(result.events[0], "decisionResolved event");
  assert.equal(firstEvent.type, "decisionResolved");
  assert.equal(firstEvent.visibility.type, "private");
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        event.visibility.type === "public" &&
        "cardId" in (event.payload as Record<string, unknown>),
    ),
    false,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        event.visibility.type === "private" &&
        (event.payload as { cardId?: string }).cardId === opened.lifeCardId,
    ),
    true,
  );

  const opponentView = filterStateForPlayer(result.state, p1);
  assert.equal(
    JSON.stringify(opponentView).includes(String(opened.lifeCardId)),
    false,
  );
  assert.equal(
    JSON.stringify(opponentView).includes("confirmLifeTrigger"),
    false,
  );
  assert.equal(JSON.stringify(opponentView).includes("lifeTrigger"), false);
  assert.deepEqual(
    opponentView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
});

test("respondToDecision addToHand rejects malformed life trigger responses without mutation", () => {
  const opened = applySupportedLifeTriggerAttack();
  const pendingDecision = must(
    opened.result.state.pendingDecision,
    "pending life trigger decision",
  );
  const before = JSON.stringify(opened.result.state);

  const malformed = applyAction(opened.result.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "orderedIds", ids: [] },
  });
  const missingCardState = structuredClone(opened.result.state);
  missingCardState.cardManifest.cards = Object.fromEntries(
    Object.entries(missingCardState.cardManifest.cards).filter(
      ([cardId]) => cardId !== String(opened.lifeCardId),
    ),
  );
  const missingCard = applyAction(missingCardState, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.deepEqual(malformed.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Response type must be lifeTrigger for confirmLifeTrigger.",
    },
  ]);
  assert.deepEqual(missingCard.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger card metadata is missing.",
    },
  ]);
  assert.equal(JSON.stringify(malformed.state), before);
  assert.equal(
    JSON.stringify(missingCard.state),
    JSON.stringify(missingCardState),
  );
  assert.deepEqual(malformed.events, []);
  assert.deepEqual(missingCard.events, []);
});
