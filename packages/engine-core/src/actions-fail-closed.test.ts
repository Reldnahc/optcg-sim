import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { toDecisionId } from "./action-dispatcher-test-support.js";
import { setupAttackState } from "./battle/test-fixtures.js";

test("illegal actions return errors and do not mutate input state", () => {
  const state = createActiveState();
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "attachDon",
    donInstanceId: "missing-don" as never,
    target: {
      instanceId: must(state.players[p1], "p1").leader.instanceId,
      cardId: must(state.players[p1], "p1").leader.cardId,
      playerId: p1,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("getLegalActions omits blocker responses for unsupported implemented-dsl combat metadata", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  attacker.turnPlayed = state.turn.globalTurn;
  defenderBlocker.state = "active";
  state.cardManifest.cards[attacker.cardId] = {
    ...resolvedCard({
      cardId: attacker.cardId,
      category: "character",
      power: 7000,
      printedKeywords: ["doubleAttack"],
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
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
      printedKeywords: ["blocker", "doubleAttack"],
    }),
    support: {
      cardId: defenderBlocker.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };

  assert.equal(
    getLegalActions(state, p1).some(
      (action) => action.type === "declareAttack",
    ),
    true,
  );
  assert.equal(
    getLegalActions(state, p2).some(
      (action) =>
        action.type === "respondToDecision" && action.response.type === "cards",
    ),
    false,
  );

  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
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
  state.pendingDecision = {
    id: toDecisionId("decision:unsupported-blocker"),
    type: "selectCards",
    playerId: p2,
    prompt: "Choose blocker or decline.",
    causedBy: { type: "playerAction", actionId: "action:1" },
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
        card: {
          instanceId: defenderBlocker.instanceId,
          cardId: defenderBlocker.cardId,
          playerId: p2,
        },
        visibility: { type: "public" },
      },
    ],
    defaultResponse: { type: "cards", cards: [] },
  };

  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});
