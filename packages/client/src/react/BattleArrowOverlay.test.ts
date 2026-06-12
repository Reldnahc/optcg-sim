import { describe, expect, it } from "vitest";

import { nextStableArrowLine } from "./BattleArrowOverlay.js";

describe("nextStableArrowLine", () => {
  it("reuses the previous line object when measured coordinates are unchanged", () => {
    const previous = { x1: 10, y1: 20, x2: 30, y2: 40 };
    const next = { x1: 10, y1: 20, x2: 30, y2: 40 };

    expect(nextStableArrowLine(previous, next)).toBe(previous);
  });

  it("uses the next line object when measured coordinates change", () => {
    const previous = { x1: 10, y1: 20, x2: 30, y2: 40 };
    const next = { x1: 10, y1: 21, x2: 30, y2: 40 };

    expect(nextStableArrowLine(previous, next)).toBe(next);
  });
});
