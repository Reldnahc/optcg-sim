import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { DecisionId, PlayerId, PublicPendingDecision } from "@optcg/types";

import {
  createDecisionDraft,
  createDecisionModalModel,
} from "./decision-modal.js";
import type { ClientActionModel } from "../view-model.js";

const p1 = "p1" as PlayerId;

const basePayCostDecision = {
  id: "decision-quick-pay" as DecisionId,
  spotlightPendingId:
    "spotlight:decision-quick-pay" as PublicPendingDecision["spotlightPendingId"],
  type: "payCost",
  playerId: p1,
  prompt: "Pay cost",
  causedBy: { type: "playerAction", actionId: "action-quick-pay" },
  presentation: {
    title: "Pay cost",
    instruction: "Choose how to pay.",
  },
} satisfies PublicPendingDecision;

describe("quick-pay decision modal labels", () => {
  test("preserves quick-payable cost labels", () => {
    const decision: PublicPendingDecision = {
      ...basePayCostDecision,
      presentation: {
        ...basePayCostDecision.presentation,
        choices: [
          { responseKey: "rest-self", label: "Rest this card" },
          { responseKey: "trash-self", label: "Trash this card" },
          { responseKey: "rest-don", label: "Rest 1 DON!!" },
        ],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 2,
        type: "respondToDecision",
        label: "Rest this card",
        responseKey: "rest-self",
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Trash this card",
        responseKey: "trash-self",
      },
      {
        index: 4,
        type: "respondToDecision",
        label: "Rest 1 DON!!",
        responseKey: "rest-don",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "paymentOptions");
    assert.deepEqual(model.options, [
      { actionIndex: 2, label: "Rest this card" },
      { actionIndex: 3, label: "Trash this card" },
      { actionIndex: 4, label: "Rest 1 DON!!" },
    ]);
  });

  test("preserves single-DON payment labels", () => {
    const decision: PublicPendingDecision = {
      ...basePayCostDecision,
      presentation: {
        ...basePayCostDecision.presentation,
        choices: [{ responseKey: "payment:don:1", label: "Pay 1 DON!!" }],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 5,
        type: "respondToDecision",
        label: "Pay cost with 1 DON!!",
        responseKey: "payment:don:1",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "paymentOptions");
    assert.deepEqual(model.options, [{ actionIndex: 5, label: "Pay 1 DON!!" }]);
  });
});
