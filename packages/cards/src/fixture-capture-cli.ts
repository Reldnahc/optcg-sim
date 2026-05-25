import { capturePoneglyphFixtures } from "./fixture-capture.js";

interface CaptureArgs {
  readonly cardIds: readonly string[];
  readonly outDir?: string;
  readonly baseUrl?: string;
  readonly lang?: string;
  readonly dryRun: boolean;
}

const parseArgs = (argv: readonly string[]): CaptureArgs => {
  const passthroughIndex = argv.indexOf("--");
  const args = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
  const cardIds: string[] = [];
  let outDir: string | undefined;
  let baseUrl: string | undefined;
  let lang: string | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--card") {
      const value = args[index + 1];
      if (value !== undefined) {
        cardIds.push(value);
      }
      index += 1;
      continue;
    }
    if (arg === "--cards") {
      const value = args[index + 1];
      if (value !== undefined) {
        cardIds.push(...value.split(","));
      }
      index += 1;
      continue;
    }
    if (arg === "--out-dir") {
      outDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--base-url") {
      baseUrl = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--lang") {
      lang = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return {
    cardIds,
    ...(outDir === undefined ? {} : { outDir }),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(lang === undefined ? {} : { lang }),
    dryRun,
  };
};

const main = async (): Promise<number> => {
  const result = await capturePoneglyphFixtures(
    parseArgs(process.argv.slice(2)),
  );
  for (const line of result.lines) {
    process.stdout.write(`${line}\n`);
  }
  for (const error of result.errors) {
    process.stderr.write(`${error}\n`);
  }
  return result.exitCode;
};

process.exitCode = await main();
