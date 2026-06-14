import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
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
} from "./test-fixtures.js";

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
          filter: {
            categories: ["leader", "character"],
          },
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

const optionalFilteredHandTrashThenSetBasePowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-trash-8000-character",
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
            categories: ["character"],
            power: { op: "eq", value: 8000 },
          },
        },
      },
    },
    {
      id: "set-base-power-if-paid",
      connector: "ifYouDo",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "set-leader-base-power",
            connector: "always",
            effect: {
              type: "setBasePower",
              target: { type: "myLeader" },
              value: 7000,
              duration: { type: "thisTurn" },
            },
          },
          {
            id: "set-this-character-base-power",
            connector: "always",
            effect: {
              type: "setBasePower",
              target: { type: "self" },
              value: 7000,
              duration: { type: "thisTurn" },
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
  assert.equal(opened.state.battle?.step, "attack");
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

test("defender On Your Opponent's Attack filtered hand-trash cost can be paid or declined", () => {
  const openAttackWithFilteredHandTrashCost = (preUsed = false) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const source = must(p2State.characters[0], "opponent attack source");
    const costCard = must(p2State.hand[0], "8000 power hand cost card");
    state.cardManifest.cards[costCard.cardId] = resolvedCard({
      cardId: costCard.cardId,
      category: "character",
      power: 8000,
    });
    const definition = withOnOpponentAttackDrawEffect(
      state,
      source,
      "def-on-opponent-attack-filtered-hand-trash-base-power",
    );
    const effect = must(definition.effects[0], "On Opponent Attack effect");
    state.cardManifest.effectDefinitions = {
      ...state.cardManifest.effectDefinitions,
      "def-on-opponent-attack-filtered-hand-trash-base-power": {
        ...definition,
        effects: [
          {
            ...effect,
            oncePerTurn: true,
            effect: optionalFilteredHandTrashThenSetBasePowerSequence(),
          },
        ],
      },
    };
    if (preUsed) {
      state.oncePerTurn = [
        {
          cardInstanceId: source.instanceId,
          effectId: effect.id,
          turnNumber: state.turn.globalTurn,
          usedAtStateSeq: state.seq,
        },
      ];
    }

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
    if (!preUsed) {
      assert.equal(opened.state.pendingDecision?.type, "payCost");
      assert.equal(opened.state.pendingDecision.playerId, p2);
      assert.equal(opened.state.pendingDecision.cost.type, "trashFromHand");
    }
    return { effect, opened, costCard, source };
  };

  const paidAttack = openAttackWithFilteredHandTrashCost();
  const paidDecision = must(
    paidAttack.opened.state.pendingDecision,
    "paid attack decision",
  );
  const paid = applyAction(paidAttack.opened.state, {
    type: "respondToDecision",
    decisionId: paidDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [paidAttack.costCard.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.oncePerTurn.length, 1);
  assert.deepEqual(paid.state.oncePerTurn[0], {
    cardInstanceId: paidAttack.source.instanceId,
    effectId: paidAttack.effect.id,
    turnNumber: paidAttack.opened.state.turn.globalTurn,
    usedAtStateSeq: paid.state.oncePerTurn[0]?.usedAtStateSeq,
  });
  assert.equal(paid.state.battle?.step, "counter");
  assert.equal(paid.state.pendingDecision?.type, "selectCards");
  assert.equal(
    must(paid.state.players[p2], "paid p2").trash[0]?.instanceId,
    paidAttack.costCard.instanceId,
  );
  assert.deepEqual(
    paid.state.continuousEffects.map((record) => ({
      layer: record.modifier.layer,
      operation: record.modifier.operation,
      targetType: record.modifier.target.type,
    })),
    [
      {
        layer: "basePowerSet",
        operation: { type: "setBasePower", value: 7000 },
        targetType: "exactCard",
      },
      {
        layer: "basePowerSet",
        operation: { type: "setBasePower", value: 7000 },
        targetType: "self",
      },
    ],
  );

  const declinedAttack = openAttackWithFilteredHandTrashCost();
  const declinedDecision = must(
    declinedAttack.opened.state.pendingDecision,
    "declined attack decision",
  );
  const declined = applyAction(declinedAttack.opened.state, {
    type: "respondToDecision",
    decisionId: declinedDecision.id,
    response: { type: "paymentDeclined" },
  });

  assert.equal(declined.errors, undefined);
  assert.deepEqual(declined.state.oncePerTurn, []);
  assert.equal(declined.state.battle?.step, "counter");
  assert.equal(declined.state.pendingDecision?.type, "selectCards");
  assert.equal(must(declined.state.players[p2], "declined p2").trash.length, 0);
  assert.deepEqual(declined.state.continuousEffects, []);

  const usedAttack = openAttackWithFilteredHandTrashCost(true);
  assert.notEqual(usedAttack.opened.state.pendingDecision?.type, "payCost");
  assert.equal(
    usedAttack.opened.state.effectQueue.some(
      (entry) => entry.effectBlockId === usedAttack.effect.id,
    ),
    false,
  );
});

test("defender On Your Opponent's Attack selected target can become current attack target", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.characters[0], "opponent attack source");
  const newTarget = {
    ...must(p2State.hand[0], "new attack target"),
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p2State.characters = [...p2State.characters, newTarget];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = withOnOpponentAttackDrawEffect(
    state,
    source,
    "def-on-opponent-attack-change-target",
  );
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-change-target": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: selectLeaderOrCharacterThenRetargetSequence(),
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
  assert.equal(opened.state.pendingDecision?.type, "selectTargets");
  assert.equal(opened.state.pendingDecision.playerId, p2);

  const targeted = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
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
  assert.equal(
    targeted.state.battle?.currentTarget.instanceId,
    newTarget.instanceId,
  );
  assert.equal(targeted.state.battle.currentTarget.cardId, newTarget.cardId);
  assert.equal(targeted.state.battle.step, "counter");
  assert.equal(targeted.state.pendingDecision?.type, "selectCards");
});

test("defender On Your Opponent's Attack retarget to active Character keeps counter pass executable", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = p2State.leader;
  const newTarget = {
    ...must(p2State.hand[0], "new attack target"),
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p2State.characters = [...p2State.characters, newTarget];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = withOnOpponentAttackDrawEffect(
    state,
    source,
    "def-on-opponent-attack-retarget-active-character",
  );
  const effect = must(definition.effects[0], "On Opponent Attack effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-opponent-attack-retarget-active-character": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: selectLeaderOrCharacterThenRetargetSequence(),
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
  assert.equal(opened.state.pendingDecision?.type, "selectTargets");

  const targeted = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: opened.state.pendingDecision.id,
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
    assert.fail("expected counter-step pass action after attack retarget");
  }

  const passed = applyAction(targeted.state, passAction);

  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.battle, undefined);
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

test("defender On Your Opponent's Attack duplicate card instances get distinct trigger ids", () => {
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
  withOnOpponentAttackDrawEffect(
    state,
    firstSource,
    "def-on-opponent-attack-duplicate-card-draw",
  );

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
  assert.equal(new Set(opened.state.pendingDecision.triggerIds).size, 2);
  assert.deepEqual(
    opened.state.effectQueue.map((entry) => entry.source.instanceId),
    [firstSource.instanceId, secondSource.instanceId],
  );
});
