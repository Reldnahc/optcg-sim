import assert from "node:assert/strict";
import { test } from "vitest";

import { createInitialState } from "./initial-state.js";
import { startMulliganFlow } from "./mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";
import { queuedEffect, toCardId } from "./action-dispatcher-test-support.js";

test("getLegalActions exposes defender decline and legal blocker response during block step decision", () => {
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

  const opened = applyAction(state, {
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
  const pending = must(opened.state.pendingDecision, "pending decision");

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: pending.id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "respondToDecision",
      decisionId: pending.id,
      response: {
        type: "cards",
        cards: [
          {
            instanceId: defenderBlocker.instanceId,
            cardId: defenderBlocker.cardId,
            playerId: p2,
            zone: defenderBlocker.zone,
          },
        ],
      },
    },
  ]);
  assert.deepEqual(getLegalActions(opened.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions exposes no blocker responses outside the active defender block-step decision", () => {
  const openBlockerDecision = () => {
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

    const opened = applyAction(state, {
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
    return opened.state;
  };
  const assertNoBlockerResponses = (
    state: ReturnType<typeof openBlockerDecision>,
  ) => {
    for (const playerId of [p1, p2]) {
      const legal = getLegalActions(state, playerId);
      assert.deepEqual(
        legal.filter(
          (action) =>
            action.type === "respondToDecision" &&
            action.response.type === "cards",
        ),
        [],
      );
    }
  };

  const wrongStep = openBlockerDecision();
  wrongStep.battle = {
    ...must(wrongStep.battle, "wrong step battle"),
    step: "damage",
  };
  delete wrongStep.pendingDecision;
  assertNoBlockerResponses(wrongStep);

  const wrongPhase = openBlockerDecision();
  wrongPhase.turn.phase = "refresh";
  delete wrongPhase.pendingDecision;
  assertNoBlockerResponses(wrongPhase);

  const nonBlockerDecision = createActiveState();
  nonBlockerDecision.status = { type: "active" };
  nonBlockerDecision.turn.phase = "main";
  nonBlockerDecision.pendingDecision = must(
    startMulliganFlow(createInitialState(createInput())).state.pendingDecision,
    "mulligan decision",
  );
  assertNoBlockerResponses(nonBlockerDecision);

  const pendingRuntimeWork = openBlockerDecision();
  pendingRuntimeWork.effectQueue.push(queuedEffect("blocker-runtime-work"));
  assertNoBlockerResponses(pendingRuntimeWork);
});

test("blocker legal actions do not expose hidden hand or life identities", () => {
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
  const hiddenHand = must(p2State.hand[0], "hidden hand");
  const hiddenLife = must(p2State.life[0], "hidden life").card;
  p2State.hand[0] = {
    ...hiddenHand,
    cardId: toCardId("p2-hidden-blocker-hand"),
  };
  state.cardManifest.cards[toCardId("p2-hidden-blocker-hand")] = resolvedCard({
    cardId: toCardId("p2-hidden-blocker-hand"),
    category: "character",
    power: 3000,
  });
  p2State.life[0] = {
    ...must(p2State.life[0], "hidden life card wrapper"),
    card: {
      ...hiddenLife,
      cardId: toCardId("p2-hidden-blocker-life"),
    },
  };
  state.cardManifest.cards[toCardId("p2-hidden-blocker-life")] = resolvedCard({
    cardId: toCardId("p2-hidden-blocker-life"),
    category: "character",
    power: 3000,
  });

  const opened = applyAction(state, {
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

  const serialized = JSON.stringify({
    attacker: getLegalActions(opened.state, p1),
    defender: getLegalActions(opened.state, p2),
  });
  assert.equal(serialized.includes("p2-hidden-blocker-hand"), false);
  assert.equal(serialized.includes("p2-hidden-blocker-life"), false);
});

test("getLegalActions exposes declareAttack and blocker responses for supported implemented-dsl combat bodies", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const defenderBlocker = must(p2State.characters[0], "defender blocker");
  attacker.turnPlayed = state.turn.globalTurn;
  attacker.state = "active";
  defenderBlocker.state = "active";
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
  state.cardManifest.cards[defenderBlocker.cardId] = {
    ...resolvedCard({
      cardId: defenderBlocker.cardId,
      category: "character",
      power: 3000,
      printedKeywords: ["blocker"],
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

  const legalBefore = getLegalActions(state, p1);
  assert.equal(
    legalBefore.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId,
    ),
    true,
  );

  const opened = applyAction(state, {
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
  assert.equal(opened.errors, undefined);
  const pending = must(opened.state.pendingDecision, "pending decision");
  const defenderLegal = getLegalActions(opened.state, p2);
  assert.equal(
    defenderLegal.some(
      (action) =>
        action.type === "respondToDecision" &&
        action.decisionId === pending.id &&
        action.response.type === "cards" &&
        action.response.cards.length === 1 &&
        action.response.cards[0]?.instanceId === defenderBlocker.instanceId,
    ),
    true,
  );
});
