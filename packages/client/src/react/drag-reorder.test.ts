import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  isPointerInOriginalHorizontalSlot,
  reorderPlacementFromPointer,
} from "./drag-reorder.js";

const rect = ({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect =>
  ({
    left,
    top,
    width,
    height,
  }) as DOMRect;

describe("drag reorder", () => {
  test("horizontal reorder rows use x position even when cards are tall", () => {
    const cardRect = rect({ left: 100, top: 100, width: 50, height: 70 });
    const rowRect = rect({ left: 0, top: 90, width: 320, height: 90 });

    assert.equal(
      reorderPlacementFromPointer(cardRect, 95, 175, rowRect),
      "before",
    );
    assert.equal(
      reorderPlacementFromPointer(cardRect, 155, 95, rowRect),
      "after",
    );
  });

  test("original slot snap scales to visible spacing in overlapped rows", () => {
    assert.equal(
      isPointerInOriginalHorizontalSlot({
        clientX: 100,
        originalLeft: 70,
        originalWidth: 60,
        neighborCenterXs: [80, 120],
      }),
      true,
    );
    assert.equal(
      isPointerInOriginalHorizontalSlot({
        clientX: 111,
        originalLeft: 70,
        originalWidth: 60,
        neighborCenterXs: [80, 120],
      }),
      false,
    );
  });
});
