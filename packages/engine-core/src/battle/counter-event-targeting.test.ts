import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  SelectionId,
  SpotlightEntryCreatedPayload,
} from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { applyDeclareAttack } from "./actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import {
  cardRef,
  ensureActiveDonInCostArea,
  installSupportedCounterEvent,
  setupAttackState,
} from "./test-fixtures.js";
import { computeView } from "../view/compute-view.js";

type EngineInternalBattleState = NonNullable<
  ReturnType<typeof setupAttackState>["battle"]
> & { counterPower?: number };

const battleCounterPower = (
  battle: ReturnType<typeof setupAttackState>["battle"],
): number | undefined =>
  (battle as EngineInternalBattleState | undefined)?.counterPower;

const installChooseLeaderOrCharacterCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  installSupportedCounterEvent(state, counterEvent, 4000);
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
          condition: {
            type: "hasCardInZone",
            player: "self",
            zone: "leaderArea",
            filter: { categories: ["leader"], names: ["leader-blue"] },
          },
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
            value: 4000,
            duration: { type: "thisBattle" },
          },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };
};

const installNamedLeaderOrCharacterCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  const { condition, ...counterEffectWithoutCondition } = counterEffect;
  assert.notEqual(condition, undefined);
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...counterEffectWithoutCondition,
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
                filter: { names: ["Enel"] },
              },
            },
            value: 2000,
            duration: { type: "thisBattle" },
          },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };
};

const installTrashHandCostLeaderOrCharacterCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  const { condition, ...counterEffectWithoutCondition } = counterEffect;
  void condition;
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 0,
    effectText:
      "[Counter] You may trash 1 card from your hand: Up to 1 of your Leader or Character cards gains +3000 power during this battle.",
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
          ...counterEffectWithoutCondition,
          effect: {
            type: "sequence",
            effects: [
              {
                id: "cost:trashFromHand",
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
                id: "body:power",
                connector: "ifYouDo",
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
                  value: 3000,
                  duration: { type: "thisBattle" },
                },
              },
            ],
          },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };
};

const addTrashCards = (
  state: ReturnType<typeof setupAttackState>,
  count: number,
): CardInstance => {
  const p2State = must(state.players[p2], "p2");
  const selectedCardId = "trash-black-character" as CardInstance["cardId"];
  state.cardManifest.cards[selectedCardId] = resolvedCard({
    cardId: selectedCardId,
    category: "character",
    cost: 3,
    power: 3000,
  });
  state.cardManifest.cards[selectedCardId].colors = ["black"];
  p2State.trash = Array.from({ length: count }, (_, index) => {
    const cardId =
      index === 0
        ? selectedCardId
        : (`trash-filler-${String(index)}` as CardInstance["cardId"]);
    if (index > 0) {
      state.cardManifest.cards[cardId] = resolvedCard({
        cardId,
        category: "character",
        cost: 5,
        power: 3000,
      });
      state.cardManifest.cards[cardId].colors = ["red"];
    }
    return {
      instanceId: `p2:trash:${String(index)}` as CardInstance["instanceId"],
      cardId,
      owner: p2,
      controller: p2,
      zone: { zone: "trash", playerId: p2, slot: "trash", index },
      state: "active",
      attachedDon: [],
    };
  });
  return must(p2State.trash[0], "selected trash card");
};

const installCounterPowerThenTrashToHandEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const first = must(definition.effects[0], "first counter effect");
  const powerEffect = first.effect;
  assert.equal(powerEffect.type, "modifyPower");
  const trashSelection = "trashSelection:addToHand" as SelectionId;
  const counterBlock: EffectDefinition["effects"][number] = {
    ...first,
    effect: {
      type: "sequence",
      effects: [
        { connector: "always", effect: { ...powerEffect, value: 1000 } },
        {
          connector: "then",
          effect: {
            type: "conditional",
            if: {
              type: "trashCount",
              player: "self",
              op: "gte",
              value: 10,
            },
            then: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: trashSelection,
                  effect: {
                    type: "selectCards",
                    zone: "trash",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      colorsAny: ["black"],
                      categories: ["character"],
                      cost: { max: 3 },
                    },
                    saveAs: trashSelection,
                    visibility: "bothPlayers",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveSelected",
                    selection: trashSelection,
                    from: "trash",
                    to: "hand",
                  },
                },
              ],
            },
          },
        },
      ],
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [counterBlock],
    },
  };
};

const installConditionCurrentlyFalseCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
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
};

test("conditional Counter Event can apply choose-from-leader-or-character power to another defender card", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const battleTarget = must(opened.state.battle, "battle").currentTarget;
  const nonBattleTarget = cardRef(defenderCharacter, p2);

  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId &&
        action.target.instanceId === nonBattleTarget.instanceId,
    ),
    true,
  );
  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: nonBattleTarget,
  });

  assert.equal(used.errors, undefined);
  const spotlight = must(
    used.events.find((event) => event.type === "spotlightEntryCreated"),
    "counter spotlight",
  ).payload as SpotlightEntryCreatedPayload;
  assert.equal(spotlight.entry.kind, "combat");
  assert.equal(spotlight.entry.combat.eventKind, "counterUsed");
  assert.equal(
    spotlight.entry.combat.target.instanceId,
    battleTarget.instanceId,
  );
  assert.notEqual(
    spotlight.entry.combat.target.instanceId,
    nonBattleTarget.instanceId,
  );
  assert.equal(battleCounterPower(used.state.battle), undefined);
  const view = computeView(used.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 7000);
  assert.equal(view.cards[p2State.leader.instanceId]?.currentPower, 5000);
});

