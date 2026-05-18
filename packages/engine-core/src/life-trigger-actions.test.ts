import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Effect,
  EffectBlock,
  EffectDefinition,
  GameState,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
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
import { hashCanonicalStateValue } from "./canonical-state.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "./life-trigger-actions.js";

const supportedLifeTriggerDefinition = (
  cardId: ReturnType<typeof toCardId>,
  effectBody: Effect = { type: "draw", count: 1, player: "self" },
): EffectDefinition => {
  const definition = effectDefinition(cardId, { type: "trigger" }, effectBody);
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

const openLifeTriggerDecision = (options: {
  cardIdSuffix: string;
  triggerText: string;
  definition: EffectDefinition;
}): {
  state: GameState;
  lifeCardId: ReturnType<typeof toCardId>;
  lifeInstanceId: InstanceId;
  definition: EffectDefinition;
} => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId(options.cardIdSuffix);
  const definition = options.definition;
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: options.triggerText,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `def-${options.cardIdSuffix}`,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [`def-${options.cardIdSuffix}`]: definition,
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

const openSupportedLifeTriggerDecision = (): {
  state: GameState;
  lifeCardId: ReturnType<typeof toCardId>;
  lifeInstanceId: InstanceId;
  definition: EffectDefinition;
} => {
  const lifeCardId = toCardId("trigger-life-activation");
  return openLifeTriggerDecision({
    cardIdSuffix: "trigger-life-activation",
    triggerText: "TRIGGER: draw 1 card",
    definition: supportedLifeTriggerDefinition(lifeCardId),
  });
};

const expectUnsupportedLifeTriggerDefinition = (
  label: string,
  mutate: (effect: EffectBlock, definition: EffectDefinition) => EffectBlock,
): void => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId(`trigger-life-${label}`);
  const definition = supportedLifeTriggerDefinition(cardId);
  const baseEffect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [mutate(baseEffect, definition)],
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: unsupported shape",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `def-${label}`,
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [`def-${label}`]: unsupported,
  };

  assert.equal(
    getSupportedLifeTriggerDecision(state, p2, topLife.card),
    undefined,
  );
};

const ensurePlayerDeckCountFromHand = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "player");
  while (player.deck.length < count) {
    const refill = player.hand[0];
    assert.ok(refill !== undefined, "missing hand card for deck refill");
    player.hand = player.hand.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId, slot: "hand", index },
    }));
    player.deck = [
      ...player.deck,
      {
        ...refill,
        zone: {
          zone: "deck",
          playerId,
          slot: "deck",
          index: player.deck.length,
        },
      },
    ];
  }
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

test("getSupportedLifeTriggerDecision returns confirmLifeTrigger for supported draw-2 trigger body", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-supported-draw-2");
  const supported = supportedLifeTriggerDefinition(cardId, {
    type: "draw",
    count: 2,
    player: "self",
  });

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 2",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-life-trigger-draw-2",
      rulesVersion: supported.metadata.rulesVersion,
      sourceTextHash: supported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-life-trigger-draw-2": supported,
  };

  const decision = getSupportedLifeTriggerDecision(state, p2, topLife.card);

  assert.ok(decision);
  assert.equal(decision.type, "confirmLifeTrigger");
  assert.equal(decision.card.cardId, cardId);
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

test("getSupportedLifeTriggerDecision rejects unsupported reusable trigger body shapes", () => {
  expectUnsupportedLifeTriggerDefinition("cost", (effect) => ({
    ...effect,
    cost: { type: "restDon", count: 1 },
  }));
  expectUnsupportedLifeTriggerDefinition("condition", (effect) => ({
    ...effect,
    condition: { type: "yourTurn" },
  }));
  expectUnsupportedLifeTriggerDefinition("target-effect", (effect) => ({
    ...effect,
    effect: { type: "ko", target: { type: "opponentLeader" } },
  }));
  expectUnsupportedLifeTriggerDefinition("saved-reference", (effect) => ({
    ...effect,
    effect: {
      type: "sequence",
      effects: [
        {
          id: "save-target",
          connector: "always",
          saveResultAs: "that-card",
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              zone: "characterArea",
              player: "opponent",
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        },
      ],
    },
  }));
  expectUnsupportedLifeTriggerDefinition("replacement", (effect) => ({
    ...effect,
    effect: {
      type: "replacement",
      when: { type: "wouldDraw", player: "self" },
      instead: { type: "draw", count: 1, player: "self" },
    },
  }));
  expectUnsupportedLifeTriggerDefinition("source-policy", (effect) => ({
    ...effect,
    sourcePresencePolicy: "mustRemainInSameZone",
  }));
});

