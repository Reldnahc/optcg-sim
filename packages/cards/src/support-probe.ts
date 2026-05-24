import { createSupportProbeReport } from "./support-probe-report.js";

interface ProbeArgs {
  readonly text: string | undefined;
  readonly cardId: string | undefined;
}

function parseArgs(argv: readonly string[]): ProbeArgs {
  const passthroughIndex = argv.indexOf("--");
  const args = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
  const textIndex = args.indexOf("--text");
  const cardIndex = args.indexOf("--card");

  return {
    text: textIndex >= 0 ? args[textIndex + 1] : undefined,
    cardId: cardIndex >= 0 ? args[cardIndex + 1] : undefined,
  };
}

function main(): number {
  const { cardId, text } = parseArgs(process.argv.slice(2));
  const report = createSupportProbeReport({
    ...(cardId === undefined ? {} : { cardId }),
    ...(text === undefined ? {} : { text }),
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

process.exitCode = main();
