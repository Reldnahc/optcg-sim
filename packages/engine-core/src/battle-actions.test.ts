import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  DecisionId,
  EffectDefinition,
  PlayerId,
} from "@optcg/types";

import {
  applyDeclareAttack,
  getDeclareAttackLegalActions,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";

const cardRef = (card: CardInstance, playerId: PlayerId) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const effectDefinition = (
  cardId: CardId,
  trigger: EffectDefinition["effects"][number]["trigger"],
  effect: EffectDefinition["effects"][number]["effect"] = {
    type: "draw",
    count: 1,
    player: "self",
  },
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: `${String(cardId)}:effect:1` as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger,
      optional: false,
      oncePerTurn: false,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect,
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

const setupOpenedBlockStepDecision = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  return {
    opened,
    openedState: opened.state,
    p1State,
    p2State,
    defenderBlocker,
    decision: must(opened.state.pendingDecision, "pending decision"),
  };
};

const setupOpenedCharacterTargetBlockStepDecision = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const originalTarget = must(p2State.characters[0], "original target");
  const blockerSource = must(p2State.hand[0], "blocker source");
  const defenderBlocker = {
    ...blockerSource,
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p2State.characters.push(defenderBlocker);
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[originalTarget.cardId] = resolvedCard({
    cardId: originalTarget.cardId,
    category: "character",
    power: 3000,
  });
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(originalTarget, p2),
  });
  assert.equal(opened.errors, undefined);
  return {
    opened,
    openedState: opened.state,
    p1State,
    p2State,
    attacker,
    originalTarget,
    defenderBlocker,
    decision: must(opened.state.pendingDecision, "pending decision"),
  };
};

const setupOpenedCounterStepPassDecision = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  return {
    opened,
    openedState: opened.state,
    p1State,
    p2State,
    counterCard,
    decision: must(opened.state.pendingDecision, "pending decision"),
  };
};

