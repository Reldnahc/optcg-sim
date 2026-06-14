import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p1, p2 } from "../action-test-fixtures.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import { applyDeclareAttack } from "./actions.js";
import {
  setupAttackState,
  withOnOpponentAttackDrawEffect,
} from "./test-fixtures.js";

const optionalTrashFromHandThenReduceOpponentPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-trash-hand-card",
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: {
          type: "trashFromHand",
          count: 1,
          chooser: "self",
          optional: true,
        },
      },
    },
    {
      id: "reduce-opponent-power-if-paid",
      connector: "ifYouDo",
      effect: {
        type: "modifyPower",
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
        value: -2000,
        duration: { type: "thisTurn" },
      },
    },
  ],
});

test("defender duplicate On Your Opponent's Attack optional-cost sources resolve once per card instance", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const firstSource = must(
    p2State.characters[0],
    "first opponent attack source",
  );
  const secondSeed = must(
    p2State.hand[0],
    "second opponent attack source seed",
  );
  const secondSource = {
    ...secondSeed,
    cardId: firstSource.cardId,
    zone: {
      zone: "characterArea",
      playerId: p2,
      slot: "character",
      index: 1,
    },
    state: "rested",
    attachedDon: [],
    turnPlayed: 1,
  } satisfies typeof firstSource;
  p2State.characters = [firstSource, secondSource];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const sequenceDefinition = withOnOpponentAttackDrawEffect(
    state,
    firstSource,
    "def-on-opponent-attack-duplicate-card-trash-power",
  );
  const effect = must(
    sequenceDefinition.effects[0],
    "On Opponent Attack duplicate sequence effect",
  );
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-duplicate-card-trash-power": {
      ...sequenceDefinition,
      effects: [
        {
          ...effect,
          oncePerTurn: true,
          effect: optionalTrashFromHandThenReduceOpponentPowerSequence(),
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
  assert.equal(opened.state.pendingDecision?.type, "chooseTriggerOrder");
  assert.equal(opened.state.pendingDecision.playerId, p2);
  assert.equal(opened.state.pendingDecision.triggerIds.length, 2);
  assert.equal(opened.state.effectQueue.length, 2);

  const firstEntry = must(
    opened.state.effectQueue.find(
      (entry) => entry.source.instanceId === firstSource.instanceId,
    ),
    "first source queue entry",
  );
  const ordered = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [firstEntry.id],
    },
  });

  assert.equal(ordered.errors, undefined);
  assert.equal(ordered.state.pendingDecision?.type, "payCost");
  assert.equal(ordered.state.pendingDecision.playerId, p2);
  assert.equal(ordered.state.effectQueue.length, 2);

  const handCard = must(p2State.hand[0], "hand card for optional cost");
  const paid = applyAction(ordered.state, {
    type: "respondToDecision",
    decisionId: ordered.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [handCard.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision?.type, "selectTargets");
  assert.equal(paid.state.pendingDecision.playerId, p2);
  assert.equal(paid.state.effectQueue.length, 2);

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
  assert.notEqual(targeted.state.effectQueue.length, 4);
  assert.equal(targeted.state.effectQueue.length, 1);
  assert.notEqual(targeted.state.pendingDecision?.type, "chooseTriggerOrder");
  assert.equal(targeted.state.pendingDecision?.type, "payCost");
  assert.equal(
    targeted.state.effectQueue[0]?.source.instanceId,
    secondSource.instanceId,
  );

  const remainingHandCard = must(
    must(targeted.state.players[p2], "targeted p2").hand[0],
    "remaining hand card for second optional cost",
  );
  const secondPaid = applyAction(targeted.state, {
    type: "respondToDecision",
    decisionId: targeted.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [remainingHandCard.instanceId],
    },
  });

  assert.equal(secondPaid.errors, undefined);
  assert.equal(secondPaid.state.pendingDecision?.type, "selectTargets");

  const secondTargeted = applyAction(secondPaid.state, {
    type: "respondToDecision",
    decisionId: secondPaid.state.pendingDecision.id,
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

  assert.equal(secondTargeted.errors, undefined);
  assert.equal(secondTargeted.state.effectQueue.length, 0);
  assert.equal(detectPendingRuntimeWork(secondTargeted.state), undefined);
});
