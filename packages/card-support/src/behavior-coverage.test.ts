import { describe, expect, it } from "vitest";

import {
  createBehaviorCoverageReport,
  createBehaviorCoverageSourceFailureReport,
} from "./behavior-coverage.js";

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

  it("classifies each entry into actionable feedback buckets", () => {
    const report = createBehaviorCoverageReport({
      entries: [
        { label: "passed", text: "[On Play] Draw 1 card." },
        { label: "scenario-missing", text: "[When Attacking] Draw 1 card." },
        { label: "materialization", text: "[On Play] Do something unknown." },
      ],
      inventoryPrimitiveTypes: ["draw", "ko"],
    });

    expect(report.bucketSummary).toEqual({
      behaviorPassed: 1,
      scenarioMissing: 1,
      scenarioFailed: 0,
      materializationFailed: 1,
      sourceFailed: 0,
    });
    expect(report.entryResults).toEqual([
      {
        label: "passed",
        bucket: "behaviorPassed",
        primitiveTypes: ["draw"],
      },
      {
        label: "scenario-missing",
        bucket: "scenarioMissing",
        primitiveTypes: ["draw"],
        reason: "no generated scenario for trigger whenAttacking",
      },
      {
        label: "materialization",
        bucket: "materializationFailed",
        primitiveTypes: [],
        reason: "line 1 parse failed: no expression parser matched",
      },
    ]);
    expect(report.lines).toContain(
      "Behavior coverage bucket behaviorPassed: 1",
    );
    expect(report.lines).toContain(
      "Behavior coverage bucket scenarioMissing: 1",
    );
    expect(report.lines).toContain(
      "Behavior coverage bucket materializationFailed: 1",
    );
  });

  it("creates source failure reports without running text aggregation", () => {
    const report = createBehaviorCoverageSourceFailureReport({
      sourceLabel: "card OP01-001",
      error: "Poneglyph card fetch failed for OP01-001: HTTP 503",
    });

    expect(report.exitCode).toBe(1);
    expect(report.bucketSummary).toEqual({
      behaviorPassed: 0,
      scenarioMissing: 0,
      scenarioFailed: 0,
      materializationFailed: 0,
      sourceFailed: 1,
    });
    expect(report.entryResults).toEqual([]);
    expect(report.lines).toContain("Behavior coverage source: card OP01-001");
    expect(report.lines).toContain("Behavior coverage bucket sourceFailed: 1");
    expect(report.lines).toContain(
      "Behavior coverage source failure: Poneglyph card fetch failed for OP01-001: HTTP 503",
    );
  });
});
