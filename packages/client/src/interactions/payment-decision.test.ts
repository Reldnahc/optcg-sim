import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecision,
} from "@optcg/types";

import {
  createOptionalTrashCardCostChoice,
  createOptionalTrashCardCostModalActions,
} from "./payment-decision.js";
import type { ClientActionModel } from "../view-model.js";

const payCostDecision = {
  id: "decision:payCost:sequence:queue-1:0" as DecisionId,
  type: "payCost",
  playerId: "p1" as PlayerId,
  prompt: "Choose whether to pay this optional cost.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
} satisfies PublicPendingDecision;

describe("optional trash-card cost interaction", () => {
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
          kind: "trashCardCost",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "trashCardCost",
          selectedCardInstanceIds: ["hand-2" as InstanceId],
        },
      },
    ];

    const choice = createOptionalTrashCardCostChoice(payCostDecision, actions);

    assert.deepEqual(choice, {
      decisionId: payCostDecision.id,
      declineActionIndex: 1,
      cardActions: [
        { instanceId: "hand-1", actionIndex: 2 },
        { instanceId: "hand-2", actionIndex: 3 },
      ],
    });
    assert.deepEqual(createOptionalTrashCardCostModalActions(choice), [
      { index: 1, type: "respondToDecision", label: "Decline cost" },
      {
        index: -5,
        type: "respondToDecision",
        label: "Choose card to trash",
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
          kind: "trashCardCost",
          selectedCardInstanceIds: [
            "hand-1" as InstanceId,
            "hand-2" as InstanceId,
          ],
        },
      },
    ];

    assert.equal(
      createOptionalTrashCardCostChoice(payCostDecision, actions),
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
          kind: "trashCardCost",
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
      createOptionalTrashCardCostChoice(payCostDecision, actions),
      undefined,
    );
  });
});
