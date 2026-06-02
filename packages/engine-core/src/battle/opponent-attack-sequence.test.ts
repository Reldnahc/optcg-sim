import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { applyAction } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  createCounterStepPassDecision,
  getUnsupportedCounterWindowReason,
} from "./counter-actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import {
  ensureActiveDonInCostArea,
  setupAttackState,
  withOnOpponentAttackDrawEffect,
} from "../battle-actions-test-fixtures.js";

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

const optionalTrashSelfThenSetDonActiveSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-trash-self",
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: { type: "trashSelf", optional: true },
      },
    },
    {
      id: "set-don-active-if-paid",
      connector: "ifYouDo",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select-rested-don",
            connector: "always",
            saveResultAs: "targetSelection:set-don-active",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zone: "costArea",
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            id: "activate-selected-don",
            connector: "then",
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "targetSelection:set-don-active",
                },
                zone: "costArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
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
  assert.equal(paid.state.effectQueue.length, 1);
  assert.equal(
    paid.state.effectQueue[0]?.causedBy.type === "ruleProcess"
      ? paid.state.effectQueue[0].causedBy.name
      : undefined,
    "effectRuntime:onOpponentAttackTriggerQueueing",
  );
  assert.equal(
    paid.state.pendingDecision.causedBy.type === "effect"
      ? paid.state.pendingDecision.causedBy.queueEntryId
      : undefined,
    paid.state.effectQueue[0]?.id,
  );
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

test("defender On Your Opponent's Attack trash-self sequence resumes battle after selecting DON", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.characters[0], "opponent attack source");
  const definition = withOnOpponentAttackDrawEffect(
    state,
    source,
    "def-on-opponent-attack-trash-self-set-don-active",
  );
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-trash-self-set-don-active": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: optionalTrashSelfThenSetDonActiveSequence(),
        },
      ],
    },
  };
  ensureActiveDonInCostArea(state, p2, 1);
  const restedDon = must(
    p2State.costArea.find((card) => card.state === "active"),
    "rested DON candidate",
  );
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  restedDon.state = "rested";

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
      optionId: "trashSelf",
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
          instanceId: restedDon.instanceId,
          cardId: restedDon.cardId,
          playerId: p2,
          zone: restedDon.zone,
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
    must(targeted.state.players[p2], "targeted p2").costArea.find(
      (card) => card.instanceId === restedDon.instanceId,
    )?.state,
    "active",
  );
  assert.equal(
    must(targeted.state.players[p2], "targeted p2").trash[0]?.instanceId,
    source.instanceId,
  );
});

test("defender On Your Opponent's Attack choice group continues remaining triggers after sequence decision", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.characters[0], "opponent attack source");
  const drawDefinition = withOnOpponentAttackDrawEffect(
    state,
    p2State.leader,
    "def-on-opponent-attack-draw-after-sequence",
  );
  const drawEffect = must(drawDefinition.effects[0], "draw trigger effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-draw-after-sequence": {
      ...drawDefinition,
      effects: [
        {
          ...drawEffect,
          effect: { type: "draw", player: "self", count: 0 },
        },
      ],
    },
  };
  const sequenceDefinition = withOnOpponentAttackDrawEffect(
    state,
    source,
    "def-on-opponent-attack-choice-trash-self-set-don-active",
  );
  const effect = must(
    sequenceDefinition.effects[0],
    "On Opponent Attack sequence effect",
  );
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-choice-trash-self-set-don-active": {
      ...sequenceDefinition,
      effects: [
        {
          ...effect,
          effect: optionalTrashSelfThenSetDonActiveSequence(),
        },
      ],
    },
  };
  ensureActiveDonInCostArea(state, p2, 1);
  const restedDon = must(
    p2State.costArea.find((card) => card.state === "active"),
    "rested DON candidate",
  );
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  restedDon.state = "rested";

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

  const sequenceQueueEntry = must(
    opened.state.effectQueue.find(
      (entry) => entry.source.instanceId === source.instanceId,
    ),
    "sequence queue entry",
  );
  const ordered = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [sequenceQueueEntry.id],
    },
  });

  assert.equal(ordered.errors, undefined);
  assert.equal(ordered.state.pendingDecision?.type, "payCost");
  assert.equal(ordered.state.pendingDecision.playerId, p2);

  const paid = applyAction(ordered.state, {
    type: "respondToDecision",
    decisionId: ordered.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "trashSelf",
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
          instanceId: restedDon.instanceId,
          cardId: restedDon.cardId,
          playerId: p2,
          zone: restedDon.zone,
        },
      ],
    },
  });

  assert.equal(targeted.errors, undefined);
  assert.equal(targeted.state.effectQueue.length, 0);
  assert.equal(detectPendingRuntimeWork(targeted.state), undefined);
  assert.equal(targeted.state.battle?.step, "counter");
  assert.equal(
    getUnsupportedCounterWindowReason(targeted.state, p2),
    undefined,
  );
  assert.notEqual(
    createCounterStepPassDecision(targeted.state, {
      requirePotentialCounterActions: false,
    }),
    null,
  );
  assert.equal(targeted.state.pendingDecision?.type, "selectCards");
  assert.equal(targeted.state.pendingDecision.playerId, p2);
  assert.equal(
    must(targeted.state.players[p2], "targeted p2").costArea.find(
      (card) => card.instanceId === restedDon.instanceId,
    )?.state,
    "active",
  );
});