test("getSupportedLifeTriggerDecision rejects malformed, untested, and unreviewed trigger definitions", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-malformed");
  const supported = supportedLifeTriggerDefinition(cardId);
  const supportedEffect = must(supported.effects[0], "supported effect");
  const definitions: Record<string, EffectDefinition> = {
    "def-malformed-empty": { ...supported, effects: [] },
    "def-malformed-multiple": {
      ...supported,
      effects: [
        supportedEffect,
        {
          ...supportedEffect,
          id: `${String(cardId)}:effect:2` as EffectBlock["id"],
        },
      ],
    },
    "def-untested-definition": {
      ...supported,
      metadata: { ...supported.metadata, tested: false },
    },
    "def-unreviewed-definition": {
      ...supported,
      metadata: {
        sourceTextHash: supported.metadata.sourceTextHash,
        rulesVersion: supported.metadata.rulesVersion,
        effectDefinitionsVersion: supported.metadata.effectDefinitionsVersion,
        tested: true,
      },
    },
  };

  for (const [definitionId, definition] of Object.entries(definitions)) {
    topLife.card.cardId = cardId;
    state.cardManifest.cards[cardId] = resolvedCard({
      cardId,
      category: "character",
      power: 1000,
      triggerText: "TRIGGER: malformed definition",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: definitionId,
        rulesVersion: definition.metadata.rulesVersion,
        sourceTextHash: definition.metadata.sourceTextHash,
      },
    });
    state.cardManifest.effectDefinitionsVersion =
      definition.metadata.effectDefinitionsVersion;
    state.cardManifest.effectDefinitions = {
      [definitionId]: definition,
    };

    assert.equal(
      getSupportedLifeTriggerDecision(state, p2, topLife.card),
      undefined,
      definitionId,
    );
  }
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

test("activated life trigger emits public reveal and queued runtime events before resolving", () => {
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
  assert.deepEqual(
    result.events.slice(0, 4).map((event) => event.type),
    ["decisionResolved", "cardRevealed", "triggerActivated", "effectQueued"],
  );
  const revealEvent = must(
    result.events.find((event) => event.type === "cardRevealed"),
    "cardRevealed event",
  );
  const revealPayload = JSON.stringify(revealEvent.payload);
  assert.equal(revealPayload.includes(String(lifeCardId)), true);
  assert.equal(revealPayload.includes(String(lifeInstanceId)), true);
  assert.equal(revealPayload.includes("noZone"), true);

  const queuedEvent = must(
    result.events.find((event) => event.type === "effectQueued"),
    "effectQueued event",
  );
  const queuedPayload = queuedEvent.payload as {
    effectBlockId?: unknown;
    sourcePresencePolicy?: unknown;
  };
  assert.equal(queuedPayload.effectBlockId, effect.id);
  assert.equal(
    queuedPayload.sourcePresencePolicy,
    "resolveFromLastKnownInformation",
  );

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
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.revealedCards.length, 0);
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
    assert.deepEqual(view.revealedCards, []);
    const revealEvent = must(
      view.events.find((event) => event.type === "cardRevealed"),
      "player-view cardRevealed event",
    );
    const serializedRevealEvent = JSON.stringify(revealEvent);
    assert.equal(serializedRevealEvent.includes(String(lifeCardId)), true);
    assert.equal(serializedRevealEvent.includes(String(lifeInstanceId)), true);
    const serializedEvents = JSON.stringify(view.events);
    assert.equal(serializedEvents.includes("queueEntryId"), false);
    assert.equal(serializedEvents.includes("sourceSnapshot"), false);
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

  assert.deepEqual(
    getLegalActions(state, p2).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

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

test("malformed lifeTrigger choice fails closed without declining to hand", () => {
  const { state } = openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const before = structuredClone(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "bogus" as never },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger choice is unsupported.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
});

test("activated draw-1 life trigger resolves from no zone and trashes the trigger card", () => {
  const { state, lifeCardId, lifeInstanceId } =
    openSupportedLifeTriggerDecision();
  const decision = must(state.pendingDecision, "life trigger decision");
  const originalP2 = must(state.players[p2], "p2 before deck refill");
  const refill = must(originalP2.hand[0], "p2 deck refill");
  state.players[p2] = {
    ...originalP2,
    deck: [
      ...originalP2.deck,
      {
        ...refill,
        zone: {
          zone: "deck",
          playerId: p2,
          slot: "deck",
          index: originalP2.deck.length,
        },
      },
    ],
    hand: originalP2.hand.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    })),
  };
  const beforeP2 = must(state.players[p2], "p2 before");
  const drawnCard = must(beforeP2.deck[0], "p2 top deck");

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const afterP2 = must(result.state.players[p2], "p2 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardRevealed",
      "triggerActivated",
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "cardMoved",
      "cardTrashed",
    ],
  );
  assert.deepEqual(result.state.revealedCards, []);
  assert.equal(afterP2.deck.length, beforeP2.deck.length - 1);
  assert.equal(
    must(afterP2.hand[afterP2.hand.length - 1], "drawn card").instanceId,
    drawnCard.instanceId,
  );
  const trashedTrigger = must(afterP2.trash[0], "trashed trigger");
  assert.equal(trashedTrigger.instanceId, lifeInstanceId);
  assert.equal(trashedTrigger.cardId, lifeCardId);
  assert.deepEqual(trashedTrigger.zone, {
    zone: "trash",
    playerId: p2,
    slot: "trash",
    index: 0,
  });

  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        JSON.stringify(event.payload).includes(String(lifeCardId)) &&
        JSON.stringify(event.payload).includes("lifeTriggerResolved"),
    ),
    true,
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
});

