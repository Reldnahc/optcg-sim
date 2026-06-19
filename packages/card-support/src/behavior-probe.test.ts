import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";

describe("card behavior probe", () => {
  it("proves a supported On Play effect through real play-card execution", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 entrypoint: playCard");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
    expect(report.lines).toContain("Scenario 1 effect queue: drained");
  });

  it("auto-resolves supported decisions while proving the scenario", () => {
    const report = createBehaviorProbeReport({
      text: "[On Play] Draw up to 2 cards.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.lines).toContain("Scenario 1 result: passed");
    expect(report.lines).toContain("Scenario 1 decision policy: max-progress");
    expect(report.lines).toContain("Scenario 1 pending decisions: drained");
  });

  it("plays Main event effects through the event play path", () => {
    const report = createBehaviorProbeReport({
      text: "[Main] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Scenario 1 card category: event");
    expect(report.lines).toContain("Scenario 1 result: passed");
  });

  it("reports runtime-supported entrypoints that do not have generated scenarios yet", () => {
    const report = createBehaviorProbeReport({
      text: "[When Attacking] Draw 1 card.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: skipped");
    expect(report.lines).toContain(
      "Scenario 1 result: skipped - no generated scenario for trigger whenAttacking",
    );
  });
});
