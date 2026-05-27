import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition } from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  cardRef,
  ensureActiveDonInCostArea,
  installSupportedCounterEvent,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";
import { computeView } from "./compute-view.js";

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
  assert.equal(battleCounterPower(used.state.battle), undefined);
  const view = computeView(used.state);
  assert.equal(view.cards[defenderCharacter.instanceId]?.currentPower, 7000);
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