test("activated draw-2 life trigger resolves through reusable queued body gate", () => {
  const cardId = toCardId("trigger-life-draw-2-activation");
  const opened = openLifeTriggerDecision({
    cardIdSuffix: "trigger-life-draw-2-activation",
    triggerText: "TRIGGER: draw 2 cards",
    definition: supportedLifeTriggerDefinition(cardId, {
      type: "draw",
      count: 2,
      player: "self",
    }),
  });
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  ensurePlayerDeckCountFromHand(opened.state, p2, 2);
  const beforeP2 = must(opened.state.players[p2], "p2 before");
  const drawnIds = beforeP2.deck.slice(0, 2).map((card) => card.instanceId);

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const replay = applyAction(structuredClone(opened.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  const afterP2 = must(result.state.players[p2], "p2 after");

  assert.equal(result.errors, undefined);
  assert.equal(replay.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(afterP2.deck.length, beforeP2.deck.length - 2);
  assert.deepEqual(
    afterP2.hand.slice(-2).map((card) => card.instanceId),
    drawnIds,
  );
  assert.equal(
    afterP2.trash.some((card) => card.instanceId === opened.lifeInstanceId),
    true,
  );
  assert.deepEqual(
    result.events
      .filter(
        (event) =>
          event.type === "cardDrawn" ||
          event.type === "effectResolved" ||
          event.type === "cardTrashed",
      )
      .map((event) => event.type),
    ["cardDrawn", "cardDrawn", "effectResolved", "cardTrashed"],
  );
  assert.deepEqual(result.events, replay.events);
  assert.equal(result.stateHash, replay.stateHash);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("activated drawUpTo life trigger keeps reveal no-zone state while paused and cleans up after resolution", () => {
  const cardId = toCardId("trigger-life-draw-up-to");
  const opened = openLifeTriggerDecision({
    cardIdSuffix: "trigger-life-draw-up-to",
    triggerText: "TRIGGER: draw up to 2 cards",
    definition: supportedLifeTriggerDefinition(cardId, {
      type: "drawUpTo",
      count: 2,
      player: "self",
    }),
  });
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  ensurePlayerDeckCountFromHand(opened.state, p2, 2);

  const paused = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(paused.state.effectQueue.length, 1);
  const queued = must(paused.state.effectQueue[0], "paused queue entry");
  assert.equal(queued.source.zone?.zone, "noZone");
  assert.equal(queued.sourceSnapshot.zone.zone, "noZone");
  assert.equal(
    paused.state.revealedCards.some((record) =>
      record.cards.some((card) => card.instanceId === opened.lifeInstanceId),
    ),
    true,
  );
  assert.equal(
    must(paused.state.players[p2], "paused p2").trash.some(
      (card) => card.instanceId === opened.lifeInstanceId,
    ),
    false,
  );

  const quantityDecision = must(
    paused.state.pendingDecision,
    "chooseQuantity decision",
  );
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const afterP2 = must(resolved.state.players[p2], "resolved p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.state.revealedCards.length, 0);
  assert.equal(
    afterP2.trash.some((card) => card.instanceId === opened.lifeInstanceId),
    true,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "cardMoved",
      "cardTrashed",
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
