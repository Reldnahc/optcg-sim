import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  getDeclareAttackLegalActions,
} from "./battle-actions.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  addTrashMarker,
  continuousKeywordEffectRecord,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";

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

test("conditional continuous rush grant lets played-this-turn character attack leader and rested character", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rush attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  attacker.turnPlayed = state.turn.globalTurn;
  addTrashMarker(state, p1);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-rush-grant",
      attacker,
      "rush",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
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

test("conditional continuous rushCharacter grant allows rested Character targets only", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "rushCharacter attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  attacker.turnPlayed = state.turn.globalTurn;
  addTrashMarker(state, p1);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-rush-character-grant",
      attacker,
      "rushCharacter",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];

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
});

test("legal attack projection omits continuous Double Attack leader target when defender has computed Blocker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const defenderBlocker = must(p2State.characters[0], "computed blocker");
  defenderBlocker.state = "active";
  addTrashMarker(state, p1);
  addTrashMarker(state, p2);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-double-attack-grant",
      attacker,
      "doubleAttack",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
    continuousKeywordEffectRecord(
      state,
      "conditional-blocker-grant",
      defenderBlocker,
      "blocker",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];

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
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    false,
  );
  const error = must(result.errors?.[0], "illegal action error");
  assert.equal(error.type, "illegalAction");
  assert.equal(
    error.reason,
    "declareAttack requires unsupported blocker handling for Double Attack.",
  );
});

test("fallback legal attack projection omits printed Double Attack leader target when defender has computed Blocker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const defenderBlocker = must(p2State.characters[0], "computed blocker");
  defenderBlocker.state = "active";
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
    printedKeywords: ["doubleAttack"],
    support: { status: "implemented-dsl" },
  });
  addTrashMarker(state, p2);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-blocker-grant",
      defenderBlocker,
      "blocker",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];

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
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    false,
  );
  const error = must(result.errors?.[0], "illegal action error");
  assert.equal(error.type, "illegalAction");
  assert.equal(
    error.reason,
    "declareAttack requires unsupported blocker handling for Double Attack.",
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
