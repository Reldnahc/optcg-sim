import assert from "node:assert/strict";
import { test } from "vitest";

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
  continuousEffectRecord,
  effectDefinition,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";
test("supported declareAttack resolves vanilla battle internally without continuation action", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const beforeLifeP1 = p1State.life.length;
  const beforeLifeP2 = p2State.life.length;
  const beforeTrashP1 = p1State.trash.length;
  const beforeTrashP2 = p2State.trash.length;
  const seqBefore = state.seq;
  const actionSeqBefore = state.actionSeq;

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
  assert.equal(must(result.state.players[p1], "p1").leader.state, "rested");
  assert.equal(result.state.battle, undefined);
  assert.equal(
    result.events.some((event) => event.type === "attackDeclared"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  assert.equal(must(result.state.players[p1], "p1").life.length, beforeLifeP1);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLifeP2 - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").trash.length,
    beforeTrashP1,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.length,
    beforeTrashP2,
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
  assert.deepEqual(
    result.events.map((event) => event.seq),
    [...new Set(result.events.map((event) => event.seq))],
  );
  assert.equal(
    result.state.seq,
    ((seqBefore as number) + 1) as typeof state.seq,
  );
  assert.equal(result.state.actionSeq, actionSeqBefore + 1);
  assert.equal(
    result.events.every(
      (event) => event.createdAtStateSeq === result.state.seq,
    ),
    true,
  );
});

test("leader damage at 0 life completes the match for the attacker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.life = [];
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
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
  assert.equal(
    result.events.some((event) => event.type === "gameEnded"),
    true,
  );
});

test("rule-processing checkpoint decks out defending player after accepted mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.deck = [];

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
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
});

test("life orientation uses player.life[0] as next damage card", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const expectedLifeCard = must(p2State.life[0], "top life").card.instanceId;
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
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    true,
  );
});

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

test("public life movement events do not expose life card ids, while private event includes details", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
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
  assert.ok(privateCardMoved !== undefined);
  assert.equal(privateCardMoved.visibility.type, "private");
  assert.equal(privateCardMoved.visibility.playerId, p2);
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

test("reviewed supported On K.O. metadata allows battle K.O. candidate detection without queueing", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
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

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 0);
  assert.equal(
    must(result.state.players[p2], "p2").trash[0]?.instanceId,
    target.instanceId,
  );
});

test("supported vanilla battle rejects pending runtime queues without mutation or appended events", () => {
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
    state.effectQueue = [{ id: "queued-effect" } as never];
  });
  run((state) => {
    state.deferredTriggers = [{ timingWindowId: "window-1" } as never];
  });
  run((state) => {
    state.continuousEffects = [
      continuousEffectRecord(state, "active-continuous-effect", {
        type: "thisBattle",
      }),
    ];
  });
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

test("supported vanilla battle preserves replacement fail-closed behavior", () => {
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
  state.replacementState.push({
    processId: "replacement-process-1",
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

test("applyAction declareAttack fails closed without mutation when vanilla continuation is unsupported", () => {
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
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});
