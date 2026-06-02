import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectBlock, EffectDefinition } from "@optcg/types";

import { must, p2, resolvedCard, toCardId } from "../action-test-fixtures.js";
import {
  effectDefinition,
  setupAttackState,
} from "../battle-actions-test-fixtures.js";
import { getSupportedLifeTriggerDecision } from "./actions.js";

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
        sourcePresencePolicy: "resolveFromLastKnownInformation",
      },
    ],
  };
};

test("getSupportedLifeTriggerDecision accepts supported trigger from a multi-effect definition with unrelated supported effects", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const cardId = toCardId("trigger-life-multi-effect-supported");
  const supported = supportedLifeTriggerDefinition(cardId);
  const triggerEffect = must(supported.effects[0], "trigger effect");
  const onPlayEffect: EffectBlock = {
    ...triggerEffect,
    id: `${String(triggerEffect.id)}:on-play` as EffectBlock["id"],
    trigger: { type: "onPlay" },
    sourcePresencePolicy: "mustRemainInSameZone",
  };

  topLife.card.cardId = cardId;
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-life-trigger-multi-effect",
      rulesVersion: supported.metadata.rulesVersion,
      sourceTextHash: supported.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-life-trigger-multi-effect": {
      ...supported,
      effects: [triggerEffect, onPlayEffect],
    },
  };

  const decision = getSupportedLifeTriggerDecision(state, p2, topLife.card);

  assert.ok(decision);
  assert.equal(decision.type, "confirmLifeTrigger");
  assert.equal(decision.card.cardId, cardId);
});