const assertRejectsWithoutMutation = (
  state: ReturnType<typeof setupAttackState>,
  response: Parameters<typeof applyAction>[1],
) => {
  const before = JSON.stringify(state);
  const result = applyAction(state, response);
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
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

test("resolveSupportedVanillaBattle rejects when no active battle", () => {
  const state = setupAttackState();
  const before = JSON.stringify(state);
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
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

test("unsupported trigger/blocker/counter/doubleAttack windows fail closed without mutation", () => {
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
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };
  run((state) => {
    must(state.players[p2], "p2").life[0] = {
      ...must(must(state.players[p2], "p2").life[0], "life"),
      card: {
        ...must(must(state.players[p2], "p2").life[0], "life").card,
        cardId: toCardId("trigger-life"),
      },
    };
    state.cardManifest.cards[toCardId("trigger-life")] = {
      ...resolvedCard({
        cardId: toCardId("trigger-life"),
        category: "character",
        power: 1000,
      }),
      triggerText: "TRIGGER: do a thing",
    };
  });
  run((state) => {
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
      step: "block",
      damageCount: 1,
    };
  });
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
});

test("banish combined with doubleAttack fails closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish", "doubleAttack"],
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

test("counter-step legal actions expose only defender pass response", () => {
  const { opened, decision } = setupOpenedCounterStepPassDecision();

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
  ]);
  assert.deepEqual(getLegalActions(opened.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
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

test("Counter Event metadata remains unsupported and does not auto-pass or mutate state", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
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

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("applyDeclareAttack enters block step and opens defender decline decision when defender has would-be legal blocker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  defenderBlocker.state = "active";
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
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
  const battle = must(result.state.battle, "block step battle");
  assert.equal(battle.step, "block");
  assert.equal(battle.blocker, undefined);
  assert.deepEqual(result.state.pendingDecision, {
    id: must(result.state.pendingDecision, "pending decision").id,
    type: "selectCards",
    playerId: p2,
    prompt: "Choose blocker or decline.",
    causedBy: must(result.state.pendingDecision, "pending decision").causedBy,
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "nonTurnPlayer",
      player: "nonTurnPlayer",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
    candidates: [
      {
        card: cardRef(defenderBlocker, p2),
        visibility: { type: "public" },
      },
    ],
    defaultResponse: { type: "cards", cards: [] },
  });
  assert.equal(
    must(result.state.pendingDecision, "pending decision").causedBy.type,
    "playerAction",
  );
  const decisionCreated = result.events.find(
    (event) => event.type === "decisionCreated",
  );
  const createdEvent = must(decisionCreated, "decisionCreated event");
  assert.deepEqual(createdEvent.visibility, { type: "public" });
  assert.deepEqual(createdEvent.payload, {
    decisionId: must(result.state.pendingDecision, "pending decision").id,
    decisionType: "selectCards",
    playerId: p2,
  });
  assert.deepEqual(
    result.events.map((event) => event.seq),
    [
      state.eventJournal.length + 1,
      state.eventJournal.length + 2,
      state.eventJournal.length + 3,
    ],
  );
  const replay = applyDeclareAttack(structuredClone(state), {
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
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("empty block-step respondToDecision declines and resumes existing no-block battle resolution path", () => {
  const { opened, decision: pending } = setupOpenedBlockStepDecision();

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(
    result.events.some((event) => event.type === "decisionResolved"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  const decisionResolved = result.events.find(
    (event) => event.type === "decisionResolved",
  );
  const resolvedEvent = must(decisionResolved, "decisionResolved event");
  assert.deepEqual(resolvedEvent.visibility, { type: "public" });
  assert.deepEqual(resolvedEvent.payload, {
    decisionId: pending.id,
    playerId: p2,
  });
  assert.equal(result.events[0]?.type, "decisionResolved");
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "cards", cards: [] },
  });
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("blocker selection response K.O.s blocker, clears battle, and preserves original Leader life", () => {
  const { opened, p2State, defenderBlocker, decision } =
    setupOpenedBlockStepDecision();
  const originalTarget = cardRef(p2State.leader, p2);
  const blocker = cardRef(defenderBlocker, p2);
  const beforeLife = p2State.life.length;

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.actionSeq, opened.state.actionSeq + 1);
  assert.equal(result.state.battle, undefined);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === defenderBlocker.instanceId,
    ),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === defenderBlocker.instanceId,
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
        type: "decisionResolved",
        payload: { decisionId: decision.id, playerId: p2 },
        visibility: { type: "public" },
      },
      {
        type: "blockerActivated",
        payload: {
          blocker,
          previousTarget: originalTarget,
          currentTarget: blocker,
        },
        visibility: { type: "public" },
      },
      {
        type: "damageDealt",
        payload: {
          attacker: opened.state.battle?.attacker.instanceId,
          target: blocker.instanceId,
          amount: 1,
        },
        visibility: { type: "public" },
      },
      {
        type: "cardKOd",
        payload: { playerId: p2, instanceId: blocker.instanceId },
        visibility: { type: "public" },
      },
      {
        type: "cardMoved",
        payload: {
          from: defenderBlocker.zone,
          to: {
            zone: "trash",
            playerId: p2,
            slot: "trash",
            index: 0,
          },
          reason: "ko",
        },
        visibility: { type: "public" },
      },
      {
        type: "effectResolved",
        payload: { systemStep: "endBattle", battleCleared: true },
        visibility: { type: "replayOnly" },
      },
      {
        type: "ruleProcessingChecked",
        payload: { phase: "main", result: "ok" },
        visibility: { type: "replayOnly" },
      },
    ],
  );
});

test("attached DON!! returns rested when a blocker is K.O.'d", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const openedP2 = must(opened.state.players[p2], "opened p2");
  const don = must(openedP2.donDeck[0], "p2 don");
  openedP2.donDeck = openedP2.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  openedP2.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  const openedBlocker = must(openedP2.characters[0], "opened blocker");
  openedP2.characters[0] = {
    ...openedBlocker,
    attachedDon: [don.instanceId],
  };
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "donReturned" &&
        (event.payload as { donInstanceId?: unknown }).donInstanceId ===
          don.instanceId &&
        event.visibility.type === "replayOnly",
    ),
    true,
  );
});

test("original Character target is not K.O.'d after being blocked", () => {
  const { opened, originalTarget, defenderBlocker, decision } =
    setupOpenedCharacterTargetBlockStepDecision();
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === originalTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === originalTarget.instanceId,
    ),
    false,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardKOd" &&
        (event.payload as { instanceId?: unknown }).instanceId ===
          originalTarget.instanceId,
    ),
    false,
  );
});

