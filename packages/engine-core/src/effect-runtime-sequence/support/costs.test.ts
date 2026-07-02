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

test("pay-cost support accepts field-trash costs with public field filters", () => {
  assert.equal(
    isSupportedPayCostSegment({
      type: "payCost",
      cost: {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        optional: true,
        filter: {
          categories: ["character"],
          currentPower: { min: 6000 },
        },
      },
    }),
    true,
  );
});

test("choose-one rest-DON support requires the canonical self chooser shape", () => {
  assert.equal(
    isSupportedPayCostSegment({
      type: "payCost",
      cost: {
        type: "chooseOne",
        optional: true,
        options: [
          {
            type: "restDon",
            count: 1,
            optional: true,
          },
          {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            optional: true,
          },
        ],
      },
    }),
    false,
  );
});

test("choose-one field-trash support uses public field filters", () => {
  assert.equal(
    isSupportedPayCostSegment({
      type: "payCost",
      cost: {
        type: "chooseOne",
        optional: true,
        options: [
          {
            type: "trashFromField",
            count: 1,
            chooser: "self",
            optional: true,
            filter: {
              categories: ["character"],
              attachedDon: { min: 1 },
            },
          },
          {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            optional: true,
          },
        ],
      },
    }),
    true,
  );
});
