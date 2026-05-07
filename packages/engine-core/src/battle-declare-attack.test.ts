import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, CardInstance, PlayerId } from "@optcg/types";

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
} from "./battle-actions-test-fixtures.js";
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
