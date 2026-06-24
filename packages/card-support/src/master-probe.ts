import { createBehaviorCoverageCliReport } from "./behavior-coverage-cli.js";
import {
  defaultPoneglyphBaseUrl,
  fetchPoneglyphCard,
  fetchPoneglyphSetCodes,
  type PoneglyphFetch,
} from "./poneglyph-card-source.js";
import {
  createSpotlightProbeReport,
  type SpotlightProbeRequest,
} from "./spotlight-probe-report.js";
import {
  createSupportProbeReport,
  type SupportProbeRequest,
} from "./support-probe-report.js";

export interface MasterProbeRequest {
  readonly baseUrl?: string;
  readonly fetchPoneglyph?: PoneglyphFetch;
}

export interface MasterProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

export interface MasterProbeDependencies {
  readonly fetchSetCodes?: () => Promise<
    | { readonly ok: true; readonly setCodes: readonly string[] }
    | { readonly ok: false; readonly error: string }
  >;
  readonly createSupportProbeReport?: (
    request: SupportProbeRequest,
  ) => Promise<MasterProbeReport>;
  readonly createBehaviorCoverageReport?: (
    argv: readonly string[],
  ) => Promise<MasterProbeReport>;
  readonly createSpotlightProbeReport?: (
    request: SpotlightProbeRequest,
  ) => Promise<MasterProbeReport>;
}

interface SetProbeReport {
  readonly setCode: string;
  readonly support: MasterProbeReport;
  readonly behavior: MasterProbeReport;
  readonly spotlight: MasterProbeReport;
}

export const createMasterProbeReport = async (
  request: MasterProbeRequest = {},
  dependencies: MasterProbeDependencies = {},
): Promise<MasterProbeReport> => {
  const baseUrl = request.baseUrl ?? defaultPoneglyphBaseUrl;
  const fetchPoneglyph = request.fetchPoneglyph ?? fetchPoneglyphCard;
  const setCodesResult =
    dependencies.fetchSetCodes === undefined
      ? await fetchPoneglyphSetCodes({ baseUrl, fetchPoneglyph })
      : await dependencies.fetchSetCodes();
  if (!setCodesResult.ok) {
    return {
      exitCode: 1,
      lines: [],
      errors: [setCodesResult.error],
    };
  }

  const setReports: SetProbeReport[] = [];
  for (const setCode of setCodesResult.setCodes) {
    setReports.push(
      await runSetProbes(setCode, {
        baseUrl,
        fetchPoneglyph,
        createSupportProbeReport:
          dependencies.createSupportProbeReport ?? createSupportProbeReport,
        createBehaviorCoverageReport:
          dependencies.createBehaviorCoverageReport ??
          ((argv) =>
            createBehaviorCoverageCliReport(argv, {
              baseUrl,
              fetchPoneglyph,
            })),
        createSpotlightProbeReport:
          dependencies.createSpotlightProbeReport ?? createSpotlightProbeReport,
      }),
    );
  }

  const failureCount = setReports.reduce(
    (count, report) => count + failingProbeCount(report),
    0,
  );
  return {
    exitCode: failureCount === 0 ? 0 : 1,
    lines: [
      `Master probe sets: ${String(setReports.length)}`,
      failureCount === 0
        ? "Master probe failures: none"
        : `Master probe failures: ${String(failureCount)}`,
      ...setReports.flatMap(formatSetProbeReport),
    ],
    errors: [],
  };
};

const runSetProbes = async (
  setCode: string,
  dependencies: {
    readonly baseUrl: string;
    readonly fetchPoneglyph: PoneglyphFetch;
    readonly createSupportProbeReport: (
      request: SupportProbeRequest,
    ) => Promise<MasterProbeReport>;
    readonly createBehaviorCoverageReport: (
      argv: readonly string[],
    ) => Promise<MasterProbeReport>;
    readonly createSpotlightProbeReport: (
      request: SpotlightProbeRequest,
    ) => Promise<MasterProbeReport>;
  },
): Promise<SetProbeReport> => {
  const support = await dependencies.createSupportProbeReport({
    setCode,
    baseUrl: dependencies.baseUrl,
    fetchCard: dependencies.fetchPoneglyph,
  });
  const behavior = await dependencies.createBehaviorCoverageReport([
    "--",
    "--set",
    setCode,
  ]);
  const spotlight = await dependencies.createSpotlightProbeReport({
    setCode,
    baseUrl: dependencies.baseUrl,
    fetchCard: dependencies.fetchPoneglyph,
  });
  return { setCode, support, behavior, spotlight };
};

