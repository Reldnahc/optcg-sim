import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";

describe("card behavior probe DON selection scenarios", () => {
  it("selects optional rested DON when a later segment attaches that selection", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Give up to 1 rested DON!! card to your Leader. Then, if your opponent has 3 or more Life cards, add up to 1 card from the top of your opponent's Life cards to the owner's hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
        expect.stringMatching(/^Scenario 1 effect resolutions: [1-9]/u),
      ]),
    );
  });
});
