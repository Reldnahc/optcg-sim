import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, GameState, InstanceId } from "@optcg/types";

import { applyAction } from "./actions.js";
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
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "./life-trigger-actions.js";

const supportedLifeTriggerDefinition = (
  cardId: ReturnType<typeof toCardId>,
): EffectDefinition => {
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  return {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
};

const openSupportedLifeTriggerDecision = (): {
  state: GameState;
  lifeCardId: ReturnType<typeof toCardId>;
  lifeInstanceId: InstanceId;
  definition: EffectDefinition;
} => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-activation");
  const definition = supportedLifeTriggerDefinition(lifeCardId);
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1 card",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-life-trigger-activation",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-trigger-activation": definition,
  };

  const result = applyAction(state, {
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
  return {
    state: result.state,
    lifeCardId,
    lifeInstanceId: topLife.card.instanceId,
    definition,
  };
};

test("hasLifeTriggerText only accepts non-empty trigger text", () => {
  assert.equal(hasLifeTriggerText(undefined), false);
  assert.equal(hasLifeTriggerText(""), false);
  assert.equal(hasLifeTriggerText("   "), false);
  assert.equal(hasLifeTriggerText("TRIGGER: draw"), true);
});

test("getSupportedLifeTriggerDecision returns confirmLifeTrigger for exact supported draw-1 trigger shape", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-supported");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
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

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-life-trigger",
      rulesVersion: supported.metadata.rulesVersion,
      sourceTextHash: supported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-life-trigger": supported,
  };

  const decision = getSupportedLifeTriggerDecision(state, p2, topLife.card);
  assert.ok(decision);
  assert.equal(decision.type, "confirmLifeTrigger");
  assert.deepEqual(decision.options, ["activateTrigger", "addToHand"]);
  assert.equal(decision.playerId, p2);
});

test("getSupportedLifeTriggerDecision rejects unsupported trigger metadata", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-unsupported");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [{ ...effect, optional: true }],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-unsupported-life-trigger",
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-unsupported-life-trigger": unsupported,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
});

test("getSupportedLifeTriggerDecision rejects untested support metadata before checking trigger shape", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-untested-support");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  const supportedShape = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-untested-life-trigger",
      tested: false,
      rulesVersion: supportedShape.metadata.rulesVersion,
      sourceTextHash: supportedShape.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    supportedShape.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-untested-life-trigger": supportedShape,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
});

test("getSupportedLifeTriggerDecision rejects trigger metadata with conditionTiming", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-condition-timing");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [
      {
        ...effect,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        conditionTiming: "activation" as const,
      },
    ],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-condition-timing",
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-condition-timing": unsupported,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
});

test("getSupportedLifeTriggerDecision rejects trigger metadata with failurePolicy", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-failure-policy");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [
      {
        ...effect,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        failurePolicy: "requiresAll" as const,
      },
    ],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-failure-policy",
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-failure-policy": unsupported,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
});

test("getSupportedLifeTriggerDecision rejects trigger metadata with optional set to false", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-optional-false");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [
      {
        ...effect,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        optional: false,
      },
    ],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-optional-false",
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-optional-false": unsupported,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
});

test("getSupportedLifeTriggerDecision rejects trigger metadata with oncePerTurn set to false", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-once-per-turn-false");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [
      {
        ...effect,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        oncePerTurn: false,
      },
    ],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-once-per-turn-false",
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-once-per-turn-false": unsupported,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
});

test("activated life trigger reveals from no zone and queues runtime work without resolving the effect body", () => {
  const { state, lifeCardId, lifeInstanceId, definition } =
    openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const effect = must(definition.effects[0], "trigger effect");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued trigger");
  assert.equal(entry.controllerId, p2);
  assert.equal(entry.source.instanceId, lifeInstanceId);
  assert.equal(entry.source.cardId, lifeCardId);
  assert.deepEqual(entry.source.zone, {
    zone: "noZone",
    playerId: p2,
    slot: "temporary",
  });
  assert.deepEqual(entry.sourceSnapshot.zone, entry.source.zone);
  assert.equal(entry.effectBlockId, effect.id);
  assert.equal(entry.sourcePresencePolicy, "resolveFromLastKnownInformation");

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved", "cardRevealed", "triggerActivated", "effectQueued"],
  );
  const reveal = must(result.state.revealedCards[0], "reveal record");
  assert.equal(reveal.visibility.type, "public");
  assert.equal(reveal.origin, "lifeDamage");
  assert.equal(reveal.cleanupPolicy, "trashAfterResolution");
  assert.deepEqual(reveal.cards, [entry.source]);

  const p2State = must(result.state.players[p2], "p2");
  assert.equal(
    p2State.life.some(
      (lifeCard) => lifeCard.card.instanceId === lifeInstanceId,
    ),
    false,
  );
  assert.equal(
    p2State.hand.some((card) => card.instanceId === lifeInstanceId),
    false,
  );
  assert.equal(
    p2State.trash.some((card) => card.instanceId === lifeInstanceId),
    false,
  );
});

test("activated life trigger reveal is public while effect queue internals stay hidden from player views", () => {
  const { state, lifeCardId, lifeInstanceId } =
    openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const forAttacker = filterStateForPlayer(result.state, p1);
  const forDefender = filterStateForPlayer(result.state, p2);

  for (const view of [forAttacker, forDefender]) {
    const serializedReveals = JSON.stringify(view.revealedCards);
    assert.equal(serializedReveals.includes(String(lifeCardId)), true);
    assert.equal(serializedReveals.includes(String(lifeInstanceId)), true);
    assert.equal(JSON.stringify(view.events).includes("queueEntryId"), false);
    assert.equal(JSON.stringify(view.events).includes("sourceSnapshot"), false);
  }
});

test("activated life trigger fails closed without mutation when trigger metadata no longer supports no-zone activation", () => {
  const { state, lifeCardId, definition } = openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const unsupportedEffect = must(definition.effects[0], "trigger effect");
  state.cardManifest.effectDefinitions = {
    "def-life-trigger-activation": {
      ...definition,
      effects: [{ ...unsupportedEffect, optional: false }],
    },
  };
  const before = structuredClone(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: `Life Trigger card ${String(
        lifeCardId,
      )} is unsupported for activation.`,
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
});
