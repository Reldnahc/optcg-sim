import { createMasterProbeReport } from "./master-probe.js";
import { fetchPoneglyphCard } from "./poneglyph-card-source.js";
import { createThrottledPoneglyphFetch } from "./poneglyph-throttled-fetch.js";

interface MasterProbeCliArgs {
  readonly baseUrl?: string;
}

const usage = "Usage: master:probe [-- --base-url <url>]";
export const masterProbeFetchDelayMs = 50;
export const masterProbeRetryDelaysMs = [2000, 4000, 8000] as const;

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
    fetchPoneglyph: createThrottledPoneglyphFetch(fetchPoneglyphCard, {
      delayMs: masterProbeFetchDelayMs,
      retryDelaysMs: masterProbeRetryDelaysMs,
    }),
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
  const parsed = parseArgs(argsAfterPassthrough(process.argv.slice(2)));
  if (!parsed.ok) {
    writeError(parsed.error);
    return 1;
  }
  const report = await createMasterProbeReport({
    ...(parsed.args.baseUrl === undefined
      ? {}
      : { baseUrl: parsed.args.baseUrl }),
    fetchPoneglyph: createThrottledPoneglyphFetch(fetchPoneglyphCard, {
      delayMs: masterProbeFetchDelayMs,
      retryDelaysMs: masterProbeRetryDelaysMs,
    }),
    onProgress: writeProgress,
  });
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

const writeProgress = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

if (process.argv[1]?.endsWith("master-probe-cli.ts") === true) {
  process.exitCode = await main();
}
