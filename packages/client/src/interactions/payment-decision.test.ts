import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecision,
} from "@optcg/types";

import {
  optionalCardCostActionForInstance,
  optionalCardCostGroupForActionIndex,
  optionalCardCostInstanceIds,
  createOptionalCardCostChoice,
  createOptionalCardCostModalActions,
} from "./payment-decision.js";
import type { ClientActionModel } from "../view-model.js";

const payCostDecision = {
  id: "decision:payCost:sequence:queue-1:0" as DecisionId,
  type: "payCost",
  playerId: "p1" as PlayerId,
  prompt: "Choose whether to pay this optional cost.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
} satisfies PublicPendingDecision;

describe("optional card-cost interaction", () => {
  test("collapses per-card payCost actions into decline or choose-card options", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-2" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.deepEqual(choice, {
      decisionId: payCostDecision.id,
      declineActionIndex: 1,
      groups: [
        {
          chooseActionIndex: -5,
          chooseLabel: "Choose card to trash",
          cardActions: [
            { instanceId: "hand-1", actionIndex: 2 },
            { instanceId: "hand-2", actionIndex: 3 },
          ],
        },
      ],
    });
    assert.deepEqual(createOptionalCardCostModalActions(choice), [
      { index: 1, type: "respondToDecision", label: "Decline cost" },
      {
        index: -5,
        type: "respondToDecision",
        label: "Choose card to trash",
      },
    ]);
  });

  test("uses dynamic card-cost choose labels for non-trash costs", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Return 1 Character",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose Character to return to hand",
          selectedCardInstanceIds: ["character-1" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.deepEqual(createOptionalCardCostModalActions(choice), [
      { index: 1, type: "respondToDecision", label: "Decline cost" },
      {
        index: -5,
        type: "respondToDecision",
        label: "Choose Character to return to hand",
      },
    ]);
  });

  test("does not collapse non-card or multi-card payment actions", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 2 cards",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: [
            "hand-1" as InstanceId,
            "hand-2" as InstanceId,
          ],
        },
      },
    ];

    assert.equal(
      createOptionalCardCostChoice(payCostDecision, actions),
      undefined,
    );
  });

  test("does not collapse mixed payment families", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 DON!!",
      },
    ];

    assert.equal(
      createOptionalCardCostChoice(payCostDecision, actions),
      undefined,
    );
  });

  test("collapses mixed card-cost labels into scoped choose-card options", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Return 1 Character",
        decisionPayment: {
          kind: "cardCost",
          chooseLabel: "Choose Character to return to hand",
          selectedCardInstanceIds: ["character-1" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.deepEqual(createOptionalCardCostModalActions(choice), [
      { index: 1, type: "respondToDecision", label: "Decline cost" },
      {
        index: -5,
        type: "respondToDecision",
        label: "Choose card to trash",
      },
      {
        index: -6,
        type: "respondToDecision",
        label: "Choose Character to return to hand",
      },
    ]);

    const trashGroup = optionalCardCostGroupForActionIndex(choice, -5);
    const returnGroup = optionalCardCostGroupForActionIndex(choice, -6);
    assert.deepEqual(optionalCardCostInstanceIds(trashGroup), ["hand-1"]);
    assert.deepEqual(optionalCardCostInstanceIds(returnGroup), ["character-1"]);
    assert.equal(optionalCardCostActionForInstance(trashGroup, "hand-1"), 2);
    assert.equal(
      optionalCardCostActionForInstance(trashGroup, "character-1"),
      undefined,
    );
  });
});