test("lower-power attack into blocker clears battle without K.O. or Life movement", () => {
  const context = setupOpenedBlockStepDecision();
  context.opened.state.cardManifest.cards[toCardId("leader-red")] =
    resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 2000,
    });
  context.opened.state.cardManifest.cards[context.defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: context.defenderBlocker.cardId,
      category: "character",
      power: 7000,
    }),
    printedKeywords: ["blocker"],
  };
  const blocker = cardRef(context.defenderBlocker, p2);
  const beforeLife = must(context.opened.state.players[p2], "p2").life.length;

  const result = applyAction(context.opened.state, {
    type: "respondToDecision",
    decisionId: context.decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    true,
  );
  assert.equal(
    result.events.some((event) =>
      ["damageDealt", "lifeTaken", "cardKOd", "cardMoved"].includes(event.type),
    ),
    false,
  );
});

test("Banish attacker blocked by Character causes no Life movement or Life trashing", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const openedP2 = must(opened.state.players[p2], "opened p2");
  const expectedLifeCards = openedP2.life.map((lifeCard) => lifeCard.card);
  opened.state.cardManifest.cards[toCardId("leader-red")] = {
    ...resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(result.errors, undefined);
  assert.equal(nextP2.life.length, expectedLifeCards.length);
  assert.deepEqual(
    nextP2.life.map((lifeCard) => lifeCard.card.instanceId),
    expectedLifeCards.map((card) => card.instanceId),
  );
  assert.equal(
    expectedLifeCards.some((lifeCard) =>
      nextP2.trash.some((card) => card.instanceId === lifeCard.instanceId),
    ),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === defenderBlocker.instanceId),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "lifeTaken"),
    false,
  );
});

test("supported blocked-battle resolution is deterministic", () => {
  const { opened, defenderBlocker, decision } = setupOpenedBlockStepDecision();
  const blocker = cardRef(defenderBlocker, p2);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [blocker] },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "blockerActivated",
      "damageDealt",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
      { type: "replayOnly" },
    ],
  );
  assert.deepEqual(
    result.events.map((event) => event.seq),
    result.events.map(
      (_, index) => opened.state.eventJournal.length + index + 1,
    ),
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
  assert.equal(
    result.stateHash,
    "42d15e4d79663614651e08b19d02c7bd7cd564439037fc821da160789b6229b8",
  );
  assert.equal(result.stateHash, replay.stateHash);
  assert.deepEqual(result.events, replay.events);
});

