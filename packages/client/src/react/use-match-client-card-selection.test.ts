import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { PlayerId, Zone } from "@optcg/types";

import type { OptionalCardCostGroup } from "../interactions/payment-decision.js";
import { shouldAutoSubmitCardCostSelection } from "./use-match-client-card-selection.js";

const group = (
  overrides: Partial<OptionalCardCostGroup>,
): OptionalCardCostGroup => ({
  chooseActionIndex: -5,
  operation: "returnDon",
  chooseLabel: "Choose cards",
  requiredCount: 1,
  source: { zone: "costArea" as Zone, playerId: "p1" as PlayerId },
  cardActions: [{ instanceIds: ["card-1"], actionIndex: 2 }],
  ...overrides,
});

describe("match client card selection", () => {
  test("auto-submits completed single-choice hand-sourced card costs", () => {
    assert.equal(
      shouldAutoSubmitCardCostSelection({
        group: group({
          operation: "trash",
          source: { zone: "hand" as Zone, playerId: "p1" as PlayerId },
        }),
        complete: true,
      }),
      true,
    );
  });

  test("does not auto-submit completed multi-choice hand-sourced card costs", () => {
    assert.equal(
      shouldAutoSubmitCardCostSelection({
        group: group({
          operation: "trash",
          source: { zone: "hand" as Zone, playerId: "p1" as PlayerId },
          cardActions: [
            { instanceIds: ["card-1"], actionIndex: 2 },
            { instanceIds: ["card-2"], actionIndex: 3 },
          ],
        }),
        complete: true,
      }),
      false,
    );
  });

  test("auto-submits completed non-hidden card costs that do not require confirmation", () => {
    assert.equal(
      shouldAutoSubmitCardCostSelection({
        group: group({}),
        complete: true,
      }),
      true,
    );
  });
});
