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
    expect(report.lines).toContain("Behavior coverage primitive coverage: 1/1");
    expect(report.lines).toContain(
      "Behavior coverage inventory primitive coverage: 1/2",
    );
    expect(report.lines).toContain("Behavior coverage passed scenarios: 2");
    expect(report.lines).toContain("Behavior coverage failed scenarios: 0");
    expect(report.lines).toContain("Behavior coverage skipped scenarios: 0");
    expect(report.lines).toContain("Behavior coverage covered primitive: draw");
    expect(report.lines).toContain(
      "Behavior coverage inventory missing primitive: ko",
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
        { label: "when-attacking", text: "[When Attacking] Draw 1 card." },
        { label: "materialization", text: "[On Play] Do something unknown." },
      ],
      inventoryPrimitiveTypes: ["draw", "ko"],
    });

    expect(report.bucketSummary).toEqual({
      behaviorPassed: 2,
      scenarioMissing: 0,
      scenarioFailed: 0,
      materializationFailed: 1,
      sourceFailed: 0,
    });
    expect(report.entryResults[0]).toEqual({
      label: "passed",
      bucket: "behaviorPassed",
      primitiveTypes: ["draw"],
    });
    expect(report.entryResults[1]).toEqual({
      label: "when-attacking",
      bucket: "behaviorPassed",
      primitiveTypes: ["draw"],
    });
    expect(report.entryResults[2]).toMatchObject({
      label: "materialization",
      bucket: "materializationFailed",
      primitiveTypes: [],
    });
    expect(report.entryResults[2]?.reason).toMatch(/^line 1 parse failed:/u);
    expect(report.entryResults).toHaveLength(3);
    expect(report.lines).toContain(
      "Behavior coverage bucket behaviorPassed: 2",
    );
    expect(report.lines).toContain(
      "Behavior coverage bucket scenarioMissing: 0",
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
    expect(report.lines).toEqual(
      expect.arrayContaining([
        "Behavior coverage source: card OP01-001",
        "Behavior coverage entries: 0",
        "Behavior coverage primitive coverage: 0/0",
        "Behavior coverage inventory primitive coverage: 0/0",
        "Behavior coverage passed scenarios: 0",
        "Behavior coverage failed scenarios: 0",
        "Behavior coverage skipped scenarios: 0",
        "Behavior coverage probe failures: 0",
        "Behavior coverage bucket sourceFailed: 1",
        "Behavior coverage source failure: Poneglyph card fetch failed for OP01-001: HTTP 503",
      ]),
    );
  });

  it("prints actionable entry rows grouped by bucket", () => {
    const report = createBehaviorCoverageReport({
      entries: [
        { label: "when-attacking", text: "[When Attacking] Draw 1 card." },
        { label: "passed", text: "[On Play] Draw 1 card." },
        { label: "materialization", text: "[On Play] Do something unknown." },
      ],
      inventoryPrimitiveTypes: ["draw"],
    });

    const entryLines = report.lines.filter((line) =>
      line.startsWith("Behavior coverage entry "),
    );

    expect(entryLines).toEqual([
      "Behavior coverage entry materializationFailed: materialization - line 1 parse failed: no expression parser matched",
      "Behavior coverage entry behaviorPassed: passed - draw",
      "Behavior coverage entry behaviorPassed: when-attacking - draw",
    ]);
  });
});
