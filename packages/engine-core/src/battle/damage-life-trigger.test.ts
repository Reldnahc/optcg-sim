import assert from "node:assert/strict";
import { test } from "vitest";

import type { ContinuousEffectRecord, Effect } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import {
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "./test-fixtures.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

const faceUpLifeToDeckBottomReplacementRecord = (
  state: ReturnType<typeof setupAttackState>,
): ContinuousEffectRecord => {
  const player = must(state.players[p2], "p2");
  return {
    id: "continuous:life-rule-replacement",
    source: {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId: p2,
      zone: player.leader.zone,
    },
    sourceSnapshot: {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      ownerId: p2,
      controllerId: p2,
      zone: player.leader.zone,
      category: "leader",
      colors: [],
      life: 5,
      keywords: [],
    },
    controller: p2,
    modifier: {
      layer: "replacement",
      target: { type: "player", player: "self" },
      operation: {
        type: "replacement",
        replacement: {
          type: "replacement",
          when: {
            type: "wouldMoveZone",
            from: "life",
            to: "hand",
            lifeMatcher: { faceUp: true },
            target: { type: "all", zone: "life", player: "self" },
          },
          instead: {
            type: "bounce",
            target: { type: "replacementTarget" },
            destination: "deckBottom",
          },
        },
      },
    },
    duration: { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "test" },
    createdAtStateSeq: state.seq,
  };
};

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
  assert.equal(result.errors, undefined);
  return { result: passCounterStep(result.state, p2), lifeCardId };
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
  const counterDecision = must(
    result.state.pendingDecision,
    "counter decision",
  );
  const passed = applyAction(result.state, {
    type: "respondToDecision",
    decisionId: counterDecision.id,
    response: { type: "cards", cards: [] },
  });
  assert.equal(passed.errors, undefined);
  const pendingDecision = must(
    passed.state.pendingDecision,
    "pending decision",
  );
  assert.equal(pendingDecision.type, "confirmLifeTrigger");
  assert.deepEqual(pendingDecision.options, ["activateTrigger", "addToHand"]);
  assert.equal(pendingDecision.playerId, p2);
  const nextP2 = must(passed.state.players[p2], "next p2");
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
    filterStateForPlayer(passed.state, p1).opponent.life.count,
    beforeLifeCount - 1,
  );
  assert.equal(
    filterStateForPlayer(passed.state, p2).self.life.count,
    beforeLifeCount - 1,
  );
  const opponentView = filterStateForPlayer(passed.state, p1);
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
    passed.events.some((event) => event.type === "lifeTaken"),
    true,
  );
  assert.equal(
    passed.events.some(
      (event) =>
        event.type === "cardMoved" &&
        event.visibility.type === "private" &&
        (event.payload as { cardId?: string }).cardId === lifeCardId,
    ),
    false,
  );
  assert.equal(
    passed.events.some((event) => event.type === "decisionCreated"),
    true,
  );
});

test("life damage creates the same trigger decision pause when taken card has no trigger text", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = topLife.card.cardId;
  const beforeLifeCount = p2State.life.length;
  const beforeHandCount = p2State.hand.length;

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
  const counterDecision = must(
    result.state.pendingDecision,
    "counter decision",
  );
  const passed = applyAction(result.state, {
    type: "respondToDecision",
    decisionId: counterDecision.id,
    response: { type: "cards", cards: [] },
  });
  assert.equal(passed.errors, undefined);
  const pendingDecision = must(
    passed.state.pendingDecision,
    "pending decision",
  );
  assert.equal(pendingDecision.type, "confirmLifeTrigger");
  assert.equal(pendingDecision.playerId, p2);
  assert.equal(pendingDecision.card.cardId, lifeCardId);
  const nextP2 = must(passed.state.players[p2], "next p2");
  assert.equal(nextP2.life.length, beforeLifeCount - 1);
  assert.equal(nextP2.hand.length, beforeHandCount);
  assert.equal(
    nextP2.life.some(
      (lifeCard) => lifeCard.card.instanceId === topLife.card.instanceId,
    ),
    false,
  );
  assert.equal(
    filterStateForPlayer(passed.state, p1).opponent.life.count,
    beforeLifeCount - 1,
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(passed.state, p1)).includes(
      String(lifeCardId),
    ),
    false,
  );
  assert.deepEqual(
    getLegalActions(passed.state, p2)
      .filter((action) => action.type === "respondToDecision")
      .map((action) => action.response),
    [{ type: "lifeTrigger", choice: "addToHand" }],
  );
  assert.equal(
    filterStateForPlayer(passed.state, p2).legalActions.filter(
      (action) => action.type === "respondToDecision",
    ).length,
    1,
  );
});