test("rested, stale, non-blocker, and attacker-controlled cards do not open block-step decision", () => {
  const runNoDecision = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    mutate(state);
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
    assert.equal(result.state.pendingDecision, undefined);
    assert.equal(result.state.battle, undefined);
    assert.equal(
      result.events.some((event) => event.type === "decisionCreated"),
      false,
    );
  };

  runNoDecision((state) => {
    const p2State = must(state.players[p2], "p2");
    const blocker = must(p2State.characters[0], "rested blocker");
    blocker.state = "rested";
    state.cardManifest.cards[blocker.cardId] = {
      ...resolvedCard({
        cardId: blocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
  });
  runNoDecision((state) => {
    const p2State = must(state.players[p2], "p2");
    const blocker = must(p2State.characters[0], "stale blocker");
    blocker.state = "active";
    state.cardManifest.cards[blocker.cardId] = {
      ...resolvedCard({
        cardId: blocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
    p2State.characters = [];
  });
  runNoDecision((state) => {
    const p2State = must(state.players[p2], "p2");
    const nonBlocker = must(p2State.characters[0], "non blocker");
    nonBlocker.state = "active";
    state.cardManifest.cards[nonBlocker.cardId] = resolvedCard({
      cardId: nonBlocker.cardId,
      category: "character",
      power: 3000,
      printedKeywords: [],
    });
  });
  runNoDecision((state) => {
    const p1State = must(state.players[p1], "p1");
    const attackerControlled = must(
      p1State.characters[0],
      "attacker controlled blocker",
    );
    attackerControlled.state = "active";
    state.cardManifest.cards[attackerControlled.cardId] = {
      ...resolvedCard({
        cardId: attackerControlled.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
  });
});

test("ineligible printed blocker does not open block-step decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attackerControlledBlocker = must(
    p1State.characters[0],
    "attacker controlled blocker",
  );
  attackerControlledBlocker.state = "rested";
  state.cardManifest.cards[attackerControlledBlocker.cardId] = {
    ...resolvedCard({
      cardId: attackerControlledBlocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
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
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
});

test("invalid blocker selections reject without mutation or events", () => {
  const run = (
    mutate: (context: ReturnType<typeof setupOpenedBlockStepDecision>) => void,
    choose: (context: ReturnType<typeof setupOpenedBlockStepDecision>) => {
      decisionId: DecisionId;
      cards: CardRef[];
    } = (context) => ({
      decisionId: context.decision.id,
      cards: [cardRef(context.defenderBlocker, p2)],
    }),
  ) => {
    const context = setupOpenedBlockStepDecision();
    mutate(context);
    const selected = choose(context);
    assertRejectsWithoutMutation(context.openedState, {
      type: "respondToDecision",
      decisionId: selected.decisionId,
      response: { type: "cards", cards: selected.cards },
    });
  };

  run((context) => {
    const p2Characters = must(context.openedState.players[p2], "p2").characters;
    p2Characters[0] = {
      ...must(p2Characters[0], "blocker"),
      state: "rested",
    };
  });
  run((context) => {
    must(context.openedState.players[p2], "p2").characters = [];
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] =
      resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
      });
  });
  run(
    () => undefined,
    (context) => ({
      decisionId: context.decision.id,
      cards: [cardRef(must(context.p1State.characters[0], "p1 character"), p1)],
    }),
  );
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = { ...battle, step: "attack" };
  });
  run((context) => {
    const battle = must(context.openedState.battle, "battle");
    context.openedState.battle = {
      ...battle,
      blocker: cardRef(context.defenderBlocker, p2),
    };
  });
  run(
    () => undefined,
    (context) => ({
      decisionId: context.decision.id,
      cards: [
        {
          instanceId: "forged-blocker" as never,
          cardId: context.defenderBlocker.cardId,
          playerId: p2,
        },
      ],
    }),
  );
  run(
    () => undefined,
    (context) => ({
      decisionId: context.decision.id,
      cards: [
        cardRef(context.defenderBlocker, p2),
        cardRef(context.defenderBlocker, p2),
      ],
    }),
  );
  run(
    () => undefined,
    (context) => ({
      decisionId: "decision:stale" as never,
      cards: [cardRef(context.defenderBlocker, p2)],
    }),
  );
  run((context) => {
    delete context.openedState.battle;
  });
});

test("unsupported blocker activation states reject without mutation or events", () => {
  const run = (
    mutate: (context: ReturnType<typeof setupOpenedBlockStepDecision>) => void,
  ) => {
    const context = setupOpenedBlockStepDecision();
    mutate(context);
    assertRejectsWithoutMutation(context.openedState, {
      type: "respondToDecision",
      decisionId: context.decision.id,
      response: {
        type: "cards",
        cards: [cardRef(context.defenderBlocker, p2)],
      },
    });
  };

  run((context) => {
    context.openedState.effectQueue = [{ id: "queued-effect" } as never];
  });
  run((context) => {
    context.openedState.deferredTriggers = [
      { timingWindowId: "window-1" } as never,
    ];
  });
  run((context) => {
    const p2State = must(context.openedState.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    context.openedState.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      effectText: "[Counter] Draw 1 card.",
    });
  });
  run((context) => {
    const p2State = must(context.openedState.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    context.openedState.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
    });
    context.openedState.cardManifest.effectDefinitions = {
      counterEvent: effectDefinition(counterEvent.cardId, { type: "counter" }),
    };
  });
  run((context) => {
    context.openedState.replacementState.push({
      processId: "replacement-process-1",
      type: "damage",
      usedReplacementIds: [],
      payload: { hidden: "contents" },
    });
  });
  run((context) => {
    context.openedState.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["unblockable"],
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish", "doubleAttack"],
    };
  });
  run((context) => {
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] = {
      ...resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
        effectText: "[On Block] Draw 1 card.",
      }),
      printedKeywords: ["blocker"],
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      onBlock: effectDefinition(context.defenderBlocker.cardId, {
        type: "onBlock",
      }),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      onKo: effectDefinition(context.defenderBlocker.cardId, {
        type: "onKO",
      }),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      endOfBattle: effectDefinition(context.defenderBlocker.cardId, {
        type: "endOfBattle",
      }),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      protectFromKo: effectDefinition(
        context.defenderBlocker.cardId,
        { type: "onPlay" },
        {
          type: "protectFromKO",
          target: { type: "self" },
          duration: { type: "thisTurn" },
        },
      ),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      cannotBeBlockedBy: effectDefinition(
        toCardId("leader-red"),
        { type: "onPlay" },
        {
          type: "cannotBeBlockedBy",
          target: { type: "self" },
          filter: { categories: ["character"] },
          duration: { type: "thisTurn" },
        },
      ),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      giveUnblockable: effectDefinition(
        toCardId("leader-red"),
        { type: "onPlay" },
        {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "unblockable",
          duration: { type: "thisTurn" },
        },
      ),
    };
  });
  run((context) => {
    context.openedState.cardManifest.effectDefinitions = {
      nestedProtection: effectDefinition(
        context.defenderBlocker.cardId,
        { type: "onPlay" },
        {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "custom",
                handler: "noop",
                operation: {
                  type: "protection",
                  protection: { process: "ko" },
                },
              } as never,
            },
          ],
        },
      ),
    };
  });
  run((context) => {
    context.openedState.continuousEffects = [
      { duration: { type: "thisBattle" } } as never,
    ];
  });
  run((context) => {
    context.openedState.continuousEffects = [
      {
        duration: { type: "thisTurn" },
        modifier: {
          layer: "rules",
          operation: {
            type: "protection",
            protection: { process: "ko" },
          },
        },
      } as never,
    ];
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
  run((context) => {
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] = {
      ...resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
      support: {
        cardId: context.defenderBlocker.cardId,
        status: "unsupported",
        tested: false,
        rulesVersion: "r1",
        cardDataVersion: "fixture",
        sourceTextHash: "source-hash",
        behaviorHash: "behavior-hash",
      },
    };
  });
  run((context) => {
    const metadata = {
      ...resolvedCard({
        cardId: context.defenderBlocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
    delete (metadata as Partial<typeof metadata>).support;
    context.openedState.cardManifest.cards[context.defenderBlocker.cardId] =
      metadata as never;
  });
});

test("legal blocker with unsupported continuation rejects declareAttack without mutation or events", () => {
  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const defenderBlocker = must(p2State.characters[0], "defender blocker");
    defenderBlocker.state = "active";
    state.cardManifest.cards[defenderBlocker.cardId] = {
      ...resolvedCard({
        cardId: defenderBlocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
    mutate(state);
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
  };

  run((state) => {
    const p2State = must(state.players[p2], "p2");
    const counterEvent = must(p2State.hand[0], "counter event");
    state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      effectText: "[Counter] Draw 1 card.",
    });
  });
  run((state) => {
    state.effectQueue = [{ id: "queued-effect" } as never];
  });
  run((state) => {
    state.deferredTriggers = [{ timingWindowId: "window-1" } as never];
  });
  run((state) => {
    state.replacementState.push({
      processId: "replacement-process-1",
      type: "damage",
      usedReplacementIds: [],
      payload: { hidden: "contents" },
    });
  });
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
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish", "doubleAttack"],
    };
  });
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 5000,
      printedKeywords: [],
    });
    state.cardManifest.cards[toCardId("leader-blue")] = {
      ...resolvedCard({
        cardId: toCardId("leader-blue"),
        category: "leader",
        power: 5000,
      }),
      support: {
        cardId: toCardId("leader-blue"),
        status: "unsupported",
        tested: false,
        rulesVersion: "r1",
        cardDataVersion: "fixture",
        sourceTextHash: "source-hash",
        behaviorHash: "behavior-hash",
      },
    };
  });
  run((state) => {
    const p2State = must(state.players[p2], "p2");
    const topLife = must(p2State.life[0], "top life");
    p2State.life[0] = {
      ...topLife,
      card: { ...topLife.card, cardId: toCardId("trigger-life-block-step") },
    };
    state.cardManifest.cards[toCardId("trigger-life-block-step")] = {
      ...resolvedCard({
        cardId: toCardId("trigger-life-block-step"),
        category: "character",
        power: 1000,
      }),
      triggerText: "TRIGGER: draw 1",
    };
  });
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
