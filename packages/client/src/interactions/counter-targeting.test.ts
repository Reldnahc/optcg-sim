import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { InstanceId } from "@optcg/types";

import {
  COUNTER_TARGET_CHOICE_ACTION_INDEX,
  counterTargetActionForInstance,
  counterTargetInstanceIds,
  createCollapsedCounterActions,
  createCounterTargetChoice,
} from "./counter-targeting.js";
import type { ClientActionModel } from "../view-model.js";

describe("counter targeting interaction", () => {
  test("collapses target-specific counter actions into one counter choice", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "useCounter",
        label: "Counter with event",
        counter: {
          cardInstanceId: "counter-event" as InstanceId,
          targetInstanceId: "leader-target" as InstanceId,
          amount: 2000,
        },
      },
      {
        index: 5,
        type: "useCounter",
        label: "Counter with event",
        counter: {
          cardInstanceId: "counter-event" as InstanceId,
          targetInstanceId: "character-target" as InstanceId,
          amount: 2000,
        },
      },
      { index: 6, type: "activateEffect", label: "Activate effect" },
    ];

    const choice = createCounterTargetChoice("counter-event", actions);

    assert.deepEqual(choice, {
      counterCardInstanceId: "counter-event",
      chooseActionIndex: COUNTER_TARGET_CHOICE_ACTION_INDEX,
      targetActions: [
        { targetInstanceId: "leader-target", actionIndex: 4 },
        { targetInstanceId: "character-target", actionIndex: 5 },
      ],
    });
    assert.deepEqual(createCollapsedCounterActions(actions), [
      {
        index: COUNTER_TARGET_CHOICE_ACTION_INDEX,
        type: "chooseCounterTarget",
        label: "Counter +2000",
      },
      { index: 6, type: "activateEffect", label: "Activate effect" },
    ]);
    assert.deepEqual(counterTargetInstanceIds(choice), [
      "leader-target",
      "character-target",
    ]);
    assert.equal(counterTargetActionForInstance(choice, "character-target"), 5);
  });

  test("leaves single-target counter action lists unchanged", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "useCounter",
        label: "Counter with event",
        counter: {
          cardInstanceId: "counter-event" as InstanceId,
          targetInstanceId: "leader-target" as InstanceId,
        },
      },
    ];

    assert.equal(
      createCounterTargetChoice("counter-event", actions),
      undefined,
    );
    assert.deepEqual(createCollapsedCounterActions(actions), actions);
  });

  test("does not collapse separate Counter Event effects into target choice UI", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "useCounter",
        label: "Draw",
        counter: {
          cardInstanceId: "counter-event" as InstanceId,
          effectId: "counter-event:draw",
          targetInstanceId: "leader-target" as InstanceId,
        },
      },
      {
        index: 5,
        type: "useCounter",
        label: "Power",
        counter: {
          cardInstanceId: "counter-event" as InstanceId,
          effectId: "counter-event:power",
          targetInstanceId: "leader-target" as InstanceId,
        },
      },
    ];

    assert.deepEqual(createCollapsedCounterActions(actions), actions);
  });
});