test("unsupported life trigger activation still takes damage and only offers add to hand", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-unsupported-activation");
  const beforeLifeCount = p2State.life.length;
  const beforeHandCount = p2State.hand.length;
  const definition = effectDefinition(lifeCardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  const unsupportedEffect: Effect = {
    type: "ko",
    target: { type: "opponentLeader" },
  };
  const unsupported = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        effect: unsupportedEffect,
      },
    ],
  };
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = {
    ...resolvedCard({
      cardId: lifeCardId,
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: unsupported activation",
    support: {
      cardId: lifeCardId,
      status: "implemented-dsl",
      effectDefinitionId: "def-unsupported-life-trigger-activation",
      tested: true,
      rulesVersion: unsupported.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: unsupported.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-unsupported-life-trigger-activation": unsupported,
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
  assert.equal(opened.errors, undefined);
  const passed = passCounterStep(opened.state, p2);
  assert.equal(passed.errors, undefined);
  const pendingDecision = must(
    passed.state.pendingDecision,
    "pending decision",
  );
  const damaged = must(passed.state.players[p2], "damaged player");

  assert.equal(pendingDecision.type, "confirmLifeTrigger");
  assert.deepEqual(pendingDecision.options, ["addToHand"]);
  assert.equal(damaged.life.length, beforeLifeCount - 1);
  assert.equal(damaged.hand.length, beforeHandCount);
  assert.deepEqual(
    getLegalActions(passed.state, p2)
      .filter((action) => action.type === "respondToDecision")
      .map((action) => action.response),
    [{ type: "lifeTrigger", choice: "addToHand" }],
  );
  const unavailableActivation = applyAction(passed.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  assert.deepEqual(unavailableActivation.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger choice is not available.",
    },
  ]);

  const resolved = applyAction(passed.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
  const nextP2 = must(resolved.state.players[p2], "p2 after add to hand");
  assert.equal(nextP2.life.length, beforeLifeCount - 1);
  assert.equal(nextP2.hand.length, beforeHandCount + 1);
  assert.equal(must(nextP2.hand.at(-1), "moved life card").cardId, lifeCardId);
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
  const movedCard = must(nextP2.hand.at(-1), "moved life trigger card");
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
        (event.payload as { cardId?: string; to?: { index?: number } })
          .cardId === opened.lifeCardId &&
        (event.payload as { to?: { index?: number } }).to?.index ===
          beforeHandCount,
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
  const passed = passCounterStep(result.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision?.type, "confirmLifeTrigger");
});

test("unsupported conditioned life trigger takes damage and exposes only add to hand without identity leak", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-unsupported-conditioned");
  const beforeLifeCount = p2State.life.length;
  const beforeHandCount = p2State.hand.length;
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
  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  const nextP2 = must(result.state.players[p2], "next p2");
  const publicEvents = result.events.filter(
    (event) => event.visibility.type === "public",
  );
  const opponentView = filterStateForPlayer(result.state, p1);

  assert.equal(result.errors, undefined);
  const pendingDecision = must(
    result.state.pendingDecision,
    "pending life trigger decision",
  );
  assert.equal(pendingDecision.type, "confirmLifeTrigger");
  assert.deepEqual(pendingDecision.options, ["addToHand"]);
  assert.equal(nextP2.life.length, beforeLifeCount - 1);
  assert.equal(nextP2.hand.length, beforeHandCount);
  assert.equal(
    nextP2.hand.some((card) => card.cardId === lifeCardId),
    false,
  );
  assert.equal(
    nextP2.life.some((lifeCard) => lifeCard.card.cardId === lifeCardId),
    false,
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
    true,
  );
  assert.deepEqual(
    getLegalActions(result.state, p2)
      .filter((action) => action.type === "respondToDecision")
      .map((action) => action.response),
    [{ type: "lifeTrigger", choice: "addToHand" }],
  );
  assert.equal(
    JSON.stringify(publicEvents).includes(String(lifeCardId)),
    false,
  );
  assert.equal(
    JSON.stringify(opponentView).includes(String(lifeCardId)),
    false,
  );
  assert.equal(
    JSON.stringify(opponentView).includes("confirmLifeTrigger"),
    false,
  );

  const resolved = applyAction(result.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedP2 = must(resolved.state.players[p2], "resolved p2");
  assert.equal(resolvedP2.life.length, beforeLifeCount - 1);
  assert.equal(resolvedP2.hand.length, beforeHandCount + 1);
  assert.equal(
    must(resolvedP2.hand.at(-1), "added unsupported trigger card").cardId,
    lifeCardId,
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
  assert.equal(opened.errors, undefined);
  const passed = passCounterStep(opened.state, p2);
  assert.equal(passed.errors, undefined);
  const decision = must(passed.state.pendingDecision, "life trigger decision");
  const result = applyAction(passed.state, {
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

test("face-up Life add-to-hand rules movement is replaced by deck bottom", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("face-up-life-rule-card");
  const beforeHandCount = p2State.hand.length;
  const beforeDeckCount = p2State.deck.length;
  p2State.life[0] = {
    ...topLife,
    faceUp: true,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: unsupported",
  });
  state.continuousEffects = [faceUpLifeToDeckBottomReplacementRecord(state)];

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
  assert.equal(opened.errors, undefined);
  const passed = passCounterStep(opened.state, p2);
  const decision = must(passed.state.pendingDecision, "life decision");
  assert.equal(decision.type, "confirmLifeTrigger");
  assert.equal(decision.sourceLifeFaceUp, true);

  const resolved = applyAction(passed.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.equal(resolved.errors, undefined);
  const nextP2 = must(resolved.state.players[p2], "next p2");
  assert.equal(nextP2.hand.length, beforeHandCount);
  assert.equal(nextP2.deck.length, beforeDeckCount + 1);
  assert.equal(must(nextP2.deck.at(-1), "bottom deck card").cardId, lifeCardId);
  assert.equal(
    resolved.events.some((event) => event.type === "replacementApplied"),
    true,
  );
});

test("face-down Life still goes to hand under face-up Life rules replacement", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("face-down-life-rule-card");
  const beforeHandCount = p2State.hand.length;
  const beforeDeckCount = p2State.deck.length;
  p2State.life[0] = {
    ...topLife,
    faceUp: false,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: unsupported",
  });
  state.continuousEffects = [faceUpLifeToDeckBottomReplacementRecord(state)];

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
  assert.equal(opened.errors, undefined);
  const passed = passCounterStep(opened.state, p2);
  const decision = must(passed.state.pendingDecision, "life decision");
  assert.equal(decision.type, "confirmLifeTrigger");
  assert.equal(decision.sourceLifeFaceUp, undefined);

  const resolved = applyAction(passed.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.equal(resolved.errors, undefined);
  const nextP2 = must(resolved.state.players[p2], "next p2");
  assert.equal(nextP2.hand.length, beforeHandCount + 1);
  assert.equal(nextP2.deck.length, beforeDeckCount);
  assert.equal(must(nextP2.hand.at(-1), "hand card").cardId, lifeCardId);
  assert.equal(
    resolved.events.some((event) => event.type === "replacementApplied"),
    false,
  );
});
