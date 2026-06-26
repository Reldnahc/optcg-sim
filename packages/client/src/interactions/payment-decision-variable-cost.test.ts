import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecision,
  Zone,
} from "@optcg/types";

import type { ClientActionModel } from "../view-model.js";
import {
  autoOptionalCardCostGroup,
  cardCostGroupRequiresManualConfirm,
  cardCostPaymentLabel,
  createOptionalCardCostChoice,
  optionalCardCostActionForSelection,
} from "./payment-decision.js";

const payCostDecision = {
  id: "decision:payCost:sequence:queue-1:0" as DecisionId,
  spotlightPendingId:
    "spotlight:decision:payCost:sequence:queue-1:0" as PublicPendingDecision["spotlightPendingId"],
  type: "payCost",
  playerId: "p1" as PlayerId,
  prompt: "Choose whether to pay this optional cost.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  presentation: {
    title: "Pay cost",
    instruction: "Choose whether to pay this optional cost",
  },
} satisfies PublicPendingDecision;

describe("variable card-cost interaction", () => {
  test("collapses variable trash-from-hand payments into one manual selectable group", () => {
    const source = { zone: "hand" as Zone, playerId: "p1" as PlayerId };
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
          selectedCardInstanceIds: ["event-1" as InstanceId],
          source,
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 2 cards",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: [
            "event-1" as InstanceId,
            "stage-1" as InstanceId,
          ],
          source,
        },
      },
    ];

    const group = autoOptionalCardCostGroup(
      createOptionalCardCostChoice(payCostDecision, actions),
    );

    assert.deepEqual(group, {
      chooseActionIndex: -5,
      operation: "trash",
      chooseLabel: "Choose card to trash",
      minCount: 1,
      requiredCount: 2,
      source,
      cardActions: [
        { instanceIds: ["event-1"], actionIndex: 2 },
        { instanceIds: ["event-1", "stage-1"], actionIndex: 3 },
      ],
    });
    assert.equal(cardCostGroupRequiresManualConfirm(group), true);
    assert.equal(optionalCardCostActionForSelection(group, ["event-1"]), 2);
    assert.equal(
      optionalCardCostActionForSelection(group, ["event-1", "stage-1"]),
      3,
    );
    assert.equal(cardCostPaymentLabel(group, 1), "Trash 1 card from hand");
    assert.equal(cardCostPaymentLabel(group, 2), "Trash 2 cards from hand");
  });
});
