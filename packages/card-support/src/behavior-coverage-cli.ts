import { readFileSync } from "node:fs";

import {
  createBehaviorCoverageReport,
  type BehaviorCoverageReport,
} from "./behavior-coverage.js";
import { extractEngineEffectPrimitiveTypes } from "./engine-primitive-inventory.js";

export const createBehaviorCoverageCliReport = (
  argv: readonly string[],
): BehaviorCoverageReport => {
  const args = argsAfterPassthrough(argv);
  const texts = valuesForArg(args, "--text");
  if (texts.length === 0) {
    return {
      exitCode: 1,
      lines: [],
      errors: ["Usage: behavior:coverage -- --text <effect line>"],
      bucketSummary: {
        behaviorPassed: 0,
        scenarioMissing: 0,
        scenarioFailed: 0,
        materializationFailed: 0,
        sourceFailed: 0,
      },
      entryResults: [],
    };
  }

  const inventoryPrimitiveTypes = extractEngineEffectPrimitiveTypes({
    rootTypeName: "Effect",
    sourceFiles: [
      {
        fileName: "effects.ts",
        text: readFileSync(
          new URL("../../types/src/effects.ts", import.meta.url),
          "utf8",
        ),
      },
      {
        fileName: "effect-continuous.ts",
        text: readFileSync(
          new URL("../../types/src/effect-continuous.ts", import.meta.url),
          "utf8",
        ),
      },
    ],
  });

  return createBehaviorCoverageReport({
    inventoryPrimitiveTypes,
    entries: texts.map((text, index) => ({
      label: `text:${String(index + 1)}`,
      text,
    })),
  });
};

const argsAfterPassthrough = (argv: readonly string[]): readonly string[] => {
  const passthroughIndex = argv.indexOf("--");
  return passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
};

const valuesForArg = (
  args: readonly string[],
  name: string,
): readonly string[] => {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) {
      continue;
    }
    const value = args[index + 1];
    if (value !== undefined && value.length > 0) {
      values.push(value);
    }
  }
  return values;
};

const main = (): number => {
  const report = createBehaviorCoverageCliReport(process.argv.slice(2));
  for (const line of report.lines) {
    writeLine(line);
  }
  for (const error of report.errors) {
    writeError(error);
  }
  return report.exitCode;
};

const writeLine = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeError = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

if (process.argv[1]?.endsWith("behavior-coverage-cli.ts") === true) {
  process.exitCode = main();
}