const failingProbeCount = (report: SetProbeReport): number =>
  [report.support, report.behavior, report.spotlight].filter(
    (probeReport) => probeReport.exitCode !== 0,
  ).length;

const formatSetProbeReport = (report: SetProbeReport): readonly string[] => {
  const lines = [
    `${report.setCode} support: ${statusText(report.support)} | behavior: ${statusText(report.behavior)} | spotlight: ${statusText(report.spotlight)}`,
    `${report.setCode} support summary: ${supportSummary(report.support)}`,
    `${report.setCode} behavior summary: ${behaviorSummary(report.behavior)}`,
    `${report.setCode} spotlight summary: ${spotlightSummary(report.spotlight)}`,
  ];
  return [
    ...lines,
    ...formatProbeErrors(report.setCode, "support", report.support),
    ...formatProbeErrors(report.setCode, "behavior", report.behavior),
    ...formatProbeErrors(report.setCode, "spotlight", report.spotlight),
  ];
};

const statusText = (report: MasterProbeReport): "passed" | "failed" =>
  report.exitCode === 0 ? "passed" : "failed";

const supportSummary = (report: MasterProbeReport): string =>
  findLine(report.lines, "Failures:") ?? fallbackSummary(report);

const behaviorSummary = (report: MasterProbeReport): string => {
  const entries = valueAfterLabel(report.lines, "Behavior coverage entries:");
  const passed = valueAfterLabel(
    report.lines,
    "Behavior coverage passed scenarios:",
  );
  const failed = valueAfterLabel(
    report.lines,
    "Behavior coverage failed scenarios:",
  );
  const skipped = valueAfterLabel(
    report.lines,
    "Behavior coverage skipped scenarios:",
  );
  const probeFailures = valueAfterLabel(
    report.lines,
    "Behavior coverage probe failures:",
  );
  if (
    entries === undefined ||
    passed === undefined ||
    failed === undefined ||
    skipped === undefined ||
    probeFailures === undefined
  ) {
    return fallbackSummary(report);
  }
  return `entries ${entries}, passed ${passed}, failed ${failed}, skipped ${skipped}, probe failures ${probeFailures}`;
};

const spotlightSummary = (report: MasterProbeReport): string => {
  const runtimeBlocks = valueAfterLabel(
    report.lines,
    "Runtime-supported effect blocks:",
  );
  const readyBlocks = valueAfterLabel(
    report.lines,
    "Spotlight-ready effect blocks:",
  );
  const failures = findLine(report.lines, "Failures:");
  if (
    runtimeBlocks === undefined ||
    readyBlocks === undefined ||
    failures === undefined
  ) {
    return fallbackSummary(report);
  }
  return `runtime blocks ${runtimeBlocks}, spotlight-ready ${readyBlocks}, ${failures}`;
};

const formatProbeErrors = (
  setCode: string,
  probeName: string,
  report: MasterProbeReport,
): readonly string[] => {
  if (report.exitCode === 0) {
    return [];
  }
  const details =
    report.errors.length > 0
      ? report.errors
      : report.lines.filter((line) => line.includes("failed"));
  return [
    `${setCode} ${probeName} errors: ${
      details.length === 0
        ? "probe failed without details"
        : details.join(" | ")
    }`,
  ];
};

const valueAfterLabel = (
  lines: readonly string[],
  label: string,
): string | undefined => findLine(lines, label)?.slice(label.length).trim();

const findLine = (
  lines: readonly string[],
  prefix: string,
): string | undefined => lines.find((line) => line.startsWith(prefix));

const fallbackSummary = (report: MasterProbeReport): string =>
  report.errors[0] ?? report.lines[0] ?? "no details";
