import { describe, expect, it } from "vitest";

import { createBehaviorCoverageCliReport } from "./behavior-coverage-cli.js";

describe("behavior coverage CLI", () => {
  it("runs coverage for text entries from passthrough CLI args", () => {
    const report = createBehaviorCoverageCliReport([
      "--",
      "--text",
      "[On Play] Draw 1 card.",
    ]);

    expect(report.exitCode).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.lines).toContain("Behavior coverage entries: 1");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 1");
    expect(report.lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Behavior coverage primitive coverage: 1\/\d+/u),
      ]),
    );
  });

  it("accepts multiple text entries", () => {
    const report = createBehaviorCoverageCliReport([
      "--",
      "--text",
      "[On Play] Draw 1 card.",
      "--text",
      "[Main] Draw 1 card.",
    ]);

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior coverage entries: 2");
    expect(report.lines).toContain("Behavior coverage passed scenarios: 2");
  });

  it("reports usage when text is missing", () => {
    const report = createBehaviorCoverageCliReport([]);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([]);
    expect(report.errors).toEqual([
      "Usage: behavior:coverage -- --text <effect line>",
    ]);
  });
});
