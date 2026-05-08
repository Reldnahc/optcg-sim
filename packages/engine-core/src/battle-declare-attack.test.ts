import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  getDeclareAttackLegalActions,
} from "./battle-actions.js";
import {
  effectDefinition,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";

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
