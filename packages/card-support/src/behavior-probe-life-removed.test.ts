import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";

describe("card behavior probe life-removed scenarios", () => {
  it("proves Life-removed reactions through combat damage", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] When a card is removed from your or your opponent's Life cards, draw 1 card. Then, you cannot draw cards using your own effects during this turn.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeRemoved");
    expect(report.lines).toContain("Scenario 1 card category: character");
    expect(report.lines).toContain(
      "Scenario 1 engine primitives: draw, preventDraw, sequence",
    );
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 effect resolutions: [1-9]/u),
      ]),
    );
  });

  it("proves activated Life-removed reactions resolve after the timing event", () => {
    const report = createBehaviorProbeReport({
      text: "[Your Turn] [Once Per Turn] This effect can be activated when a card is removed from your or your opponent's Life cards. If you have 7 or less cards in your hand, draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: lifeRemoved");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Scenario 1 decisions resolved: [1-9]/u),
        expect.stringMatching(/^Scenario 1 effect resolutions: [1-9]/u),
      ]),
    );
  });
});
