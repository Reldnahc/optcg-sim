import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecision,
} from "@optcg/types";

import {
  createCanonicalDonPaymentActions,
  createCanonicalDonPaymentModalActions,
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
          operation: "trash",
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
          operation: "trash",
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
          operation: "trash",
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
          operation: "returnToHand",
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
          operation: "trash",
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
          operation: "trash",
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

  test("combines same-operation card costs with different legal zones into one scoped choice", () => {
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
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 Character",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose Character to trash",
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
    ]);

    const trashGroup = optionalCardCostGroupForActionIndex(choice, -5);
    assert.deepEqual(optionalCardCostInstanceIds(trashGroup), [
      "hand-1",
      "character-1",
    ]);
    assert.equal(optionalCardCostActionForInstance(trashGroup, "hand-1"), 2);
    assert.equal(
      optionalCardCostActionForInstance(trashGroup, "character-1"),
      3,
    );
  });
});

describe("DON payment interaction", () => {
  test("collapses four legal ways to pay three active DON into one action", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 7, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentActions(actions), [
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ]);
  });

  test("collapses DON payment combinations while preserving unrelated global actions", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 0, type: "concede", label: "Concede" },
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 7, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentActions(actions), [
      { index: 0, type: "concede", label: "Concede" },
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ]);
  });

  test("collapses equivalent DON payment combinations to the first canonical action", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentModalActions(actions), [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
    ]);
  });

  test("keeps distinct DON payment counts as distinct canonical actions", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentModalActions(actions), [
      { index: 4, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ]);
  });

  test("does not collapse mixed non-DON payment actions", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 5, type: "respondToDecision", label: "Choose 1 card" },
    ];

    assert.equal(createCanonicalDonPaymentModalActions(actions), undefined);
  });
});
