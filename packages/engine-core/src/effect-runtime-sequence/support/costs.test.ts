import assert from "node:assert/strict";
import { test } from "vitest";

import { isSupportedPayCostSegment } from "./costs.js";

test("pay-cost support accepts move-field-to-Life costs with public field filters", () => {
  assert.equal(
    isSupportedPayCostSegment({
      type: "payCost",
      cost: {
        type: "moveFieldToLife",
        count: 1,
        chooser: "self",
        player: "self",
        filter: {
          categories: ["character"],
          cost: { min: 3 },
          currentPower: { min: 7000 },
        },
        position: "top",
        faceUp: true,
        optional: true,
      },
    }),
    true,
  );
});
