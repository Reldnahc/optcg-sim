import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { getLegalActions } from "./actions.js";
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

const setupLeaderBattleWithDamageCount = (
  damageCount: number,
  options: { doubleAttack?: boolean; unsupportedDoubleAttack?: boolean } = {},
) => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  if (
    options.doubleAttack === true ||
    options.unsupportedDoubleAttack === true
  ) {
    const attacker = p1State.leader;
    const doubleAttackCard = resolvedCard({
      cardId: attacker.cardId,
      category: "leader",
      power: 5000,
    });
    state.cardManifest.cards[attacker.cardId] = {
      ...doubleAttackCard,
      support: {
        ...doubleAttackCard.support,
        status:
          options.doubleAttack === true
            ? "implemented-dsl"
            : doubleAttackCard.support.status,
      },
      printedKeywords: ["doubleAttack"],
    };
  }
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
    damageCount,
  };
  return state;
};

const installSupportedLifeTriggerOnTopLife = (
  state: ReturnType<typeof setupAttackState>,
) => {
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("double-attack-trigger-life");
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
      effectDefinitionId: "def-double-attack-life-trigger",
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
    "def-double-attack-life-trigger": supported,
  };
};

const installSupportedDoubleAttackLeader = (
  state: ReturnType<typeof setupAttackState>,
) => {
  const p1State = must(state.players[p1], "p1");
  const attacker = p1State.leader;
  const doubleAttackCard = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[attacker.cardId] = {
    ...doubleAttackCard,
    support: {
      ...doubleAttackCard.support,
      status: "implemented-dsl",
    },
    printedKeywords: ["doubleAttack"],
  };
};

test("double attack leader damage processes two life cards sequentially", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life").card.instanceId;
  const secondLife = must(p2State.life[1], "second life").card.instanceId;
  const beforeLife = p2State.life.length;
  const beforeHand = p2State.hand.length;

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(nextP2.hand.length, beforeHand + 2);
  assert.equal(nextP2.hand[0]?.instanceId, secondLife);
  assert.equal(nextP2.hand[1]?.instanceId, topLife);
  const movementEvents = result.events.filter(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );
  assert.equal(movementEvents.length >= 2, true);
  const firstMove = movementEvents[0];
  const secondMove = movementEvents[1];
  assert.equal(
    (firstMove?.payload as { instanceId: string }).instanceId,
    topLife,
  );
  assert.equal(
    (secondMove?.payload as { instanceId: string }).instanceId,
    secondLife,
  );
  const damageAndLifeEvents = result.events
    .filter(
      (event) => event.type === "damageDealt" || event.type === "lifeTaken",
    )
    .map((event) => event.type);
  assert.deepEqual(damageAndLifeEvents, [
    "damageDealt",
    "lifeTaken",
    "damageDealt",
    "lifeTaken",
  ]);
});

test("damageCount values other than one or two fail closed without mutation", () => {
  for (const damageCount of [0, 3]) {
    const state = setupLeaderBattleWithDamageCount(damageCount);
    const before = JSON.stringify(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.deepEqual(result.errors, [
      {
        type: "illegalAction",
        reason:
          "Battle requires unsupported blocker, step, or multi-damage behavior.",
      },
    ]);
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  }
});

test("two damage without Double Attack source fails closed without mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2);
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported keyword or protection handling.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("unsupported Double Attack metadata cannot bypass source gate through direct resolution", () => {
  const state = setupLeaderBattleWithDamageCount(2, {
    unsupportedDoubleAttack: true,
  });
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported keyword or protection handling.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("two damage over supported Life Trigger fails closed before mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  installSupportedLifeTriggerOnTopLife(state);
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason:
        "Life trigger reveal decisions are unsupported in this battle path.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("supported doubleAttack declareAttack against leader applies two damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  installSupportedDoubleAttackLeader(state);
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
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});

test("getLegalActions exposes supported doubleAttack declareAttack against leader", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  installSupportedDoubleAttackLeader(state);

  const legal = getLegalActions(state, p1);

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

test("supported doubleAttack declareAttack with available blocker fails closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "p2 blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  installSupportedDoubleAttackLeader(state);
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
      reason:
        "declareAttack requires unsupported blocker handling for Double Attack.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("getLegalActions omits supported doubleAttack leader attack when blocker handling is unsupported", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "p2 blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  installSupportedDoubleAttackLeader(state);

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    false,
  );
});
