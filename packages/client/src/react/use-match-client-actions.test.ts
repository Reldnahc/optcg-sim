import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { PlayerId, Zone } from "@optcg/types";

import { cardCostConfirmActionIndex } from "./use-match-client-actions.js";
import type { OptionalCardCostGroup } from "../interactions/payment-decision.js";

const variableTrashGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "trash",
  chooseLabel: "Choose card to trash",
  minCount: 1,
  requiredCount: 2,
  source: { zone: "hand" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    { instanceIds: ["event-1"], actionIndex: 2 },
    { instanceIds: ["event-1", "stage-1"], actionIndex: 3 },
  ],
};

describe("match client action helpers", () => {
  test("card-cost confirm submits the selected payment action", () => {
    assert.equal(cardCostConfirmActionIndex(variableTrashGroup, 2), 2);
  });

  test("card-cost confirm is unavailable without a resolved payment action", () => {
    assert.equal(
      cardCostConfirmActionIndex(variableTrashGroup, undefined),
      undefined,
    );
    assert.equal(cardCostConfirmActionIndex(undefined, 2), undefined);
  });
});
