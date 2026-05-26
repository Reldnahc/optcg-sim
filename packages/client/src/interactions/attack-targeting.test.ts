import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { InstanceId } from "@optcg/types";

import {
  ATTACK_TARGET_CHOICE_ACTION_INDEX,
  attackTargetActionForInstance,
  attackTargetInstanceIds,
  createAttackTargetChoice,
  createCollapsedAttackActions,
} from "./attack-targeting.js";
import type { ClientActionModel } from "../view-model.js";

describe("attack targeting interaction", () => {
  test("collapses target-specific attack actions into one attack choice", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 7,
        type: "declareAttack",
        label: "Attack with leader into opponent leader",
        attack: {
          attackerInstanceId: "attacker-1" as InstanceId,
          targetInstanceId: "target-leader" as InstanceId,
        },
      },
      {
        index: 8,
        type: "declareAttack",
        label: "Attack with leader into opponent character",
        attack: {
          attackerInstanceId: "attacker-1" as InstanceId,
          targetInstanceId: "target-character" as InstanceId,
        },
      },
      { index: 9, type: "activateEffect", label: "Activate effect" },
    ];

    const choice = createAttackTargetChoice("attacker-1", actions);

    assert.deepEqual(choice, {
      attackerInstanceId: "attacker-1",
      chooseActionIndex: ATTACK_TARGET_CHOICE_ACTION_INDEX,
      targetActions: [
        { targetInstanceId: "target-leader", actionIndex: 7 },
        { targetInstanceId: "target-character", actionIndex: 8 },
      ],
    });
    assert.deepEqual(createCollapsedAttackActions(actions), [
      {
        index: ATTACK_TARGET_CHOICE_ACTION_INDEX,
        type: "chooseAttackTarget",
        label: "Attack",
      },
      { index: 9, type: "activateEffect", label: "Activate effect" },
    ]);
    assert.deepEqual(attackTargetInstanceIds(choice), [
      "target-leader",
      "target-character",
    ]);
    assert.equal(attackTargetActionForInstance(choice, "target-character"), 8);
  });

  test("leaves non-attack action lists unchanged", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 9, type: "activateEffect", label: "Activate effect" },
    ];

    assert.equal(createAttackTargetChoice("attacker-1", actions), undefined);
    assert.deepEqual(createCollapsedAttackActions(actions), actions);
  });
});
