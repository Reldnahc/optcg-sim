import { describe, expect, it } from "vitest";

import { validateRulesText } from "./index.js";

describe("rules text validator", () => {
  it("reports supported reusable rules text lines", () => {
    const result = validateRulesText({
      effect: "[On Play] Draw 1 card.",
      trigger: "[Trigger] Draw 1 card.",
    });

    expect(result.supported).toBe(true);
    expect(result.lines).toEqual([
      {
        field: "effect",
        lineNumber: 1,
        text: "[On Play] Draw 1 card.",
        parseOk: true,
        runtimeSupported: true,
      },
      {
        field: "trigger",
        lineNumber: 1,
        text: "[Trigger] Draw 1 card.",
        parseOk: true,
        runtimeSupported: true,
      },
    ]);
  });

  it("fails rough spoiler translation text before active ingest", () => {
    const result = validateRulesText({
      effect: "[On Play] trash 1 cards for your hand.",
    });

    expect(result.supported).toBe(false);
    expect(result.lines).toEqual([
      expect.objectContaining({
        field: "effect",
        lineNumber: 1,
        text: "[On Play] trash 1 cards for your hand.",
        parseOk: false,
        runtimeSupported: false,
      }),
    ]);
  });

  it("fails closed when parsed text is unsupported by runtime", () => {
    const result = validateRulesText({
      effect: "[Your Turn] Draw 1 card.",
    });

    expect(result.supported).toBe(false);
    expect(result.lines).toEqual([
      expect.objectContaining({
        field: "effect",
        lineNumber: 1,
        text: "[Your Turn] Draw 1 card.",
        parseOk: true,
        runtimeSupported: false,
        reason: "unsupported permanent effect body",
      }),
    ]);
  });
});
