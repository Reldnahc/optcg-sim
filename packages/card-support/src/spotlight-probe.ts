import { createSpotlightProbeReport } from "./spotlight-probe-report.js";

interface ProbeArgs {
  readonly cardId: string | undefined;
  readonly setCodes: readonly string[];
}

function parseArgs(argv: readonly string[]): ProbeArgs {
  const passthroughIndex = argv.indexOf("--");
  const args = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
  const cardIndex = args.indexOf("--card");

  return {
    cardId: cardIndex >= 0 ? args[cardIndex + 1] : undefined,
    setCodes: valuesForRepeatedOption(args, "--set"),
  };
}

async function main(): Promise<number> {
  const { cardId, setCodes } = parseArgs(process.argv.slice(2));
  const report = await createSpotlightProbeReport({
    ...(cardId === undefined ? {} : { cardId }),
    ...(setCodes.length === 0 ? {} : { setCodes }),
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

function valuesForRepeatedOption(
  args: readonly string[],
  option: string,
): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === option) {
      const value = args[index + 1];
      if (value !== undefined) {
        values.push(value);
      }
    }
  }
  return values;
}

process.exitCode = await main();
