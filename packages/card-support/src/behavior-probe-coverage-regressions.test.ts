import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";

describe("card behavior probe coverage regressions", () => {
  it("builds scenario state for dynamic field-count draw and matching hand trash", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 setup filters: 1");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
  });

  it("runs Counter Event any-number field return costs before paid-count power", () => {
    const report = createBehaviorProbeReport({
      text: "[Counter] If your Leader is [Uta], you may return any number of Characters on your field to the owner's hand. Up to 1 of your Leader or Character cards gains +2000 power during this battle for every returned Character.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: counter");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });
});
