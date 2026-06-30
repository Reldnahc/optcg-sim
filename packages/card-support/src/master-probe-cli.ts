import { createMasterProbeReport } from "./master-probe.js";
import { fetchPoneglyphCard } from "./poneglyph-card-source.js";
import { createThrottledPoneglyphFetch } from "./poneglyph-throttled-fetch.js";

interface MasterProbeCliArgs {
  readonly baseUrl?: string;
  readonly setCodes: readonly string[];
}

const usage =
  "Usage: master:probe [-- --base-url <url>] [--set <set code> ...]";
export const masterProbeFetchDelayMs = 50;
export const masterProbeRetryDelaysMs = [2000, 4000, 8000] as const;

export const createMasterProbeCliReport = async (argv: readonly string[]) => {
  const parsed = parseMasterProbeCliArgs(argsAfterPassthrough(argv));
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
    ...(parsed.args.setCodes.length === 0
      ? {}
      : { setCodes: parsed.args.setCodes }),
    fetchPoneglyph: createThrottledPoneglyphFetch(fetchPoneglyphCard, {
      delayMs: masterProbeFetchDelayMs,
      retryDelaysMs: masterProbeRetryDelaysMs,
    }),
  });
};

export const parseMasterProbeCliArgs = (
  args: readonly string[],
):
  | { readonly ok: true; readonly args: MasterProbeCliArgs }
  | { readonly ok: false; readonly error: string } => {
  const setCodes: string[] = [];
  let baseUrl: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== "--base-url" && arg !== "--set") {
      return { ok: false, error: usage };
    }
    const value = args[index + 1];
    if (value === undefined || value === "--base-url" || value === "--set") {
      return { ok: false, error: usage };
    }
    if (arg === "--base-url") {
      if (baseUrl !== undefined) {
        return { ok: false, error: usage };
      }
      baseUrl = value;
    } else {
      setCodes.push(value);
    }
    index += 1;
  }
  return {
    ok: true,
    args: {
      ...(baseUrl === undefined ? {} : { baseUrl }),
      setCodes,
    },
  };
};

const argsAfterPassthrough = (argv: readonly string[]): readonly string[] => {
  const passthroughIndex = argv.indexOf("--");
  return passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
};

const main = async (): Promise<number> => {
  const parsed = parseMasterProbeCliArgs(
    argsAfterPassthrough(process.argv.slice(2)),
  );
  if (!parsed.ok) {
    writeError(parsed.error);
    return 1;
  }
  const report = await createMasterProbeReport({
    ...(parsed.args.baseUrl === undefined
      ? {}
      : { baseUrl: parsed.args.baseUrl }),
    ...(parsed.args.setCodes.length === 0
      ? {}
      : { setCodes: parsed.args.setCodes }),
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
