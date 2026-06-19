import { describe, expect, it } from "vitest";

import {
  createEnginePrimitiveInventoryReport,
  extractEngineEffectPrimitiveTypes,
} from "./engine-primitive-inventory.js";

describe("engine primitive inventory", () => {
  it("extracts effect primitive discriminants from inline Effect union members", () => {
    const primitives = extractEngineEffectPrimitiveTypes({
      sourceFiles: [
        {
          fileName: "effects.ts",
          text: `
            export type Effect =
              | { type: "draw"; count: number }
              | { type: "ko"; target: unknown };
          `,
        },
      ],
      rootTypeName: "Effect",
    });

    expect(primitives).toEqual(["draw", "ko"]);
  });

  it("resolves referenced aliases and imported declaration source files", () => {
    const primitives = extractEngineEffectPrimitiveTypes({
      sourceFiles: [
        {
          fileName: "effects.ts",
          text: `
            import type { ContinuousEffect } from "./continuous.js";
            export type SelectCardsEffect = { type: "selectCards"; count: number };
            export interface SelectTargetsEffect { type: "selectTargets"; count: number }
            export type Effect =
              | SelectCardsEffect
              | SelectTargetsEffect
              | ContinuousEffect
              | { type: "draw"; count: number };
          `,
        },
        {
          fileName: "continuous.ts",
          text: `
            export type ContinuousEffect =
              | { type: "giveKeyword"; keyword: string }
              | { type: "removeKeyword"; keyword: string };
          `,
        },
      ],
      rootTypeName: "Effect",
    });

    expect(primitives).toEqual([
      "draw",
      "giveKeyword",
      "removeKeyword",
      "selectCards",
      "selectTargets",
    ]);
  });

  it("reports behavior probe proof coverage against the engine inventory", () => {
    const report = createEnginePrimitiveInventoryReport({
      coveredPrimitiveTypes: ["draw", "selectCards"],
      sourceFiles: [
        {
          fileName: "effects.ts",
          text: `
            export type Effect =
              | { type: "draw"; count: number }
              | { type: "ko"; target: unknown }
              | { type: "selectCards"; count: number };
          `,
        },
      ],
      rootTypeName: "Effect",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Engine primitive inventory: 3");
    expect(report.lines).toContain("Behavior probe primitive coverage: 2/3");
    expect(report.lines).toContain("Behavior probe covered primitive: draw");
    expect(report.lines).toContain("Behavior probe missing primitive: ko");
  });
});
