import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { computeView } from "../view/compute-view.js";
import { applyDeclareAttack } from "./actions.js";
import {
  cardRef,
  installSupportedCounterEvent,
  setupAttackState,
} from "./test-fixtures.js";

const installChooseLeaderOrCharacterCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
  value = 4000,
): void => {
  installSupportedCounterEvent(state, counterEvent, value);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...counterEffect,
          effect: {
            type: "modifyPower",
            target: {
              type: "chooseFromZones",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["leader", "character"] },
              },
            },
            value,
            duration: { type: "thisBattle" },
          },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };
};

const installTrashHandCostCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent, 3000);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 0,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: definitionId,
    },
  });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...counterEffect,
          effect: {
            type: "sequence",
            effects: [
              {
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
                connector: "ifYouDo",
                effect: counterEffect.effect,
              },
            ],
          },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };
};

const openCounterStep = (state: ReturnType<typeof setupAttackState>) => {
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  return opened;
};

test("Counter Event chooses a non-battle leader-or-character target through normal runtime targeting", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);

  const opened = openCounterStep(state);
  assert.deepEqual(
    getLegalActions(opened.state, p2).filter(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    [
      {
        type: "useCounter",
        cardInstanceId: counterEvent.instanceId,
        target: must(opened.state.battle, "battle").currentTarget,
      },
    ],
  );

  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(used.errors, undefined);
  const decision = must(used.state.pendingDecision, "target decision");
  assert.equal(decision.type, "selectTargets");

  const selected = applyAction(used.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [cardRef(defenderCharacter, p2)],
    },
  });
  assert.equal(selected.errors, undefined);
  const view = computeView(selected.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 7000);
  assert.equal(view.cards[p2State.leader.instanceId]?.currentPower, 5000);
});

test("Counter Event trash-from-hand cost resolves before normal target selection", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const costCard = must(p2State.hand[1], "cost card");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installTrashHandCostCounterEvent(state, counterEvent);

  const opened = openCounterStep(state);
  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(used.errors, undefined);
  const costDecision = must(used.state.pendingDecision, "cost decision");
  assert.equal(costDecision.type, "payCost");

  const paid = applyAction(used.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [costCard.instanceId],
    },
  });
  assert.equal(paid.errors, undefined);
  assert.equal(
    must(paid.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === costCard.instanceId,
    ),
    true,
  );
  assert.equal(
    must(paid.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === counterEvent.instanceId,
    ),
    true,
  );
  const targetDecision = must(paid.state.pendingDecision, "target decision");
  assert.equal(targetDecision.type, "selectTargets");

  const targeted = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [cardRef(defenderCharacter, p2)],
    },
  });
  assert.equal(targeted.errors, undefined);
  assert.equal(
    computeView(targeted.state).cards[defenderCharacter.instanceId]
      ?.currentPower,
    6000,
  );
});

test("condition-failed Counter Event does not hide another legal Counter Event", () => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const legalCounterEvent = must(p2State.hand[0], "legal counter event");
  const conditionFailedCounterEvent = must(
    p2State.hand[1],
    "condition-failed counter event",
  );
  installChooseLeaderOrCharacterCounterEvent(state, legalCounterEvent);
  installChooseLeaderOrCharacterCounterEvent(
    state,
    conditionFailedCounterEvent,
  );
  const definitionId = `${String(conditionFailedCounterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "conditional counter definition",
  );
  const first = must(definition.effects[0], "conditional counter effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...first,
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 10,
          },
        },
      ],
    },
  };

  const opened = openCounterStep(state);
  const legalActions = getLegalActions(opened.state, p2).filter(
    (action) => action.type === "useCounter",
  );

  assert.equal(
    legalActions.some(
      (action) => action.cardInstanceId === legalCounterEvent.instanceId,
    ),
    true,
  );
  assert.equal(
    legalActions.some(
      (action) =>
        action.cardInstanceId === conditionFailedCounterEvent.instanceId,
    ),
    false,
  );
});
