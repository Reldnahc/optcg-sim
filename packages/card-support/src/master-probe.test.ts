import { describe, expect, it } from "vitest";

import {
  createMasterProbeReport,
  type MasterProbeDependencies,
  type MasterProbeRequest,
} from "./master-probe.js";

const passingReport = (lines: readonly string[] = []) => ({
  exitCode: 0,
  lines,
  errors: [],
});

const failingReport = (errors: readonly string[] = []) => ({
  exitCode: 1,
  lines: [],
  errors,
});

describe("master probe", () => {
  it("runs support, behavior coverage, and spotlight probes for every discovered set", async () => {
    const calls: string[] = [];
    const dependencies: MasterProbeDependencies = {
      fetchSetCodes: () =>
        Promise.resolve({ ok: true, setCodes: ["OP01", "PRB01", "P"] }),
      createSupportProbeReport: (request) => {
        const setCode = request.setCode ?? "";
        calls.push(`support:${setCode}`);
        return Promise.resolve(
          passingReport([`Set: ${setCode}`, "Failures: none"]),
        );
      },
      createBehaviorCoverageReport: (argv) => {
        const setCode = lastArg(argv);
        calls.push(`behavior:${setCode}`);
        return Promise.resolve(
          passingReport([
            `Behavior coverage source: set ${setCode}`,
            "Behavior coverage entries: 2",
            "Behavior coverage passed scenarios: 2",
            "Behavior coverage failed scenarios: 0",
            "Behavior coverage skipped scenarios: 0",
            "Behavior coverage probe failures: 0",
          ]),
        );
      },
      createSpotlightProbeReport: (request) => {
        const setCode = request.setCode ?? "";
        calls.push(`spotlight:${setCode}`);
        return Promise.resolve(
          passingReport([
            `Set: ${setCode}`,
            "Runtime-supported effect blocks: 2",
            "Spotlight-ready effect blocks: 2",
            "Failures: none",
          ]),
        );
      },
    };

    const report = await createMasterProbeReport({}, dependencies);

    expect(report.exitCode).toBe(0);
    expect(calls).toEqual([
      "support:OP01",
      "behavior:OP01",
      "spotlight:OP01",
      "support:PRB01",
      "behavior:PRB01",
      "spotlight:PRB01",
      "support:P",
      "behavior:P",
      "spotlight:P",
    ]);
    expect(report.lines).toEqual([
      "Master probe sets: 3",
      "Master probe failures: none",
      "OP01 support: passed | behavior: passed | spotlight: passed",
      "OP01 support summary: Failures: none",
      "OP01 behavior summary: entries 2, passed 2, failed 0, skipped 0, probe failures 0",
      "OP01 spotlight summary: runtime blocks 2, spotlight-ready 2, Failures: none",
      "PRB01 support: passed | behavior: passed | spotlight: passed",
      "PRB01 support summary: Failures: none",
      "PRB01 behavior summary: entries 2, passed 2, failed 0, skipped 0, probe failures 0",
      "PRB01 spotlight summary: runtime blocks 2, spotlight-ready 2, Failures: none",
      "P support: passed | behavior: passed | spotlight: passed",
      "P support summary: Failures: none",
      "P behavior summary: entries 2, passed 2, failed 0, skipped 0, probe failures 0",
      "P spotlight summary: runtime blocks 2, spotlight-ready 2, Failures: none",
    ]);
    expect(report.errors).toEqual([]);
  });

  it("fails the aggregate report when any probe fails", async () => {
    const dependencies: MasterProbeDependencies = {
      fetchSetCodes: () => Promise.resolve({ ok: true, setCodes: ["OP01"] }),
      createSupportProbeReport: () =>
        Promise.resolve(passingReport(["Failures: none"])),
      createBehaviorCoverageReport: () =>
        Promise.resolve(
          passingReport([
            "Behavior coverage entries: 1",
            "Behavior coverage passed scenarios: 1",
            "Behavior coverage failed scenarios: 0",
            "Behavior coverage skipped scenarios: 0",
            "Behavior coverage probe failures: 0",
          ]),
        ),
      createSpotlightProbeReport: () =>
        Promise.resolve(
          failingReport(["Spotlight probe manifest build failed"]),
        ),
    };

    const report = await createMasterProbeReport({}, dependencies);

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain(
      "OP01 support: passed | behavior: passed | spotlight: failed",
    );
    expect(report.lines).toContain(
      "OP01 spotlight errors: Spotlight probe manifest build failed",
    );
    expect(report.lines).toContain("Master probe failures: 1");
  });

  it("reports progress while each set probe runs", async () => {
    const progress: string[] = [];
    const request: MasterProbeRequest & {
      readonly onProgress: (message: string) => void;
    } = {
      onProgress: (message) => {
        progress.push(message);
      },
    };
    const dependencies: MasterProbeDependencies = {
      fetchSetCodes: () => Promise.resolve({ ok: true, setCodes: ["OP01"] }),
      createSupportProbeReport: () =>
        Promise.resolve(passingReport(["Failures: none"])),
      createBehaviorCoverageReport: () =>
        Promise.resolve(
          passingReport([
            "Behavior coverage entries: 1",
            "Behavior coverage passed scenarios: 1",
            "Behavior coverage failed scenarios: 0",
            "Behavior coverage skipped scenarios: 0",
            "Behavior coverage probe failures: 0",
          ]),
        ),
      createSpotlightProbeReport: () =>
        Promise.resolve(
          passingReport([
            "Runtime-supported effect blocks: 1",
            "Spotlight-ready effect blocks: 1",
            "Failures: none",
          ]),
        ),
    };

    await createMasterProbeReport(request, dependencies);

    expect(progress).toEqual([
      "Master probe: fetching set catalog",
      "Master probe: discovered 1 set",
      "Master probe: OP01 starting (1/1)",
      "Master probe: OP01 support passed",
      "Master probe: OP01 behavior passed",
      "Master probe: OP01 spotlight passed",
      "Master probe: complete with 0 failures",
    ]);
  });
});

const lastArg = (argv: readonly string[]): string =>
  argv[argv.length - 1] ?? "";
