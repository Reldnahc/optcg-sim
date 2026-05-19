import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
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

test("applyAction declareAttack keeps conditioned life trigger activation reachable", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-conditioned");
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
        condition: { type: "yourTurn" as const },
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
      effectDefinitionId: "def-life-trigger-conditioned",
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
    "def-life-trigger-conditioned": supported,
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
  assert.equal(result.state.pendingDecision?.type, "confirmLifeTrigger");
});

test("applyAction declareAttack fail-closes unsupported conditioned life trigger before decision without identity leak", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-unsupported-conditioned");
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
  const unsupportedConditioned = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        condition: {
          type: "attachedDonCount" as const,
          target: { type: "self" as const },
          op: "gte" as const,
          value: 1,
        },
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
      effectDefinitionId: "def-life-trigger-unsupported-conditioned",
      tested: true,
      rulesVersion: unsupportedConditioned.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: unsupportedConditioned.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    unsupportedConditioned.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-trigger-unsupported-conditioned": unsupportedConditioned,
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
  const publicEvents = result.events.filter(
    (event) => event.visibility.type === "public",
  );
  const opponentView = filterStateForPlayer(result.state, p1);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason:
        "Life trigger reveal decisions are unsupported in this battle path.",
    },
  ]);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(nextP2.life.length, beforeLifeCount);
  assert.equal(
    nextP2.hand.some((card) => card.cardId === lifeCardId),
    false,
  );
  assert.equal(
    nextP2.life.some((lifeCard) => lifeCard.card.cardId === lifeCardId),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardRevealed"),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "triggerActivated"),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    false,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "decisionCreated" &&
        (event.payload as { decisionType?: string }).decisionType ===
          "confirmLifeTrigger",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(publicEvents).includes(String(lifeCardId)),
    false,
  );
  assert.equal(result.events.length, 0);
  assert.equal(
    JSON.stringify(opponentView).includes(String(lifeCardId)),
    false,
  );
  assert.equal(
    JSON.stringify(opponentView).includes("confirmLifeTrigger"),
    false,
  );
});

test("activated life trigger with false condition skips body and still trashes the revealed life card", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-false-condition");
  const lifeInstanceId = topLife.card.instanceId;
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
        condition: { type: "yourTurn" as const },
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
      effectDefinitionId: "def-life-trigger-false-condition",
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
    "def-life-trigger-false-condition": supported,
  };

  const opened = applyDeclareAttack(state, {
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
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const nextP2 = must(result.state.players[p2], "p2 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.revealedCards.length, 0);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === lifeInstanceId),
    true,
  );
});
