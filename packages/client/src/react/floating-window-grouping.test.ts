import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
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
});
