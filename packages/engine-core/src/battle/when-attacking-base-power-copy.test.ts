import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import {
  setupAttackState,
  withWhenAttackingDrawEffect,
} from "./test-fixtures.js";

const selectTargetThenCopyCurrentPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-base-power-source",
      connector: "always",
      saveResultAs: "selected:base-power-source",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"] },
        },
      },
    },
    {
      id: "copy-selected-current-power",
      connector: "then",
      effect: {
        type: "setBasePower",
        target: { type: "self" },
        value: {
          type: "snapshotCardStat",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: "selected:base-power-source",
            },
            zone: "characterArea",
            player: "opponent",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
          stat: "currentPower",
        },
        duration: { type: "thisTurn" },
      },
    },
  ],
});

test("attacker When Attacking selected target can feed setBasePower and continue battle", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = must(p2State.characters[0], "base power source");
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 6000,
  });
  const definition = withWhenAttackingDrawEffect(
    state,
    attacker,
    "def-when-attacking-copy-selected-power",
  );
  const effect = must(definition.effects[0], "When Attacking effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-when-attacking-copy-selected-power": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: selectTargetThenCopyCurrentPowerSequence(),
        },
      ],
    },
  };

  const opened = applyDeclareAttack(state, {
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
  assert.equal(opened.state.pendingDecision?.type, "selectTargets");
  assert.equal(opened.state.pendingDecision.playerId, p1);

  const selected = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
      ],
    },
  });

  assert.equal(selected.errors, undefined);
  assert.equal(selected.state.effectQueue.length, 0);
  assert.equal(selected.state.effectExecutionFrames.length, 0);
  assert.equal(selected.state.battle?.step, "counter");
  assert.equal(selected.state.pendingDecision?.type, "selectCards");
  assert.equal(selected.state.pendingDecision.playerId, p2);
  const passAction = getLegalActions(selected.state, p2).find(
    (action) =>
      action.type === "respondToDecision" &&
      action.decisionId === selected.state.pendingDecision?.id &&
      action.response.type === "cards" &&
      action.response.cards.length === 0,
  );
  if (passAction === undefined) {
    assert.fail("expected counter-step pass action after copying base power");
  }
  assert.equal(
    selected.state.continuousEffects.some(
      (record) =>
        record.modifier.layer === "basePowerSet" &&
        record.modifier.operation.type === "setBasePower" &&
        record.modifier.operation.value === 6000,
    ),
    true,
  );
});
