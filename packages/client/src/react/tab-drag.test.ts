import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  tabDragIntentFromPoint,
  tabReorderTargetFromPointer,
} from "./tab-drag.js";

describe("tab drag behavior", () => {
  test("reorders tabs while the pointer stays inside the tab strip", () => {
    assert.equal(
      tabDragIntentFromPoint({
        point: { x: 155, y: 18 },
        tabStripRect: { left: 0, right: 300, top: 0, bottom: 36 },
      }),
      "reorder",
    );
    assert.deepEqual(
      tabReorderTargetFromPointer({
        entries: [
          { id: "preview", centerX: 50 },
          { id: "log", centerX: 150 },
          { id: "settings", centerX: 250 },
        ],
        draggedId: "preview",
        clientX: 175,
      }),
      { targetId: "log", placement: "after" },
    );
  });

  test("drags a tab out only after the pointer leaves the tab strip", () => {
    assert.equal(
      tabDragIntentFromPoint({
        point: { x: 155, y: 18 },
        tabStripRect: { left: 0, right: 300, top: 0, bottom: 36 },
      }),
      "reorder",
    );
    assert.equal(
      tabDragIntentFromPoint({
        point: { x: 155, y: 54 },
        tabStripRect: { left: 0, right: 300, top: 0, bottom: 36 },
      }),
      "dragOut",
    );
  });
});
