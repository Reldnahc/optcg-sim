import {
  createBehaviorProbeReport,
  type BehaviorProbeReport,
} from "./behavior-probe.js";

export const createBehaviorProbeCliReport = (
  argv: readonly string[],
): BehaviorProbeReport => {
  const args = argsAfterPassthrough(argv);
  const textIndex = args.indexOf("--text");
  const text = textIndex >= 0 ? args[textIndex + 1] : undefined;
  if (text === undefined || text.length === 0) {
    return {
      exitCode: 1,
      lines: [],
      errors: ["Usage: behavior:probe -- --text <effect line>"],
    };
  }
  return createBehaviorProbeReport({ text });
};

const argsAfterPassthrough = (argv: readonly string[]): readonly string[] => {
  const passthroughIndex = argv.indexOf("--");
  return passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
};

const main = (): number => {
  const report = createBehaviorProbeCliReport(process.argv.slice(2));
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

if (process.argv[1]?.endsWith("behavior-probe-cli.ts") === true) {
  process.exitCode = main();
}
