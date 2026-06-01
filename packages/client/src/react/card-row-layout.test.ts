import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { calculateCardRowLayout } from "./card-row-layout.js";

describe("card row layout", () => {
  test("uses available lane width before overlapping cards", () => {
    assert.deepEqual(
      calculateCardRowLayout({
        availableWidth: 200,
        laneExtensionWidth: 80,
        cardWidth: 60,
        cardCount: 5,
      }),
      {
        overlap: 5,
        laneExtension: 80,
        edgePacked: true,
      },
    );
  });

  test("does not overlap when the lane extension can absorb overflow", () => {
    assert.deepEqual(
      calculateCardRowLayout({
        availableWidth: 200,
        laneExtensionWidth: 200,
        cardWidth: 60,
        cardCount: 5,
      }),
      {
        overlap: 0,
        laneExtension: 100,
        edgePacked: true,
      },
    );
  });
});
