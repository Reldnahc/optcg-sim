import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { DecisionId, PlayerId, Zone } from "@optcg/types";

import {
  activeCardCostGlobalActions,
  CLEAR_DECISION_SELECTION_ACTION_INDEX,
  CONFIRM_DECISION_SELECTION_ACTION_INDEX,
} from "./useMatchClient-support.js";
import type {
  OptionalCardCostChoice,
  OptionalCardCostGroup,
} from "../interactions/payment-decision.js";

const optionalChoice: OptionalCardCostChoice = {
  decisionId: "decision:return-don" as DecisionId,
  declineActionIndex: 1,
  groups: [],
};

const returnDonGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "returnDon",
  chooseLabel: "Choose DON!! to return",
  requiredCount: 2,
  source: { zone: "costArea" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    { instanceIds: ["don-1", "don-2"], actionIndex: 2 },
    { instanceIds: ["don-1", "don-3"], actionIndex: 3 },
  ],
};

const moveCardsGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "moveCards",
  chooseLabel: "Choose cards from trash",
  requiredCount: 2,
  source: { zone: "trash" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    { instanceIds: ["trash-1", "trash-2"], actionIndex: 2 },
    { instanceIds: ["trash-1", "trash-3"], actionIndex: 3 },
  ],
};

describe("match client support helpers", () => {
  test("active card-cost selections expose global confirm and clear actions", () => {
    assert.deepEqual(
      activeCardCostGlobalActions({
        choice: optionalChoice,
        group: moveCardsGroup,
        explicitChoiceActive: false,
        selectedInstanceCount: 2,
        selectedActionIndex: 2,
      }),
      [
        { index: 1, label: "Decline cost", type: "respondToDecision" },
        {
          index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
          label: "Pay cost",
          type: "confirmDecisionSelection",
        },
        {
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Clear selection",
          type: "clearDecisionSelection",
        },
      ],
    );
  });

  test("direct return-DON costs expose only decline while clicks drive payment", () => {
    assert.deepEqual(
      activeCardCostGlobalActions({
        choice: optionalChoice,
        group: returnDonGroup,
        explicitChoiceActive: false,
        selectedInstanceCount: 1,
        selectedActionIndex: undefined,
      }),
      [{ index: 1, label: "Decline cost", type: "respondToDecision" }],
    );
  });
});
