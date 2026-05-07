import assert from "node:assert/strict";
import { test } from "vitest";

import { must, p2, resolvedCard, toCardId } from "./action-test-fixtures.js";
import {
  effectDefinition,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "./life-trigger-actions.js";

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
  const supported = {
    ...definition,
    effects: [
      {
        ...effect,
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
