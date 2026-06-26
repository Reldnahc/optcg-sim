import {
  createBehaviorProbeReport,
  type BehaviorProbeScenario,
} from "./behavior-probe.js";
import {
  createManifestViewProbeReport,
  type ManifestViewProbeEntry,
} from "./manifest-view-probe.js";

export interface BehaviorCoverageEntry {
  readonly label: string;
  readonly text: string;
  readonly focusLineNumber?: number;
}

export interface BehaviorCoverageRequest {
  readonly entries: readonly BehaviorCoverageEntry[];
  readonly manifestViewEntries?: readonly ManifestViewProbeEntry[];
  readonly inventoryPrimitiveTypes: readonly string[];
}

export type BehaviorCoverageBucket =
  | "behaviorPassed"
  | "scenarioMissing"
  | "scenarioFailed"
  | "materializationFailed"
  | "manifestViewFailed"
  | "sourceFailed";

export interface BehaviorCoverageBucketSummary {
  readonly behaviorPassed: number;
  readonly scenarioMissing: number;
  readonly scenarioFailed: number;
  readonly materializationFailed: number;
  readonly manifestViewFailed: number;
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
  const sourcePrimitiveTypes = new Set<string>();
  const skippedReasons = new Map<string, number>();
  const probeFailures: string[] = [];
  const bucketSummary = emptyMutableBucketSummary();
  const entryResults: BehaviorCoverageEntryResult[] = [];
  let passedScenarioCount = 0;
  let failedScenarioCount = 0;
  let skippedScenarioCount = 0;
  const manifestViewReport = createManifestViewProbeReport({
    entries: request.manifestViewEntries ?? [],
  });

  for (const entry of request.entries) {
    const probe = createBehaviorProbeReport({
      text: entry.text,
      ...(entry.focusLineNumber === undefined
        ? {}
        : { focusLineNumber: entry.focusLineNumber }),
    });
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
      for (const primitive of scenario.primitiveTypes) {
        sourcePrimitiveTypes.add(primitive);
      }
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
  const sourcePrimitives = uniqueSorted([...sourcePrimitiveTypes]);
  const coveredSourcePrimitives = sourcePrimitives.filter((primitive) =>
    coveredPrimitiveTypes.has(primitive),
  );
  const missingSourcePrimitives = sourcePrimitives.filter(
    (primitive) => !coveredPrimitiveTypes.has(primitive),
  );

  bucketSummary.manifestViewFailed = manifestViewReport.results.filter(
    (result) => result.status === "failed",
  ).length;

  return {
    exitCode: hasFailingBuckets(bucketSummary) ? 1 : 0,
    lines: [
      `Behavior coverage entries: ${String(request.entries.length)}`,
      `Behavior coverage primitive coverage: ${String(coveredSourcePrimitives.length)}/${String(sourcePrimitives.length)}`,
      `Behavior coverage inventory primitive coverage: ${String(coveredInventoryPrimitives.length)}/${String(inventoryPrimitiveTypes.length)}`,
      `Behavior coverage passed scenarios: ${String(passedScenarioCount)}`,
      `Behavior coverage failed scenarios: ${String(failedScenarioCount)}`,
      `Behavior coverage skipped scenarios: ${String(skippedScenarioCount)}`,
      `Behavior coverage probe failures: ${String(probeFailures.length)}`,
      ...manifestViewReport.lines,
      ...bucketLines(bucketSummary),
      ...coveredSourcePrimitives.map(
        (primitive) => `Behavior coverage covered primitive: ${primitive}`,
      ),
      ...missingSourcePrimitives.map(
        (primitive) => `Behavior coverage missing primitive: ${primitive}`,
      ),
      ...coveredInventoryPrimitives.map(
        (primitive) =>
          `Behavior coverage inventory covered primitive: ${primitive}`,
      ),
      ...missingInventoryPrimitives.map(
        (primitive) =>
          `Behavior coverage inventory missing primitive: ${primitive}`,
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
      ...entryResultLines(entryResults),
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
      "Behavior coverage inventory primitive coverage: 0/0",
      "Behavior coverage passed scenarios: 0",
      "Behavior coverage failed scenarios: 0",
      "Behavior coverage skipped scenarios: 0",
      "Behavior coverage probe failures: 0",
      "Manifest view probe entries: 0",
      "Manifest view probe passed: 0",
      "Manifest view probe failed: 0",
      "Manifest view probe skipped: 0",
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
    manifestViewFailed: 0,
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
  `Behavior coverage bucket manifestViewFailed: ${String(summary.manifestViewFailed)}`,
  `Behavior coverage bucket sourceFailed: ${String(summary.sourceFailed)}`,
];

const hasFailingBuckets = (summary: BehaviorCoverageBucketSummary): boolean =>
  summary.scenarioFailed > 0 ||
  summary.materializationFailed > 0 ||
  summary.manifestViewFailed > 0 ||
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

const entryResultLines = (
  entryResults: readonly BehaviorCoverageEntryResult[],
): readonly string[] =>
  [...entryResults]
    .sort((left, right) => {
      const bucketDelta =
        bucketOrder.indexOf(left.bucket) - bucketOrder.indexOf(right.bucket);
      return bucketDelta === 0
        ? left.label.localeCompare(right.label)
        : bucketDelta;
    })
    .map((entry) => {
      const detail = entry.reason ?? entry.primitiveTypes.join(", ");
      return `Behavior coverage entry ${entry.bucket}: ${entry.label} - ${detail}`;
    });

const bucketOrder: readonly BehaviorCoverageBucket[] = [
  "materializationFailed",
  "manifestViewFailed",
  "sourceFailed",
  "scenarioFailed",
  "scenarioMissing",
  "behaviorPassed",
];

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const incrementCount = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const probeFailureReason = (lines: readonly string[]): string =>
  lines.find((line) => line !== "Behavior probe: failed") ??
  "Behavior probe failed";
