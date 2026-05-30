import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  combineDropTargetForWindow,
  rectsOverlap,
  splitWindowRectFromPoint,
} from "./floating-window-grouping.js";

describe("floating window grouping", () => {
  test("groups windows only when a dropped rect overlaps another window", () => {
    assert.equal(
      rectsOverlap(
        { x: 100, y: 100, width: 300, height: 300 },
        { x: 350, y: 350, width: 300, height: 300 },
      ),
      true,
    );
    assert.equal(
      rectsOverlap(
        { x: 100, y: 100, width: 200, height: 200 },
        { x: 340, y: 100, width: 200, height: 200 },
      ),
      false,
    );
  });

  test("splits dragged tabs back into standalone windows near the pointer", () => {
    assert.deepEqual(
      splitWindowRectFromPoint({ x: 500, y: 240 }, { width: 300, height: 420 }),
      { x: 350, y: 220, width: 300, height: 420 },
    );
  });

  test("finds combine targets from a generic visible window registry", () => {
    assert.equal(
      combineDropTargetForWindow(
        "preview",
        { x: 50, y: 50, width: 200, height: 160 },
        [
          {
            id: "preview",
            visible: true,
            rect: { x: 50, y: 50, width: 200, height: 160 },
          },
          {
            id: "log",
            visible: true,
            rect: { x: 200, y: 90, width: 240, height: 200 },
          },
          {
            id: "trash",
            visible: true,
            rect: { x: 600, y: 90, width: 240, height: 200 },
          },
        ],
      ),
      "log",
    );

    assert.equal(
      combineDropTargetForWindow(
        "preview",
        { x: 50, y: 50, width: 100, height: 100 },
        [
          {
            id: "preview",
            visible: true,
            rect: { x: 50, y: 50, width: 100, height: 100 },
          },
          {
            id: "log",
            visible: false,
            rect: { x: 80, y: 80, width: 100, height: 100 },
          },
        ],
      ),
      undefined,
    );
  });
});
