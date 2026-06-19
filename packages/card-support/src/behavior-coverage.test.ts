import { describe, expect, it } from "vitest";

import { createBehaviorCoverageReport } from "./behavior-coverage.js";

describe("behavior coverage", () => {
  it("aggregates primitive proof coverage from behavior probe scenarios", () => {
    const report = createBehaviorCoverageReport({
      entries: [
        { label: "draw", text: "[On Play] Draw 1 card." },
        { label: "attack", text: "[When Attacking] Draw 1 card." },
      ],
      inventoryPrimitiveTypes: ["draw", "ko"],
    });

    expect(report.exitCode).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.lines).toContain("Behavior coverage entries: 2");
    expect(report.lines).toContain("Behavior coverage primitive coverage: 1/2");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
    expect(report.lines).toContain("Behavior coverage failed scenarios: 0");
    expect(report.lines).toContain("Behavior coverage skipped scenarios: 1");
    expect(report.lines).toContain("Behavior coverage covered primitive: draw");
    expect(report.lines).toContain("Behavior coverage missing primitive: ko");
    expect(report.lines).toContain(
      "Behavior coverage skipped reason: no generated scenario for trigger whenAttacking x1",
    );
  });

  it("fails coverage when a behavior probe fails to materialize", () => {
    const report = createBehaviorCoverageReport({
      entries: [{ label: "bad", text: "[On Play] Do something unknown." }],
      inventoryPrimitiveTypes: ["draw"],
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain("Behavior coverage entries: 1");
    expect(report.lines).toContain("Behavior coverage probe failures: 1");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Behavior coverage probe failure: bad - /u),
      ]),
    );
  });
});
