import { describe, expect, it } from "vitest";

import { createBehaviorProbeCliReport } from "./behavior-probe-cli.js";

describe("behavior probe CLI", () => {
  it("runs a text probe from passthrough CLI args", () => {
    const report = createBehaviorProbeCliReport([
      "--",
      "--text",
      "[On Play] Draw 1 card.",
    ]);

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Behavior probe: passed");
    expect(report.errors).toEqual([]);
  });

  it("reports usage when text is missing", () => {
    const report = createBehaviorProbeCliReport([]);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([]);
    expect(report.errors).toEqual([
      "Usage: behavior:probe -- --text <effect line>",
    ]);
  });
});
