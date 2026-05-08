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
import { setupMainPlayState } from "./play-card-test-fixtures.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";
import {
  makeMainPhaseLegalActionState,
  queuedEffect,
  toCardId,
  toDecisionId,
  toTimingWindowId,
} from "./action-dispatcher-test-support.js";

test("getLegalActions suppresses ordinary main-phase actions while effect queue work is pending", () => {
  const state = makeMainPhaseLegalActionState();
  state.effectQueue.push(queuedEffect("queue-a"));

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions suppresses ordinary main-phase actions while deferred triggers are pending", () => {
  const state = makeMainPhaseLegalActionState();
  state.deferredTriggers.push({
    timingWindowId: toTimingWindowId("hidden-window-a"),
    generation: 1,
    triggerIds: ["hidden-trigger-a"],
    releasePolicy: "afterCurrentProcess",
  });

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions keeps pending-decision responses while runtime work is pending", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  opened.state.effectQueue.push(queuedEffect("pending-decision"));

  const legal = getLegalActions(opened.state, p1);

  assert.equal(
    legal.some((action) => action.type === "respondToDecision"),
    true,
  );
  assert.equal(
    legal.some((action) => action.type === "endMainPhase"),
    false,
  );
  assert.equal(
    legal.some((action) => action.type === "attachDon"),
    false,
  );
  assert.equal(
    legal.some((action) => action.type === "playCard"),
    false,
  );
  assert.equal(
    legal.some((action) => action.type === "declareAttack"),
    false,
  );
});

test("getLegalActions does not mutate state or replace pending decisions while runtime work is pending", () => {
  const state = makeMainPhaseLegalActionState();
  const pendingDecision = startMulliganFlow(createInitialState(createInput()))
    .state.pendingDecision;
  assert.ok(pendingDecision !== undefined);
  state.pendingDecision = pendingDecision;
  state.effectQueue.push(queuedEffect("mutation"));
  const before = structuredClone(state);

  getLegalActions(state, p1);

  assert.equal(state.pendingDecision, pendingDecision);
  assert.deepEqual(state, before);
});

test("getLegalActions output is content-agnostic for hidden runtime work", () => {
  const withFirstQueue = makeMainPhaseLegalActionState();
  withFirstQueue.effectQueue.push(queuedEffect("first-hidden"));
  const withSecondQueue = makeMainPhaseLegalActionState();
  withSecondQueue.effectQueue.push(queuedEffect("second-hidden"));

  assert.deepEqual(
    getLegalActions(withFirstQueue, p1),
    getLegalActions(withSecondQueue, p1),
  );

  const withFirstDeferred = makeMainPhaseLegalActionState();
  withFirstDeferred.deferredTriggers.push({
    timingWindowId: toTimingWindowId("first-hidden-window"),
    generation: 1,
    triggerIds: ["hidden-trigger-one"],
    releasePolicy: "afterCurrentProcess",
  });
  const withSecondDeferred = makeMainPhaseLegalActionState();
  withSecondDeferred.deferredTriggers.push({
    timingWindowId: toTimingWindowId("second-hidden-window"),
    generation: 1,
    triggerIds: ["hidden-trigger-two"],
    releasePolicy: "afterCurrentProcess",
  });

  assert.deepEqual(
    getLegalActions(withFirstDeferred, p1),
    getLegalActions(withSecondDeferred, p1),
  );
});

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

test("pending runtime work rejects ordinary applyAction requests without mutation", () => {
  const state = makeMainPhaseLegalActionState();
  state.effectQueue.push(queuedEffect("apply-action"));
  const before = JSON.stringify(state);

  const result = applyAction(state, { type: "endMainPhase" });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Phase actions are illegal while effect runtime work is pending.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("pending runtime work still allows concession and pending-decision responses", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const pending = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  }).state;
  pending.effectQueue.push(queuedEffect("decision-response"));
  const decision = must(pending.pendingDecision, "pending decision");
  const pendingP1 = must(pending.players[p1], "pending p1");

  const response = applyAction(pending, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        must(pendingP1.costArea[0], "don0").instanceId,
        must(pendingP1.costArea[1], "don1").instanceId,
      ],
    },
  });
  assert.equal(response.errors, undefined);

  const conceded = applyAction(pending, { type: "concede", playerId: p1 });
  assert.equal(conceded.errors, undefined);
  assert.deepEqual(conceded.state.status, { type: "completed", winner: p2 });
});

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

test("getLegalActions omits declareAttack and blocker responses for unsupported implemented-dsl combat metadata", () => {
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
      printedKeywords: ["unblockable"],
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
      printedKeywords: ["blocker", "unblockable"],
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
    false,
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
