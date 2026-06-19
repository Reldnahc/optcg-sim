import {
  createBehaviorProbeReport,
  type BehaviorProbeScenario,
} from "./behavior-probe.js";

export interface BehaviorCoverageEntry {
  readonly label: string;
  readonly text: string;
}

export interface BehaviorCoverageRequest {
  readonly entries: readonly BehaviorCoverageEntry[];
  readonly inventoryPrimitiveTypes: readonly string[];
}

export type BehaviorCoverageBucket =
  | "behaviorPassed"
  | "scenarioMissing"
  | "scenarioFailed"
  | "materializationFailed"
  | "sourceFailed";

export interface BehaviorCoverageBucketSummary {
  readonly behaviorPassed: number;
  readonly scenarioMissing: number;
  readonly scenarioFailed: number;
  readonly materializationFailed: number;
  readonly sourceFailed: number;
}

export interface BehaviorCoverageEntryResult {
  readonly label: string;
  readonly bucket: BehaviorCoverageBucket;
  readonly primitiveTypes: readonly string[];
  readonly reason?: string;
}

export interface BehaviorCoverageReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
  readonly bucketSummary: BehaviorCoverageBucketSummary;
  readonly entryResults: readonly BehaviorCoverageEntryResult[];
}

type MutableBucketSummary = {
  -readonly [Key in keyof BehaviorCoverageBucketSummary]: BehaviorCoverageBucketSummary[Key];
};

export const createBehaviorCoverageReport = (
  request: BehaviorCoverageRequest,
): BehaviorCoverageReport => {
  const inventoryPrimitiveTypes = uniqueSorted(request.inventoryPrimitiveTypes);
  const coveredPrimitiveTypes = new Set<string>();
  const skippedReasons = new Map<string, number>();
  const probeFailures: string[] = [];
  const bucketSummary = emptyMutableBucketSummary();
  const entryResults: BehaviorCoverageEntryResult[] = [];
  let passedScenarioCount = 0;
  let failedScenarioCount = 0;
  let skippedScenarioCount = 0;

  for (const entry of request.entries) {
    const probe = createBehaviorProbeReport({ text: entry.text });
    if (probe.exitCode !== 0) {
      probeFailures.push(`${entry.label} - ${probeFailureReason(probe.lines)}`);
    }
    if (probe.failure?.kind === "materializationFailed") {
      bucketSummary.materializationFailed += 1;
      entryResults.push({
        label: entry.label,
        bucket: "materializationFailed",
        primitiveTypes: [],
        reason: probe.failure.diagnostics[0] ?? "materialization failed",
      });
    }
    for (const scenario of probe.scenarios) {
      if (scenario.status === "passed") {
        passedScenarioCount += 1;
        bucketSummary.behaviorPassed += 1;
        entryResults.push(entryResultForScenario(entry.label, scenario));
        for (const primitive of scenario.primitiveTypes) {
          coveredPrimitiveTypes.add(primitive);
        }
        continue;
      }
      if (scenario.status === "failed") {
        failedScenarioCount += 1;
        bucketSummary.scenarioFailed += 1;
        entryResults.push(entryResultForScenario(entry.label, scenario));
        continue;
      }
      skippedScenarioCount += 1;
      bucketSummary.scenarioMissing += 1;
      entryResults.push(entryResultForScenario(entry.label, scenario));
      incrementCount(skippedReasons, scenario.reason ?? "unknown");
    }
  }

  const coveredInventoryPrimitives = inventoryPrimitiveTypes.filter(
    (primitive) => coveredPrimitiveTypes.has(primitive),
  );
  const missingInventoryPrimitives = inventoryPrimitiveTypes.filter(
    (primitive) => !coveredPrimitiveTypes.has(primitive),
  );

  return {
    exitCode: hasFailingBuckets(bucketSummary) ? 1 : 0,
    lines: [
      `Behavior coverage entries: ${String(request.entries.length)}`,
      `Behavior coverage primitive coverage: ${String(coveredInventoryPrimitives.length)}/${String(inventoryPrimitiveTypes.length)}`,
      `Behavior coverage passed scenarios: ${String(passedScenarioCount)}`,
      `Behavior coverage failed scenarios: ${String(failedScenarioCount)}`,
      `Behavior coverage skipped scenarios: ${String(skippedScenarioCount)}`,
      `Behavior coverage probe failures: ${String(probeFailures.length)}`,
      ...bucketLines(bucketSummary),
      ...coveredInventoryPrimitives.map(
        (primitive) => `Behavior coverage covered primitive: ${primitive}`,
      ),
      ...missingInventoryPrimitives.map(
        (primitive) => `Behavior coverage missing primitive: ${primitive}`,
      ),
      ...[...skippedReasons.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([reason, count]) =>
            `Behavior coverage skipped reason: ${reason} x${String(count)}`,
        ),
      ...probeFailures.map(
        (failure) => `Behavior coverage probe failure: ${failure}`,
      ),
    ],
    errors: [],
    bucketSummary,
    entryResults,
  };
};

