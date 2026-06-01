import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { applyAction } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
import { must, p1, p2 } from "./action-test-fixtures.js";
import {
  ensureActiveDonInCostArea,
  setupAttackState,
  withOnOpponentAttackDrawEffect,
} from "./battle-actions-test-fixtures.js";

const optionalRestDonThenRestTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-rest-don",
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: { type: "restDon", count: 1, chooser: "self", optional: true },
      },
    },
    {
      id: "rest-opponent-leader-or-character",
      connector: "ifYouDo",
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["leader", "character"] },
          },
        },
      },
    },
  ],
});

test("defender On Your Opponent's Attack sequence resolves before Counter Step pass decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const definition = withOnOpponentAttackDrawEffect(
    state,
    p2State.leader,
    "def-on-opponent-attack-optional-rest-don",
  );
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-optional-rest-don": {
      ...definition,
      effects: [
        {
          ...effect,
          oncePerTurn: true,
          effect: optionalRestDonThenRestTargetSequence(),
        },
      ],
    },
  };
  ensureActiveDonInCostArea(state, p2, 1);

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
  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.equal(opened.state.pendingDecision.playerId, p2);
  assert.equal(opened.state.effectQueue.length, 1);
  assert.deepEqual(
    opened.events
      .filter((event) => event.type === "decisionCreated")
      .map(
        (event) =>
          (event.payload as Partial<{ decisionType: string }>).decisionType,
      ),
    ["payCost"],
  );

  const activeDon = must(
    opened.state.players[p2]?.costArea.find((card) => card.state === "active"),
    "active DON for opponent attack cost",
  );
  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [activeDon.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision?.type, "selectTargets");
  assert.equal(paid.state.pendingDecision.playerId, p2);
  assert.equal(
    must(paid.state.players[p2], "paid p2").costArea.find(
      (card) => card.instanceId === activeDon.instanceId,
    )?.state,
    "rested",
  );

  const targeted = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: paid.state.pendingDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: p1State.leader.instanceId,
          cardId: p1State.leader.cardId,
          playerId: p1,
          zone: p1State.leader.zone,
        },
      ],
    },
  });

  assert.equal(targeted.errors, undefined);
  assert.equal(targeted.state.effectQueue.length, 0);
  assert.equal(targeted.state.battle?.step, "counter");
  assert.equal(targeted.state.pendingDecision?.type, "selectCards");
  assert.equal(targeted.state.pendingDecision.playerId, p2);
  assert.equal(
    must(targeted.state.players[p1], "targeted p1").leader.state,
    "rested",
  );
});
