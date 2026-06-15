import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  battlePowerLabelPoint,
  battlePowerTone,
  cardInstanceSelector,
  nextStableArrowLine,
} from "./BattleArrowOverlay.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("cardInstanceSelector", () => {
  it("creates an attribute selector for a single card instance id", () => {
    expect(cardInstanceSelector('card:"one"')).toBe(
      '[data-card-instance-id="card:\\"one\\""]',
    );
  });

  it("battle arrow lookup avoids scanning every rendered card", async () => {
    const source = await readFile(
      join(sourceDirectory, "BattleArrowOverlay.tsx"),
      "utf8",
    );

    expect(source).toContain("board.querySelector<HTMLElement>");
    expect(source).not.toContain(
      'querySelectorAll<HTMLElement>("[data-card-instance-id]")',
    );
  });
});

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

describe("battlePowerTone", () => {
  it("maps weak power through dark red overpower bands", () => {
    expect(battlePowerTone(4000)).toBe("weak");
    expect(battlePowerTone(5000)).toBe("power-5000");
    expect(battlePowerTone(6500)).toBe("power-6000");
    expect(battlePowerTone(7000)).toBe("power-7000");
    expect(battlePowerTone(8000)).toBe("power-8000");
    expect(battlePowerTone(9000)).toBe("power-9000");
    expect(battlePowerTone(10000)).toBe("over-10000");
  });
});
