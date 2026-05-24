import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";

interface ProbeArgs {
  readonly text: string | undefined;
}

function parseArgs(argv: readonly string[]): ProbeArgs {
  const passthroughIndex = argv.indexOf("--");
  const args = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : argv;
  const textIndex = args.indexOf("--text");

  return {
    text: textIndex >= 0 ? args[textIndex + 1] : undefined,
  };
}

function main(): number {
  const { text } = parseArgs(process.argv.slice(2));
  if (text === undefined || text.length === 0) {
    writeError("Usage: support:probe -- --text <effect line>");
    return 1;
  }

  const result = parseCardEffectLineDetailed(text);
  if (!result.ok) {
    writeLine("Parse: failed");
    writeLine(`Stage: ${result.diagnostic.stage}`);
    writeLine(`Reason: ${result.diagnostic.reason}`);
    writeLine(`Text: ${result.diagnostic.text}`);
    return 1;
  }

  writeLine("Parse: passed");
  writeLine(`Trigger: ${result.value.block.trigger.type}`);
  writeLine(`Category: ${result.value.block.category}`);
  writeLine(`Source presence: ${result.value.block.sourcePresencePolicy}`);
  if (result.value.block.oncePerTurn === true) {
    writeLine("Once per turn: true");
  }
  writeLine("Evidence:");
  for (const evidence of result.value.evidence) {
    writeLine(`- ${evidence}`);
  }

  return 0;
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

process.exitCode = main();
