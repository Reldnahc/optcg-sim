import assert from "node:assert/strict";
import { test } from "vitest";

import { isSupportedContinuousQueueEffect } from "./continuous.js";

test("continuous support accepts all filtered color and base-cost power modifiers", () => {
  assert.equal(
    isSupportedContinuousQueueEffect({
      type: "modifyPower",
      target: {
        type: "all",
        player: "self",
        zone: "characterArea",
        filter: {
          categories: ["character"],
          colorsAny: ["green"],
          typesAny: ["Straw Hat Crew"],
          baseCost: { min: 4 },
        },
      },
      value: 1000,
      duration: { type: "whileConditionTrue", condition: { type: "yourTurn" } },
    }),
    true,
  );
});

test("continuous support accepts power modifiers scaled by matching field Characters", () => {
  assert.equal(
    isSupportedContinuousQueueEffect({
      type: "modifyPower",
      target: { type: "myLeader" },
      value: {
        type: "countMatchingFieldCards",
        player: "self",
        zone: "characterArea",
        filter: { categories: ["character"] },
        multiplier: 1000,
      },
      duration: { type: "thisTurn" },
    }),
    true,
  );
});
