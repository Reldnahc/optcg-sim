import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Effect,
  EffectDefinition,
  GameState,
  InstanceId,
} from "@optcg/types";

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
  passCounterStep,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";

const supportedLifeTriggerDefinition = (
  cardId: ReturnType<typeof toCardId>,
  effectBody: Effect,
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
        sourcePresencePolicy: "noSourceRequired",
      },
    ],
  };
};

const openLifeTriggerDecision = (
  definition: EffectDefinition,
): {
  state: GameState;
  lifeInstanceId: InstanceId;
} => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const lifeCardId = toCardId("trigger-life-no-source-sequence");
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };

  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1, then trash 1",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-trigger-life-no-source-sequence",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-trigger-life-no-source-sequence": definition,
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
  const passed = passCounterStep(result.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.pendingDecision?.type, "confirmLifeTrigger");
  return { state: passed.state, lifeInstanceId: topLife.card.instanceId };
};

test("noSourceRequired life trigger sequence support is routed through shared queued sequence gating", () => {
  const opened = openLifeTriggerDecision(
    supportedLifeTriggerDefinition(
      toCardId("trigger-life-no-source-sequence"),
      {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", count: 1, player: "self" },
          },
          {
            connector: "then",
            effect: {
              type: "trashFromHand",
              player: "self",
              chooser: "self",
              count: 1,
            },
          },
        ],
      },
    ),
  );
  const decision = must(opened.state.pendingDecision, "life trigger decision");

  const paused = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
  const queued = must(paused.state.effectQueue[0], "queued entry");
  assert.equal(queued.sourcePresencePolicy, "noSourceRequired");
});
