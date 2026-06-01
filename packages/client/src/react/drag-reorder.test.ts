import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  horizontalReorderTargetFromPointer,
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

  test("horizontal reorder uses stable slot regions between card centers", () => {
    const entries = [
      { id: "one", centerX: 80 },
      { id: "two", centerX: 100 },
      { id: "three", centerX: 120 },
      { id: "four", centerX: 140 },
    ];

    assert.deepEqual(
      horizontalReorderTargetFromPointer({
        entries,
        draggedId: "three",
        clientX: 100,
      }),
      { targetId: "two", placement: "before" },
    );
    assert.deepEqual(
      horizontalReorderTargetFromPointer({
        entries,
        draggedId: "three",
        clientX: 119,
      }),
      { targetId: "three", placement: "before" },
    );
    assert.deepEqual(
      horizontalReorderTargetFromPointer({
        entries,
        draggedId: "three",
        clientX: 140,
      }),
      { targetId: "four", placement: "after" },
    );
  });

  test("horizontal reorder keeps a placeholder in the dragged card slot", () => {
    const entries = [
      { id: "one", centerX: 80 },
      { id: "two", centerX: 100 },
      { id: "three", centerX: 120 },
      { id: "four", centerX: 140 },
    ];

    assert.deepEqual(
      horizontalReorderTargetFromPointer({
        entries,
        draggedId: "three",
        clientX: 120,
      }),
      { targetId: "three", placement: "before" },
    );
  });
});
