import { createSpotlightProbeReport } from "./spotlight-probe-report.js";

interface ProbeArgs {
  readonly cardId: string | undefined;
  readonly setCode: string | undefined;
}

function parseArgs(argv: readonly string[]): ProbeArgs {
  const passthroughIndex = argv.indexOf("--");
  const args = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
  const cardIndex = args.indexOf("--card");
  const setIndex = args.indexOf("--set");

  return {
    cardId: cardIndex >= 0 ? args[cardIndex + 1] : undefined,
    setCode: setIndex >= 0 ? args[setIndex + 1] : undefined,
  };
}

async function main(): Promise<number> {
  const { cardId, setCode } = parseArgs(process.argv.slice(2));
  const report = await createSpotlightProbeReport({
    ...(cardId === undefined ? {} : { cardId }),
    ...(setCode === undefined ? {} : { setCode }),
  });
  for (const line of report.lines) {
    writeLine(line);
  }
  for (const error of report.errors) {
    writeError(error);
  }

  return report.exitCode;
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

process.exitCode = await main();
