import { createBehaviorProbeReport } from "./behavior-probe.js";

export interface BehaviorCoverageEntry {
  readonly label: string;
  readonly text: string;
}

export interface BehaviorCoverageRequest {
  readonly entries: readonly BehaviorCoverageEntry[];
  readonly inventoryPrimitiveTypes: readonly string[];
}

export interface BehaviorCoverageReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

export const createBehaviorCoverageReport = (
  request: BehaviorCoverageRequest,
): BehaviorCoverageReport => {
  const inventoryPrimitiveTypes = uniqueSorted(request.inventoryPrimitiveTypes);
  const coveredPrimitiveTypes = new Set<string>();
  const skippedReasons = new Map<string, number>();
  const probeFailures: string[] = [];
  let passedScenarioCount = 0;
  let failedScenarioCount = 0;
  let skippedScenarioCount = 0;

  for (const entry of request.entries) {
    const probe = createBehaviorProbeReport({ text: entry.text });
    if (probe.exitCode !== 0) {
      probeFailures.push(`${entry.label} - ${probeFailureReason(probe.lines)}`);
    }
    for (const scenario of probe.scenarios) {
      if (scenario.status === "passed") {
        passedScenarioCount += 1;
        for (const primitive of scenario.primitiveTypes) {
          coveredPrimitiveTypes.add(primitive);
        }
        continue;
      }
      if (scenario.status === "failed") {
        failedScenarioCount += 1;
        continue;
      }
      skippedScenarioCount += 1;
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
    exitCode: probeFailures.length === 0 ? 0 : 1,
    lines: [
      `Behavior coverage entries: ${String(request.entries.length)}`,
      `Behavior coverage primitive coverage: ${String(coveredInventoryPrimitives.length)}/${String(inventoryPrimitiveTypes.length)}`,
      `Behavior coverage passed scenarios: ${String(passedScenarioCount)}`,
      `Behavior coverage failed scenarios: ${String(failedScenarioCount)}`,
      `Behavior coverage skipped scenarios: ${String(skippedScenarioCount)}`,
      `Behavior coverage probe failures: ${String(probeFailures.length)}`,
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
  };
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const incrementCount = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const probeFailureReason = (lines: readonly string[]): string =>
  lines.find((line) => line !== "Behavior probe: failed") ??
  "Behavior probe failed";