test("trash-from-hand cost Counter Event pays cost before applying selected leader-or-character power", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const costCard = must(p2State.hand[1], "cost card");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installTrashHandCostLeaderOrCharacterCounterEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const nonBattleTarget = cardRef(defenderCharacter, p2);
  const useCounterActions = getLegalActions(opened.state, p2).filter(
    (action) =>
      action.type === "useCounter" &&
      action.cardInstanceId === counterEvent.instanceId,
  );
  assert.equal(useCounterActions.length, 1);

  const use = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(use.errors, undefined);
  assert.equal(use.state.pendingDecision?.type, "payCost");
  assert.equal(use.state.pendingDecision.cost.type, "trashFromHand");

  const paid = applyAction(use.state, {
    type: "respondToDecision",
    decisionId: use.state.pendingDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [costCard.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision?.type, "selectTargets");
  const targetDecision = must(paid.state.pendingDecision, "target decision");
  assert.equal(
    must(paid.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === costCard.instanceId,
    ),
    true,
  );
  assert.equal(battleCounterPower(paid.state.battle), undefined);
  assert.equal(
    must(paid.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === counterEvent.instanceId,
    ),
    true,
  );

  const targeted = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [nonBattleTarget] },
  });
  assert.equal(targeted.errors, undefined);
  const view = computeView(paid.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 3000);
  const targetedView = computeView(targeted.state);
  assert.equal(
    targetedView.cards[defenderCharacter.instanceId]?.currentPower,
    6000,
  );
  assert.equal(
    targetedView.cards[p2State.leader.instanceId]?.currentPower,
    5000,
  );
});

test("Counter Event named leader-or-character target filter is supported by battle targeting", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installNamedLeaderOrCharacterCounterEvent(state, counterEvent);
  state.cardManifest.cards[defenderCharacter.cardId] = {
    ...must(
      state.cardManifest.cards[defenderCharacter.cardId],
      "defender character metadata",
    ),
    name: "Enel",
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const namedTarget = cardRef(defenderCharacter, p2);

  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId &&
        action.target.instanceId === namedTarget.instanceId,
    ),
    true,
  );
  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: namedTarget,
  });

  assert.equal(used.errors, undefined);
  assert.equal(battleCounterPower(used.state.battle), undefined);
  const view = computeView(used.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 5000);
  assert.equal(view.cards[p2State.leader.instanceId]?.currentPower, 5000);
});

test("nonzero-cost Counter Event preserves a chosen non-battle target through payment", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  ensureActiveDonInCostArea(state, p2, 1);
  const counterEvent = must(p2State.hand[0], "counter event");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installChooseLeaderOrCharacterCounterEvent(state, counterEvent);
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 1,
    effectText:
      "[Counter] If your Leader is [Imu], up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: `${String(counterEvent.cardId)}:counter`,
    },
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const nonBattleTarget = cardRef(defenderCharacter, p2);
  const use = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: nonBattleTarget,
  });
  assert.equal(use.errors, undefined);
  assert.equal(use.state.pendingDecision?.type, "payCost");
  const activeDon = must(
    must(use.state.players[p2], "p2").costArea.find(
      (don) => don.state === "active",
    ),
    "active don",
  );

  const paid = applyAction(use.state, {
    type: "respondToDecision",
    decisionId: must(use.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [activeDon.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(battleCounterPower(paid.state.battle), undefined);
  const view = computeView(paid.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 7000);
  assert.equal(view.cards[p2State.leader.instanceId]?.currentPower, 5000);
});

test("Counter Event resolves selected power then conditional trash-to-hand sequence", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const defenderCharacter = must(p2State.characters[0], "defender character");
  const selectedTrashCard = addTrashCards(state, 10);
  installCounterPowerThenTrashToHandEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: cardRef(defenderCharacter, p2),
  });

  assert.equal(used.errors, undefined);
  assert.equal(used.state.pendingDecision?.type, "selectCards");
  const decision = must(used.state.pendingDecision, "trash selection");
  const selected = must(
    decision.candidates.find(
      (candidate) => candidate.card.instanceId === selectedTrashCard.instanceId,
    ),
    "selected trash candidate",
  ).card;
  const resolved = applyAction(used.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === selectedTrashCard.instanceId,
    ),
    true,
  );
  assert.equal(
    must(resolved.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === selectedTrashCard.instanceId,
    ),
    false,
  );
  assert.equal(resolved.state.battle?.step, "counter");
  assert.equal(
    resolved.state.pendingDecision?.prompt,
    "Use counter or end step.",
  );
  assert.equal(
    getLegalActions(resolved.state, p2).some(
      (action) => action.type === "respondToDecision",
    ),
    true,
  );
  const view = computeView(resolved.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 4000);
});

test("condition-failed Counter Event in hand does not poison another legal Counter Event", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const legalCounterEvent = must(p2State.hand[0], "legal counter event");
  const conditionFailedCounterEvent = must(
    p2State.hand[1],
    "condition-failed counter event",
  );
  const defenderCharacter = must(p2State.characters[0], "defender character");
  installCounterPowerThenTrashToHandEvent(state, legalCounterEvent);
  installConditionCurrentlyFalseCounterEvent(
    state,
    conditionFailedCounterEvent,
  );

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === legalCounterEvent.instanceId &&
        action.target.instanceId === defenderCharacter.instanceId,
    ),
    true,
  );

  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: legalCounterEvent.instanceId,
    target: cardRef(defenderCharacter, p2),
  });

  assert.equal(used.errors, undefined);
  assert.equal(used.state.pendingDecision?.type, "selectCards");
});
