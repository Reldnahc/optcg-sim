import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import { applyDeclareAttack } from "./actions.js";
import {
  effectDefinition,
  setupAttackState,
  withOnOpponentAttackDrawEffect,
} from "./test-fixtures.js";

const selectLeaderOrCharacterThenRetargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-new-attack-target",
      connector: "always",
      saveResultAs: "targetSelection:change-attack-target",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zones: ["leaderArea", "characterArea"],
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["leader", "character"] },
        },
      },
    },
    {
      id: "change-attack-target",
      connector: "then",
      effect: {
        type: "changeAttackTarget",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "targetSelection:change-attack-target",
          },
          zones: ["leaderArea", "characterArea"],
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const optionalTriggerCardTrashThenRetargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-trash-trigger-card",
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: {
          type: "trashFromHand",
          count: 1,
          chooser: "self",
          optional: true,
          filter: {
            effectEntryPoint: {
              mode: "with",
              trigger: { type: "trigger" },
            },
          },
        },
      },
    },
    {
      id: "retarget-if-paid",
      connector: "ifYouDo",
      effect: selectLeaderOrCharacterThenRetargetSequence(),
    },
  ],
});

test("defender On Your Opponent's Attack hand-trash retarget resumes to legal counter pass", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = p2State.leader;
  const costCard = must(p2State.hand[0], "trigger hand cost card");
  const costDefinitionId = "def-trigger-hand-cost-card";
  const costDefinition = effectDefinition(costCard.cardId, { type: "trigger" });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [costDefinitionId]: costDefinition,
  };
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: costDefinitionId,
      rulesVersion: costDefinition.metadata.rulesVersion,
      sourceTextHash: costDefinition.metadata.sourceTextHash,
    },
  });
  const newTarget = {
    ...must(p2State.hand[1], "new attack target"),
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p2State.characters = [newTarget];
  p2State.hand = [costCard, ...p2State.hand.slice(2)].map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const costCardInHand = must(p2State.hand[0], "trigger hand cost card");
  state.cardManifest.cards[newTarget.cardId] = {
    ...resolvedCard({
      cardId: newTarget.cardId,
      category: "character",
      power: 3000,
    }),
    types: ["Blackbeard Pirates"],
  };
  const definition = withOnOpponentAttackDrawEffect(
    state,
    source,
    "def-on-opponent-attack-trigger-trash-retarget",
  );
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-trigger-trash-retarget": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: optionalTriggerCardTrashThenRetargetSequence(),
        },
      ],
    },
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
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.equal(opened.state.pendingDecision.playerId, p2);

  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [costCardInHand.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision?.type, "selectTargets");
  assert.equal(paid.state.pendingDecision.playerId, p2);

  const targeted = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: paid.state.pendingDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: newTarget.instanceId,
          cardId: newTarget.cardId,
          playerId: p2,
          zone: newTarget.zone,
        },
      ],
    },
  });

  assert.equal(targeted.errors, undefined);
  assert.equal(targeted.state.effectQueue.length, 0);
  assert.equal(detectPendingRuntimeWork(targeted.state), undefined);
  assert.equal(targeted.state.battle?.step, "counter");
  assert.equal(
    targeted.state.battle.currentTarget.instanceId,
    newTarget.instanceId,
  );
  const decision = must(targeted.state.pendingDecision, "counter decision");
  const passAction = getLegalActions(targeted.state, p2).find(
    (action) =>
      action.type === "respondToDecision" &&
      action.decisionId === decision.id &&
      action.response.type === "cards" &&
      action.response.cards.length === 0,
  );
  if (passAction === undefined) {
    assert.fail("expected counter-step pass action after hand-trash retarget");
  }

  const passed = applyAction(targeted.state, passAction);

  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.battle, undefined);
});
