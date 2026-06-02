import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, EffectBlock, EffectDefinition } from "@optcg/types";

import { must, p2, resolvedCard, toCardId } from "../action-test-fixtures.js";
import { effectDefinition, setupAttackState } from "../battle/test-fixtures.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "./actions.js";

const supportedLifeTriggerDefinition = (
  cardId: ReturnType<typeof toCardId>,
  effectBody: Effect = { type: "draw", count: 1, player: "self" },
  sourcePresencePolicy:
    | "resolveFromLastKnownInformation"
    | "noSourceRequired" = "resolveFromLastKnownInformation",
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
        sourcePresencePolicy,
      },
    ],
  };
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
  const definitions: Record<string, EffectDefinition> = {
    "def-malformed-empty": { ...supported, effects: [] },
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

test("getSupportedLifeTriggerDecision rejects trigger conditions unsupported in no-zone life activation context", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-unsupported-condition-no-zone");
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "effect");
  const unsupported = {
    ...definition,
    effects: [
      {
        ...effect,
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

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-unsupported-condition-no-zone",
      rulesVersion: unsupported.metadata.rulesVersion,
      sourceTextHash: unsupported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    unsupported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-unsupported-condition-no-zone": unsupported,
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
