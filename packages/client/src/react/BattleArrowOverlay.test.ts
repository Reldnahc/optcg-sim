import { describe, expect, it } from "vitest";

import {
  battlePowerLabelPoint,
  battlePowerLabelScale,
  nextStableArrowLine,
} from "./BattleArrowOverlay.js";

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

describe("battlePowerLabelPoint", () => {
  it("keeps the power label centered when the defender is a character", () => {
    expect(
      battlePowerLabelPoint({ x1: 0, y1: 20, x2: 100, y2: 120 }, "fieldCard"),
    ).toEqual({
      x: 50,
      y: 70,
    });
  });

  it("moves the power label closer to the defender when the defender is a leader", () => {
    expect(
      battlePowerLabelPoint({ x1: 0, y1: 20, x2: 100, y2: 120 }, "leader"),
    ).toEqual({
      x: 72,
      y: 92,
    });
  });
});

describe("battlePowerLabelScale", () => {
  it("shrinks the power label on narrow playmats", () => {
    expect(battlePowerLabelScale(640)).toBe(0.78);
  });

  it("uses neutral scale around the base playmat width", () => {
    expect(battlePowerLabelScale(1280)).toBe(1);
  });

  it("caps the power label growth on wide playmats", () => {
    expect(battlePowerLabelScale(2200)).toBe(1.18);
  });
});
