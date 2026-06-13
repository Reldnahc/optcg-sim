import { describe, expect, it } from "vitest";

import {
  battlePowerLabelBox,
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

describe("battlePowerLabelBox", () => {
  it("falls back to the scaled minimum box before text is measured", () => {
    const box = battlePowerLabelBox(undefined, 1.18);

    expect(box.width).toBeCloseTo(66.08);
    expect(box.height).toBeCloseTo(44.84);
  });

  it("sizes the background from measured rendered text bounds", () => {
    const box = battlePowerLabelBox({ width: 236, height: 35 }, 1.18);

    expect(box.width).toBeCloseTo(273.76);
    expect(box.height).toBeCloseTo(51.52);
  });
});
