import { createMasterProbeReport } from "./master-probe.js";

interface MasterProbeCliArgs {
  readonly baseUrl?: string;
}

const usage = "Usage: master:probe [-- --base-url <url>]";

export const createMasterProbeCliReport = async (argv: readonly string[]) => {
  const parsed = parseArgs(argsAfterPassthrough(argv));
  if (!parsed.ok) {
    return {
      exitCode: 1,
      lines: [],
      errors: [parsed.error],
    };
  }
  return createMasterProbeReport({
    ...(parsed.args.baseUrl === undefined
      ? {}
      : { baseUrl: parsed.args.baseUrl }),
  });
};

const parseArgs = (
  args: readonly string[],
):
  | { readonly ok: true; readonly args: MasterProbeCliArgs }
  | { readonly ok: false; readonly error: string } => {
  if (args.length === 0) {
    return { ok: true, args: {} };
  }
  if (args.length === 2 && args[0] === "--base-url") {
    const baseUrl = args[1];
    return baseUrl === undefined
      ? { ok: false, error: usage }
      : { ok: true, args: { baseUrl } };
  }
  return { ok: false, error: usage };
};

const argsAfterPassthrough = (argv: readonly string[]): readonly string[] => {
  const passthroughIndex = argv.indexOf("--");
  return passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
};

const main = async (): Promise<number> => {
  const report = await createMasterProbeCliReport(process.argv.slice(2));
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

if (process.argv[1]?.endsWith("master-probe-cli.ts") === true) {
  process.exitCode = await main();
}