export const createBehaviorCoverageSourceFailureReport = (input: {
  readonly sourceLabel: string;
  readonly error: string;
}): BehaviorCoverageReport => {
  const bucketSummary = {
    ...createEmptyBehaviorCoverageBucketSummary(),
    sourceFailed: 1,
  };
  return {
    exitCode: 1,
    lines: [
      `Behavior coverage source: ${input.sourceLabel}`,
      "Behavior coverage entries: 0",
      "Behavior coverage primitive coverage: 0/0",
      "Behavior coverage passed scenarios: 0",
      "Behavior coverage failed scenarios: 0",
      "Behavior coverage skipped scenarios: 0",
      "Behavior coverage probe failures: 0",
      ...bucketLines(bucketSummary),
      `Behavior coverage source failure: ${input.error}`,
    ],
    errors: [],
    bucketSummary,
    entryResults: [],
  };
};

export const createEmptyBehaviorCoverageBucketSummary =
  (): BehaviorCoverageBucketSummary => ({
    behaviorPassed: 0,
    scenarioMissing: 0,
    scenarioFailed: 0,
    materializationFailed: 0,
    sourceFailed: 0,
  });

const emptyMutableBucketSummary = (): MutableBucketSummary => ({
  ...createEmptyBehaviorCoverageBucketSummary(),
});

const bucketLines = (
  summary: BehaviorCoverageBucketSummary,
): readonly string[] => [
  `Behavior coverage bucket behaviorPassed: ${String(summary.behaviorPassed)}`,
  `Behavior coverage bucket scenarioMissing: ${String(summary.scenarioMissing)}`,
  `Behavior coverage bucket scenarioFailed: ${String(summary.scenarioFailed)}`,
  `Behavior coverage bucket materializationFailed: ${String(summary.materializationFailed)}`,
  `Behavior coverage bucket sourceFailed: ${String(summary.sourceFailed)}`,
];

const hasFailingBuckets = (summary: BehaviorCoverageBucketSummary): boolean =>
  summary.scenarioFailed > 0 ||
  summary.materializationFailed > 0 ||
  summary.sourceFailed > 0;

const entryResultForScenario = (
  label: string,
  scenario: BehaviorProbeScenario,
): BehaviorCoverageEntryResult => ({
  label,
  bucket: bucketForScenario(scenario.status),
  primitiveTypes: scenario.primitiveTypes,
  ...(scenario.reason === undefined ? {} : { reason: scenario.reason }),
});

const bucketForScenario = (
  status: BehaviorProbeScenario["status"],
): BehaviorCoverageBucket => {
  if (status === "passed") {
    return "behaviorPassed";
  }
  if (status === "failed") {
    return "scenarioFailed";
  }
  return "scenarioMissing";
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const incrementCount = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const probeFailureReason = (lines: readonly string[]): string =>
  lines.find((line) => line !== "Behavior probe: failed") ??
  "Behavior probe failed";
